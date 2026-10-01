import 'server-only';
import { MAX_BASKET_SERVINGS } from '@/lib/basket';
import {
  basketWeekOf,
  deleteBasketItem,
  insertBasketItem,
  installedCatalogSlugs,
  listBasket,
  updateBasketServings,
  type BasketItem,
} from '../db/queries/basket';
import { syncListToBasket } from './shopping';

/**
 * Service du panier de la semaine.
 *
 * Il ne fait presque rien, et c'est voulu : le panier est une liste de choix,
 * pas un calcul. Ce qu'il déclenche — l'installation des recettes, la liste de
 * courses, le plan — vit dans les services qui en ont la charge.
 *
 * Une chose lui revient pourtant : prévenir la liste de courses. Tout geste
 * qui change les repas de la semaine réaligne la liste ouverte qui en dépend,
 * faute de quoi elle réclamerait de quoi faire un plat pour deux alors qu'on
 * en attend quatre. La décision de ne pas réécrire une liste sous les yeux
 * tient toujours : ce qui est coché, écrit à la main ou déjà clos ne bouge
 * pas, et `syncListToBasket` en porte le détail.
 */

export type { BasketItem };
export { MAX_BASKET_SERVINGS };

export function basketFor(userId: number, weekStart: string): Promise<BasketItem[]> {
  return listBasket(userId, weekStart);
}

/** Les recettes déjà installées depuis le catalogue, indexées par `slug`. */
export function installedFor(userId: number): Promise<Map<string, number>> {
  return installedCatalogSlugs(userId);
}

export type BasketAddResult =
  | { kind: 'added'; id: number }
  | { kind: 'invalid' }
  | { kind: 'not_found' };

/**
 * Met une recette du carnet au panier de la semaine.
 *
 * Distinct de `chooseCatalogMeals`, qui part d'un `slug` et installe la
 * recette au passage. Ici elle existe déjà — c'est la sienne, écrite à la
 * main — et il n'y a rien à installer. Sans cette porte, une recette écrite à
 * la main ne pourrait jamais rejoindre la liste de courses, puisque celle-ci
 * se déduit du panier.
 */
export async function addRecipeToBasket(
  userId: number,
  weekStart: string,
  recipeId: number,
  servings: number,
): Promise<BasketAddResult> {
  if (!Number.isFinite(servings) || servings <= 0 || servings > MAX_BASKET_SERVINGS) {
    return { kind: 'invalid' };
  }
  const id = await insertBasketItem(userId, weekStart, recipeId, servings);
  // `null` signifie que la recette n'est pas la sienne : introuvable, et non
  // interdit, pour ne pas confirmer l'existence d'une recette d'un autre compte.
  if (id === null) {
    return { kind: 'not_found' };
  }

  await syncListToBasket(userId, weekStart);
  return { kind: 'added', id };
}

export type BasketUpdateResult = 'updated' | 'invalid' | 'not_found';

export async function setBasketServings(
  userId: number,
  id: number,
  servings: number,
): Promise<BasketUpdateResult> {
  if (!Number.isFinite(servings) || servings <= 0 || servings > MAX_BASKET_SERVINGS) {
    return 'invalid';
  }
  if (!(await updateBasketServings(userId, id, servings))) {
    return 'not_found';
  }

  const weekStart = await basketWeekOf(userId, id);
  if (weekStart !== null) {
    await syncListToBasket(userId, weekStart);
  }
  return 'updated';
}

export async function removeFromBasket(userId: number, id: number): Promise<boolean> {
  // La semaine se lit avant la suppression : après, la ligne qui la portait
  // n'existe plus et la liste à réaligner serait introuvable.
  const weekStart = await basketWeekOf(userId, id);
  if (!(await deleteBasketItem(userId, id))) {
    return false;
  }

  if (weekStart !== null) {
    await syncListToBasket(userId, weekStart);
  }
  return true;
}
