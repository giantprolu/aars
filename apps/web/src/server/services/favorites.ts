import 'server-only';
import { todayInParis } from '@/lib/date';
import {
  MAX_FAVORITE_ITEMS,
  MAX_FAVORITE_NAME,
  suggestFavoriteName,
  type FavoriteItem,
  type FavoriteMeal,
} from '@/lib/favorites';
import type { Meal } from '@/lib/meal';
import { insertEntries, listEntriesForDate } from '../db/queries/entries';
import {
  deleteFavorite,
  findFavorite,
  insertFavorite,
  listFavorites,
} from '../db/queries/favorites';
import { canAddFavorite } from './premium';

/**
 * Service des repas favoris.
 *
 * Un favori se crée depuis le journal et non depuis un formulaire : on met en
 * favori le petit-déjeuner qu'on vient de noter, pas un repas qu'on décrirait
 * de mémoire. Le serveur relit donc les entrées lui-même plutôt que de croire
 * une liste d'aliments envoyée par le navigateur.
 */

export type { FavoriteMeal };

export function favoritesFor(userId: number): Promise<FavoriteMeal[]> {
  return listFavorites(userId);
}

export type SaveFavoriteResult =
  | { kind: 'saved'; favorite: FavoriteMeal }
  | { kind: 'empty' }
  | { kind: 'too_large' }
  | { kind: 'premium_required' };

/** Met en favori un repas du journal du jour, tel qu'il y est écrit. */
export async function saveMealAsFavorite(
  userId: number,
  meal: Meal,
  name: string | null,
): Promise<SaveFavoriteResult> {
  const entries = (await listEntriesForDate(userId, todayInParis())).filter(
    (entry) => entry.meal === meal,
  );
  if (entries.length === 0) {
    return { kind: 'empty' };
  }
  if (entries.length > MAX_FAVORITE_ITEMS) {
    return { kind: 'too_large' };
  }
  if (!(await canAddFavorite(userId))) {
    return { kind: 'premium_required' };
  }

  const items: FavoriteItem[] = entries.map((entry) => ({
    foodLabel: entry.foodLabel,
    quantityG: entry.quantityG,
    macros: entry.macros,
    sourceKind: entry.sourceKind,
    sourceRef: entry.sourceRef,
  }));
  const trimmed = name?.trim().slice(0, MAX_FAVORITE_NAME) ?? '';
  const favorite = await insertFavorite(userId, {
    name: trimmed === '' ? suggestFavoriteName(items) : trimmed,
    meal,
    items,
  });
  return { kind: 'saved', favorite };
}

export type ReplayFavoriteResult = { kind: 'added'; count: number } | { kind: 'not_found' };

/** Recopie un favori dans le journal du jour, au repas choisi. */
export async function replayFavorite(
  userId: number,
  id: number,
  meal: Meal,
): Promise<ReplayFavoriteResult> {
  const favorite = await findFavorite(userId, id);
  if (favorite === null || favorite.items.length === 0) {
    return { kind: 'not_found' };
  }
  const entryDate = todayInParis();
  const count = await insertEntries(
    favorite.items.map((item) => ({ userId, entryDate, meal, ...item })),
  );
  return { kind: 'added', count };
}

export function removeFavorite(userId: number, id: number): Promise<boolean> {
  return deleteFavorite(userId, id);
}
