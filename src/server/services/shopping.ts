import 'server-only';
import { aisleFor, type Aisle } from '@/lib/aisle';
import { quantityForServings, rawGrams } from '@/lib/recipe';
import {
  aggregateNeeds,
  ingredientKey,
  planListSync,
  type AggregatedNeed,
  type ShoppingNeed,
} from '@/lib/shopping';
import { shiftDate } from '@/lib/date';
import {
  boughtProductsFor,
  closeShoppingList,
  deleteShoppingItem,
  deleteShoppingItems,
  forgetIngredientProduct,
  groupCodesFor,
  insertGeneratedItems,
  insertShoppingItem,
  insertShoppingList,
  openShoppingListFor,
  rememberIngredientProduct,
  setItemChecked,
  shoppingListForWeek,
  updateShoppingItemNeed,
  type ShoppingList,
} from '../db/queries/shopping';
import { basketRecipesBetween, basketWeeksForRecipe } from '../db/queries/basket';
import { findRecipe } from '../db/queries/recipes';
import { WEEK_LENGTH } from './meal-plan';

/**
 * Service de la liste de courses.
 *
 * Il fait deux choses : transformer un plan en liste, et retenir ce qu'on a
 * réellement acheté. La seconde est la moins visible et la plus utile — c'est
 * elle qui fait qu'un journal finit par décrire le steak haché du placard et
 * non la moyenne d'une table de composition.
 */

export type { ShoppingList };

/**
 * La liste de la semaine consultée, ou `null` s'il n'y en a pas encore.
 *
 * La semaine est demandée et non déduite : l'écran des courses s'ouvre depuis
 * une semaine précise — celle du panier qu'on veut couvrir — et lui rendre la
 * dernière liste tous comptes faits lui montrait les courses d'une autre.
 */
export function listForWeek(userId: number, weekStart: string): Promise<ShoppingList | null> {
  return shoppingListForWeek(userId, weekStart);
}

/**
 * Engendre une liste depuis le panier de la semaine.
 *
 * Depuis le panier et non depuis le plan, et c'est le point d'articulation de
 * tout le parcours : on choisit des plats, on achète de quoi les faire, et ce
 * n'est qu'ensuite qu'on décide quel soir chacun passe à table. L'inverse —
 * remplir sept jours avant d'aller au supermarché — demandait de savoir le
 * samedi à quelle heure on rentrerait le mardi.
 *
 * Les ingrédients sans fiche sont gardés, contrairement à ce que fait la
 * journalisation. Les deux traitements divergent parce que leurs erreurs
 * divergent : journaliser un ingrédient sans macros fausserait un total, alors
 * qu'une liste de courses n'a besoin que d'un nom et d'une quantité. Oublier
 * de l'acheter, en revanche, se paie au moment de cuisiner.
 */
export async function generateList(
  userId: number,
  fromDate: string,
  toDate: string = shiftDate(fromDate, WEEK_LENGTH - 1),
): Promise<ShoppingList | null> {
  const needs = await computeNeeds(userId, fromDate, toDate);
  if (needs.length === 0) {
    return null;
  }

  await insertShoppingList(userId, fromDate, toDate, needs);
  return shoppingListForWeek(userId, fromDate);
}

/**
 * Ce que le panier d'une période réclame, agrégé et rangé par rayon.
 *
 * Extrait de `generateList` parce que deux appelants en ont besoin : celui qui
 * crée une liste, et celui qui réaligne une liste ouverte sur un panier qui a
 * changé. Les faire diverger donnerait une liste refaite et une liste suivie
 * qui ne comptent pas pareil.
 */
