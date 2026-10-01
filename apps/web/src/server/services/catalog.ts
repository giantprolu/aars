import 'server-only';
import { findCatalogMeal, type CatalogMeal } from '@/lib/meal-catalog';
import type { RecipeIngredientInput } from '@/lib/recipe';
import { insertRecipe } from '../db/queries/recipes';
import { installedCatalogSlugs, insertBasketItem } from '../db/queries/basket';
import { searchReferenceFoods } from '../db/queries/search';
import { syncListToBasket } from './shopping';

/**
 * Service du catalogue : choisir des plats, et ce que ce choix engendre.
 *
 * Choisir un plat fait deux choses, dans cet ordre : installer la recette si
 * elle ne l'est pas encore, puis la mettre au panier de la semaine. Les deux
 * sont ici et non dans l'écran parce que ce sont des écritures, et qu'elles
 * doivent pouvoir se rejouer sans rien dédoubler — un doigt qui appuie deux
 * fois sur « Ajouter » est la règle, pas l'exception.
 */

/** Au-delà, ce n'est plus un choix de semaine mais un import du catalogue. */
export const MAX_CHOSEN_MEALS = 40;

/**
 * Nombre de recherches CIQUAL menées de front.
 *
 * Bornée parce qu'un choix de dix plats représente une cinquantaine de
 * termes : tout lancer d'un coup saturerait le pilote HTTP de Neon pour un
 * gain nul, les requêtes se mettant alors en file côté serveur.
 */
const SEARCH_CONCURRENCY = 8;

export interface ChooseMealsReport {
  /** Plats effectivement au panier au terme de l'opération. */
  chosen: number;
  /** Recettes créées à cette occasion ; les autres étaient déjà installées. */
  installed: number;
  /**
   * Plats qu'on n'a pas pu installer, désignés par leur nom : aucun de leurs
   * ingrédients n'a trouvé de fiche. Dits plutôt que tus, comme partout.
   */
  failed: string[];
  /** Ingrédients sans fiche, absents des recettes installées. */
  skippedIngredients: string[];
}

/**
 * Résout une série de termes de recherche en fiches de référence.
 *
 * Les termes sont dédoublonnés avant d'être cherchés : « huile d'olive »
 * revient dans un plat sur deux, et le chercher dix fois coûterait dix
 * requêtes pour une réponse identique.
 */
async function resolveTerms(
  terms: readonly string[],
): Promise<Map<string, { refKind: 'ciqual' | 'product'; refValue: string }>> {
  const distinct = [...new Set(terms)];
  const resolved = new Map<string, { refKind: 'ciqual' | 'product'; refValue: string }>();

  for (let index = 0; index < distinct.length; index += SEARCH_CONCURRENCY) {
    const batch = distinct.slice(index, index + SEARCH_CONCURRENCY);
    const hits = await Promise.all(
      batch.map(async (term) => {
        const [best] = await searchReferenceFoods(term, 1);
        return best ?? null;
      }),
    );

    batch.forEach((term, position) => {
      const hit = hits[position];
      if (hit) {
        resolved.set(term, { refKind: hit.kind, refValue: hit.ref });
      }
    });
  }

  return resolved;
}

/**
 * Les ingrédients d'un plat prêts à écrire, et ceux qu'on a dû laisser.
 *
 * Un ingrédient qu'aucune fiche ne sert est omis et rapporté, jamais remplacé
 * par une valeur approchante. Un ingrédient absent se voit sur la recette et
 * se corrige en dix secondes ; un ingrédient silencieusement remplacé par le
 * premier résultat venu fausse toutes les journées à venir sans qu'on sache
 * pourquoi.
 */
function buildIngredients(
  meal: CatalogMeal,
  resolved: Map<string, { refKind: 'ciqual' | 'product'; refValue: string }>,
): { ingredients: RecipeIngredientInput[]; skipped: string[] } {
  const ingredients: RecipeIngredientInput[] = [];
  const skipped: string[] = [];

  for (const ingredient of meal.ingredients) {
    const reference = resolved.get(ingredient.searchTerm);
    if (reference === undefined) {
      skipped.push(ingredient.label);
      continue;
    }
    ingredients.push({
      refKind: reference.refKind,
      refValue: reference.refValue,
      label: ingredient.label,
      quantityG: ingredient.quantityG,
      unitName: ingredient.unitName ?? null,
      unitGrams: ingredient.unitGrams ?? null,
    });
  }

  return { ingredients, skipped };
}

/**
 * Installe les plats demandés et les met au panier de la semaine.
 *
 * Les plats déjà installés ne sont pas réécrits : leur recette appartient
 * désormais à l'utilisateur, qui a pu la modifier. La réinstaller au motif
 * qu'il la choisit une seconde fois effacerait ses corrections sans prévenir.
 */
export async function chooseCatalogMeals(
  userId: number,
  weekStart: string,
  slugs: readonly string[],
): Promise<ChooseMealsReport> {
  const report: ChooseMealsReport = {
    chosen: 0,
    installed: 0,
    failed: [],
    skippedIngredients: [],
  };

  // Les `slug` sont dédoublonnés avant tout : un même plat demandé deux fois
  // n'occupe qu'une ligne de panier, et le compte rendu doit dire trois plats
  // quand il y en a trois, pas quatre parce que le doigt a glissé.
  const meals = [...new Set(slugs)]
    .map((slug) => findCatalogMeal(slug))
    .filter((meal): meal is CatalogMeal => meal !== null);
  if (meals.length === 0) {
    return report;
  }

  const alreadyInstalled = await installedCatalogSlugs(userId);
  const toInstall = meals.filter((meal) => !alreadyInstalled.has(meal.slug));

  // Une seule passe de résolution pour tout le lot : les plats partagent
  // largement leurs ingrédients, et les chercher plat par plat multiplierait
  // les requêtes par trois pour la même réponse.
  const resolved = await resolveTerms(
    toInstall.flatMap((meal) => meal.ingredients.map((ingredient) => ingredient.searchTerm)),
  );

  for (const meal of meals) {
    let recipeId = alreadyInstalled.get(meal.slug);

    if (recipeId === undefined) {
      const { ingredients, skipped } = buildIngredients(meal, resolved);
      report.skippedIngredients.push(...skipped);

      // Une recette dont plus rien ne se résout n'aurait aucun total : mieux
      // vaut ne pas la créer que d'en laisser une coquille à supprimer.
      if (ingredients.length === 0) {
        report.failed.push(meal.name);
        continue;
      }

      recipeId = await insertRecipe(
        userId,
        {
          name: meal.name,
          servings: meal.servings,
          steps: [...meal.steps],
          prepMinutes: meal.prepMinutes,
          notes: null,
          ingredients,
        },
        meal.slug,
      );
      alreadyInstalled.set(meal.slug, recipeId);
      report.installed += 1;
    }

    const basketId = await insertBasketItem(userId, weekStart, recipeId, meal.servings);
    if (basketId === null) {
      report.failed.push(meal.name);
      continue;
    }
    report.chosen += 1;
  }

  // Une liste de courses déjà ouverte sur cette semaine suit les plats qu'on
  // vient d'y ajouter : une seule passe à la fin, et non par plat, le calcul
  // portant de toute façon sur le panier entier.
  if (report.chosen > 0) {
    await syncListToBasket(userId, weekStart);
  }

  return report;
}
