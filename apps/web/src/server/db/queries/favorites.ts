import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../client';
import { parseFavoriteItems, type FavoriteItem, type FavoriteMeal } from '@/lib/favorites';
import { isMeal, type Meal } from '@/lib/meal';

/**
 * Repas favoris. L'utilisateur est en premier argument de chaque fonction et
 * dans chaque clause `where` : un favori est un morceau de journal alimentaire.
 */

function toFavorite(row: typeof schema.favoriteMeals.$inferSelect): FavoriteMeal {
  return {
    id: row.id,
    name: row.name,
    meal: isMeal(row.meal) ? row.meal : 'lunch',
    items: parseFavoriteItems(row.items),
    createdAt: row.createdAt,
  };
}

export async function insertFavorite(
  userId: number,
  favorite: { name: string; meal: Meal; items: readonly FavoriteItem[] },
): Promise<FavoriteMeal> {
  const [row] = await db()
    .insert(schema.favoriteMeals)
    .values({ userId, name: favorite.name, meal: favorite.meal, items: favorite.items })
    .returning();
  if (!row) {
    throw new Error("Le favori n'a pas été écrit.");
  }
  return toFavorite(row);
}

export async function listFavorites(userId: number): Promise<FavoriteMeal[]> {
  const rows = await db()
    .select()
    .from(schema.favoriteMeals)
    .where(eq(schema.favoriteMeals.userId, userId))
    .orderBy(desc(schema.favoriteMeals.createdAt));
  return rows.map(toFavorite);
}

export async function findFavorite(userId: number, id: number): Promise<FavoriteMeal | null> {
  const [row] = await db()
    .select()
    .from(schema.favoriteMeals)
    .where(and(eq(schema.favoriteMeals.userId, userId), eq(schema.favoriteMeals.id, id)))
    .limit(1);
  return row ? toFavorite(row) : null;
}

export async function deleteFavorite(userId: number, id: number): Promise<boolean> {
  const rows = await db()
    .delete(schema.favoriteMeals)
    .where(and(eq(schema.favoriteMeals.userId, userId), eq(schema.favoriteMeals.id, id)))
    .returning({ id: schema.favoriteMeals.id });
  return rows.length > 0;
}
