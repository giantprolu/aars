import 'server-only';
import { quantityForServings, type Recipe } from '@/lib/recipe';
import { isValidQuantity } from '@/lib/nutrition';
import { ingredientKey } from '@/lib/shopping';
import { MAX_PLANNED_SERVINGS } from '@/lib/basket';
import { todayInParis } from '@/lib/date';
import type { Macros } from '@/lib/types';
import type { Meal } from '@/lib/meal';
import { boughtProductsFor, type BoughtProduct } from '../db/queries/shopping';
import { findRecipe } from '../db/queries/recipes';
import { recordEntry } from './entries';

/**
 * Porter un plat au journal.
 *
 * Deux chemins mènent ici, et un seul calcul les sert : le plat prévu qu'on
 * marque mangé (`meal-plan`), et le plat qu'on ajoute directement au journal
 * depuis l'écran d'ajout. Ce sont deux intentions — l'une clôt une semaine
 * préparée, l'autre enregistre ce qu'on vient de manger — mais la conversion
 * en lignes de journal est la même opération, et deux copies auraient fini par
 * arrondir les parts différemment ou par oublier l'une des substitutions.
 *
 * Ce module ne décide jamais de l'unicité d'une écriture : le verrou du plan
 * vit dans `meal-plan`, qui sait ce qu'il garde. Ici on calcule, puis on écrit
 * ce qu'on nous demande d'écrire.
 */

export { MAX_PLANNED_SERVINGS };

/** Une ligne prête à être écrite : sa fiche est résolue, sa quantité valide. */
export interface JournalableIngredient {
  label: string;
  quantityG: number;
  per100g: Macros;
  refKind: 'ciqual' | 'product';
  refValue: string;
}

/**
 * Les ingrédients d'une recette, mis à l'échelle des parts réellement mangées,
 * et remplacés par les produits réellement achetés quand on les connaît.
 *
 * La substitution est le point où les courses rejoignent le journal. Un
 * ingrédient scanné en rayon a fait retenir sa marque ; c'est elle qui compte
 * désormais, et non la moyenne CIQUAL. Un steak haché 5 % de marque n'a pas
 * les mêmes valeurs que la moyenne d'une table de composition, et sur un repas
 * répété trois fois par semaine l'écart finit par se voir sur la balance.
 *
 * Le libellé reste celui de la recette, alors que les macros et la référence
 * viennent du produit. Le journal doit rester lisible : « Steak haché 5 % »
 * dit ce qu'on a mangé mieux que la désignation commerciale complète, qui peut
 * tenir sur trois lignes.
 *
 * Un ingrédient sans fiche est écarté plutôt que journalisé à zéro : compter
 * zéro calorie pour un aliment qu'on a mangé est un mensonge, l'omettre et le
 * dire est une lacune. Les deux donnent un total trop bas, mais seul le second
 * se voit.
 */
function scaledIngredients(
  recipe: Recipe,
  servings: number,
  bought: Map<string, BoughtProduct>,
): { journaled: JournalableIngredient[]; skipped: string[] } {
  const journaled: JournalableIngredient[] = [];
  const skipped: string[] = [];

  for (const ingredient of recipe.ingredients) {
    const quantityG = quantityForServings(ingredient.quantityG, recipe.servings, servings);
    const substitute = bought.get(ingredientKey(ingredient.refKind, ingredient.refValue));
    const per100g = substitute?.per100g ?? ingredient.per100g;

    if (per100g === null || per100g === undefined || !isValidQuantity(quantityG)) {
      skipped.push(ingredient.label);
      continue;
    }

    journaled.push({
      label: ingredient.label,
      quantityG,
      per100g,
      refKind: substitute === undefined ? ingredient.refKind : 'product',
      refValue: substitute === undefined ? ingredient.refValue : substitute.barcode,
    });
  }

  return { journaled, skipped };
}

/**
 * Ce qu'une recette donnerait au journal pour un nombre de parts, sans rien
 * écrire encore.
 *
 * Séparé de l'écriture parce que l'appelant a le droit de regarder avant
 * d'agir : le plan doit savoir qu'il y a quelque chose à inscrire avant de
 * marquer le plat mangé, sans quoi il le clôt sur un journal resté vide.
 */
export async function journalableIngredients(
  userId: number,
  recipe: Recipe,
  servings: number,
): Promise<{ journaled: JournalableIngredient[]; skipped: string[] }> {
  // Les produits achetés sont chargés en une requête, pour toute la recette.
  const bought = await boughtProductsFor(
    userId,
    recipe.ingredients.map((ingredient) =>
      ingredientKey(ingredient.refKind, ingredient.refValue),
    ),
  );
  return scaledIngredients(recipe, servings, bought);
}

/**
 * Écrit les lignes, une par ingrédient, et rend ce qui n'a pas pu l'être.
 *
 * Un refus d'écriture ne fait pas échouer les suivantes : mieux vaut un repas
 * à qui manque une ligne, dite manquante, qu'un repas entier perdu parce qu'un
 * ingrédient a trébuché.
 */
export async function writeIngredients(
  userId: number,
  ingredients: readonly JournalableIngredient[],
  entryDate: string,
  meal: Meal,
): Promise<{ created: number; skipped: string[] }> {
  let created = 0;
  const skipped: string[] = [];

  for (const ingredient of ingredients) {
    const result = await recordEntry({
      userId,
      foodLabel: ingredient.label,
      per100g: ingredient.per100g,
      quantityG: ingredient.quantityG,
      sourceKind: ingredient.refKind,
      sourceRef: ingredient.refValue,
      entryDate,
      meal,
    });
    if (result.kind === 'created') {
      created += 1;
    } else {
      skipped.push(ingredient.label);
    }
  }

  return { created, skipped };
}

export type JournalRecipeResult =
  /** `skipped` porte les ingrédients sans fiche : le total du jour est incomplet. */
  | { kind: 'journaled'; created: number; skipped: string[] }
  | { kind: 'nothing_to_journal' }
  | { kind: 'invalid' }
  | { kind: 'not_found' };

/**
 * Inscrit un plat du carnet au journal, un ingrédient par ligne.
 *
 * La date n'est pas un paramètre du client : on ajoute ce qu'on vient de
 * manger, et laisser l'appelant désigner un jour ouvrirait la réécriture du
 * passé par une porte que rien d'autre n'emprunte. Le plan, lui, connaît la
 * sienne et la passe explicitement.
 *
 * Aucun verrou : contrairement au plat prévu, rien ici n'est à clore. Manger
 * deux fois le même plat dans la journée est ordinaire, et un second appui
 * serait une seconde assiette, pas un doublon à écarter.
 */
export async function journalRecipe(
  userId: number,
  input: { recipeId: number; servings: number; meal: Meal },
): Promise<JournalRecipeResult> {
  if (
    !Number.isFinite(input.servings) ||
    input.servings <= 0 ||
    input.servings > MAX_PLANNED_SERVINGS
  ) {
    return { kind: 'invalid' };
  }

  // `null` signifie que la recette n'est pas la sienne : introuvable, et non
  // interdit, pour ne pas confirmer l'existence d'une recette d'un autre compte.
  const recipe = await findRecipe(userId, input.recipeId);
  if (recipe === null) {
    return { kind: 'not_found' };
  }

  const { journaled, skipped } = await journalableIngredients(userId, recipe, input.servings);
  if (journaled.length === 0) {
    return { kind: 'nothing_to_journal' };
  }

  const written = await writeIngredients(userId, journaled, todayInParis(), input.meal);
  return {
    kind: 'journaled',
    created: written.created,
    skipped: [...skipped, ...written.skipped],
  };
}