async function computeNeeds(
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<AggregatedNeed[]> {
  const chosen = await basketRecipesBetween(userId, fromDate, toDate);

  // Les recettes sont chargées une fois chacune : un plat qui figure dans deux
  // paniers successifs ne doit pas coûter deux lectures.
  const recipeIds = [...new Set(chosen.map((entry) => entry.recipeId))];
  const recipes = new Map(
    (await Promise.all(recipeIds.map((id) => findRecipe(userId, id))))
      .filter((recipe) => recipe !== null)
      .map((recipe) => [recipe.id, recipe]),
  );

  const raw: (Omit<ShoppingNeed, 'aisle'> & { aisle: Aisle | null })[] = [];
  for (const entry of chosen) {
    const recipe = recipes.get(entry.recipeId);
    if (recipe === undefined) {
      continue;
    }
    for (const ingredient of recipe.ingredients) {
      const quantityG = quantityForServings(
        ingredient.quantityG,
        recipe.servings,
        entry.servings,
      );
      if (quantityG <= 0) {
        continue;
      }
      raw.push({
        refKind: ingredient.refKind,
        refValue: ingredient.refValue,
        label: ingredient.label,
        // On achète le riz cru, pas cuit : un ingrédient écrit au poids cuit
        // passe ici au poids qu'on met dans le panier. Les macros, elles,
        // restent calculées sur le poids cuit, celui qu'on mange.
        quantityG: rawGrams(quantityG, ingredient.cookedYield),
        unitName: ingredient.unitName,
        unitGrams: ingredient.unitGrams,
        aisle: null,
      });
    }
  }

  if (raw.length === 0) {
    return [];
  }

  // Le rayon vient du groupe alimentaire de l'ANSES, chargé en une requête
  // pour tous les codes à la fois.
  const groups = await groupCodesFor(
    raw.filter((need) => need.refKind === 'ciqual').map((need) => need.refValue),
  );

  const needs: ShoppingNeed[] = raw.map((need) => ({
    ...need,
    aisle: aisleFor(
      need.label,
      need.refKind === 'ciqual' ? (groups.get(need.refValue) ?? null) : null,
    ),
  }));

  return aggregateNeeds(needs);
}

/**
 * Réaligne la liste ouverte d'une semaine sur son panier.
 *
 * Appelée après chaque geste qui change les repas de la semaine — les parts
 * d'un plat, un plat ajouté, un plat retiré. Sans elle, monter un plat de deux
 * à quatre parts laissait la liste réclamer de quoi en faire deux, et rien à
 * l'écran ne disait qu'elle avait vieilli.
 *
 * Seule la liste ouverte de cette semaine est touchée. Une liste close raconte
 * des courses déjà faites et ne bouge plus. Ce qui survit à la mise à jour —
 * l'article écrit à la main, l'article déjà coché — est décidé par
 * `planListSync`, fonction pure, avec ses raisons.
 */
export async function syncListToBasket(userId: number, weekStart: string): Promise<void> {
  const list = await openShoppingListFor(userId, weekStart);
  if (list === null) {
    return;
  }

  const plan = planListSync(list.items, await computeNeeds(userId, list.fromDate, list.toDate));

  for (const { id, need } of plan.update) {
    await updateShoppingItemNeed(userId, id, need);
  }
  await deleteShoppingItems(userId, plan.remove);
  await insertGeneratedItems(userId, list.id, plan.insert);
}

/**
 * Réaligne les listes ouvertes que cette recette alimente.
 *
 * Appelée quand la recette elle-même change — un ingrédient corrigé, une
 * quantité revue, un nombre de parts qui passe de quatre à deux. Sans elle,
 * seuls les gestes du panier faisaient bouger la liste, et corriger une
 * recette laissait en rayon les quantités d'avant la correction : on achetait
 * pour un plat qu'on n'allait plus faire ainsi.
 *
 * Une recette peut figurer aux paniers de plusieurs semaines. Toutes sont
 * réalignées, la synchronisation ne touchant que celles dont la liste est
 * encore ouverte.
 */
export async function syncListsForRecipe(userId: number, recipeId: number): Promise<void> {
  await syncListsForWeeks(userId, await basketWeeksForRecipe(userId, recipeId));
}

/**
 * Réaligne les listes ouvertes de plusieurs semaines.
 *
 * Distincte de `syncListsForRecipe` pour un seul cas, celui de la suppression :
 * la cascade emporte les lignes de panier, et les semaines à réaligner doivent
 * donc être lues avant, quand la recette existe encore.
 */
export async function syncListsForWeeks(
  userId: number,
  weekStarts: readonly string[],
): Promise<void> {
  for (const weekStart of weekStarts) {
    await syncListToBasket(userId, weekStart);
  }
}

export function closeList(userId: number, listId: number): Promise<boolean> {
  return closeShoppingList(userId, listId);
}

export function removeItem(userId: number, itemId: number): Promise<boolean> {
  return deleteShoppingItem(userId, itemId);
}

export function addItem(
  userId: number,
  listId: number,
  item: {
    refKind: 'ciqual' | 'product';
    refValue: string;
    label: string;
    quantityG: number;
    aisle: Aisle;
  },
): Promise<number | null> {
  return insertShoppingItem(userId, listId, item);
}

export interface CheckItemInput {
  itemId: number;
  checked: boolean;
  /** Code-barres scanné en rayon, si l'article a été coché au scanner. */
  barcode: string | null;
  /** Référence de l'article, pour mémoriser le produit acheté. */
  refKind: 'ciqual' | 'product';
  refValue: string;
}

/**
 * Coche un article, et retient le produit scanné pour cet ingrédient.
 *
 * C'est le geste qui relie les courses au journal. Scanner le paquet qu'on met
 * dans le chariot ne fait pas que cocher une ligne : il dit quelle fiche
 * emploieront les prochains repas construits sur cet ingrédient.
 *
 * Décocher oublie la liaison. Un article décoché n'a pas été acheté, et le
 * produit qu'on avait scanné n'a donc pas à décider des macros à venir.
 */
export async function checkItem(userId: number, input: CheckItemInput): Promise<boolean> {
  const updated = await setItemChecked(userId, input.itemId, input.checked, input.barcode);
  if (!updated) {
    return false;
  }

  const key = ingredientKey(input.refKind, input.refValue);
  if (input.checked && input.barcode !== null) {
    await rememberIngredientProduct(userId, key, input.barcode);
  } else if (!input.checked) {
    await forgetIngredientProduct(userId, key);
  }
  return true;
}

/** Les produits achetés pour une série d'ingrédients, indexés par leur clé. */
export function boughtProducts(userId: number, keys: readonly string[]) {
  return boughtProductsFor(userId, keys);
}
