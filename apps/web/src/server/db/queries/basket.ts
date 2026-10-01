import 'server-only';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import { findRecipe } from './recipes';

/**
 * Accès au panier de la semaine.
 *
 * Comme partout, l'utilisateur est le premier argument et n'est jamais déduit,
 * jusque dans les lectures par identifiant : une ligne du panier de quelqu'un
 * d'autre doit être introuvable, et non refusée.
 */

/** Une ligne du panier, telle que l'écran la lit. */
export interface BasketItem {
  id: number;
  recipeId: number;
  recipeName: string;
  /** Parts prévues sur la semaine entière. */
  servings: number;
  /**
   * Parts déjà posées au plan pour cette recette, dans la semaine du panier.
   *
   * Compté ici plutôt que dans l'écran : c'est la seule grandeur qui dit ce
   * qu'il reste à manger d'un plat acheté, et la calculer côté client aurait
   * demandé d'y descendre tout le plan de la semaine.
   */
  plannedServings: number;
}

function toItem(row: {
  id: number;
  recipeId: number;
  recipeName: string;
  servings: string;
  plannedServings: string | null;
}): BasketItem {
  return {
    id: row.id,
    recipeId: row.recipeId,
    recipeName: row.recipeName,
    servings: Number(row.servings),
    plannedServings: row.plannedServings === null ? 0 : Number(row.plannedServings),
  };
}

/**
 * Le panier d'une semaine, dans l'ordre où les plats ont été choisis.
 *
 * Le nom de la recette est joint plutôt que recopié, comme pour le plan :
 * renommer une recette doit renommer ce qu'on a mis au panier.
 *
 * Les parts déjà planifiées arrivent par sous-requête et non par jointure :
 * une jointure sur le plan multiplierait les lignes du panier par le nombre de
 * repas prévus, et le `sum` porterait alors sur des doublons.
 */
export async function listBasket(userId: number, weekStart: string): Promise<BasketItem[]> {
  const weekEnd = sql`(${weekStart}::date + interval '6 days')::date`;

  const rows = await db()
    .select({
      id: schema.mealBasket.id,
      recipeId: schema.mealBasket.recipeId,
      recipeName: schema.recipes.name,
      servings: schema.mealBasket.servings,
      plannedServings: sql<string | null>`(
        select sum(${schema.mealPlanEntries.servings})
        from ${schema.mealPlanEntries}
        where ${schema.mealPlanEntries.userId} = ${userId}
          and ${schema.mealPlanEntries.recipeId} = ${schema.mealBasket.recipeId}
          and ${schema.mealPlanEntries.planDate} >= ${weekStart}::date
          and ${schema.mealPlanEntries.planDate} <= ${weekEnd}
      )`,
    })
    .from(schema.mealBasket)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.mealBasket.recipeId))
    .where(
      and(eq(schema.mealBasket.userId, userId), eq(schema.mealBasket.weekStart, weekStart)),
    )
    .orderBy(asc(schema.mealBasket.createdAt), asc(schema.mealBasket.id));

  return rows.map(toItem);
}

/**
 * Met un plat au panier. Rend `null` si la recette n'appartient pas à
 * l'utilisateur : le client envoie un identifiant, et rien ne garantit qu'il
 * soit le sien.
 *
 * Un plat déjà au panier n'est pas modifié, et son identifiant est tout de
 * même rendu. Choisir deux fois le même plat est un geste sans conséquence,
 * pas une erreur : c'est ce que fait la main qui hésite sur un écran de choix.
 */
export async function insertBasketItem(
  userId: number,
  weekStart: string,
  recipeId: number,
  servings: number,
): Promise<number | null> {
  if ((await findRecipe(userId, recipeId)) === null) {
    return null;
  }

  const [inserted] = await db()
    .insert(schema.mealBasket)
    .values({ userId, weekStart, recipeId, servings: String(servings) })
    .onConflictDoNothing({
      target: [schema.mealBasket.userId, schema.mealBasket.weekStart, schema.mealBasket.recipeId],
    })
    .returning({ id: schema.mealBasket.id });

  if (inserted !== undefined) {
    return inserted.id;
  }

  const [existing] = await db()
    .select({ id: schema.mealBasket.id })
    .from(schema.mealBasket)
    .where(
      and(
        eq(schema.mealBasket.userId, userId),
        eq(schema.mealBasket.weekStart, weekStart),
        eq(schema.mealBasket.recipeId, recipeId),
      ),
    )
    .limit(1);

  return existing?.id ?? null;
}

/**
 * La semaine d'une ligne du panier.
 *
 * Lue pour réaligner la liste de courses qui en dépend : les gestes du panier
 * ne portent qu'un identifiant de ligne, et la liste, elle, se range par
 * semaine. Rend `null` quand la ligne n'est pas la sienne, comme partout.
 */
export async function basketWeekOf(userId: number, id: number): Promise<string | null> {
  const [row] = await db()
    .select({ weekStart: schema.mealBasket.weekStart })
    .from(schema.mealBasket)
    .where(and(eq(schema.mealBasket.userId, userId), eq(schema.mealBasket.id, id)))
    .limit(1);

  return row === undefined ? null : String(row.weekStart).slice(0, 10);
}

/** Change le nombre de parts prévues d'un plat du panier. */
export async function updateBasketServings(
  userId: number,
  id: number,
  servings: number,
): Promise<boolean> {
  const updated = await db()
    .update(schema.mealBasket)
    .set({ servings: String(servings) })
    .where(and(eq(schema.mealBasket.userId, userId), eq(schema.mealBasket.id, id)))
    .returning({ id: schema.mealBasket.id });
  return updated.length > 0;
}

export async function deleteBasketItem(userId: number, id: number): Promise<boolean> {
  const deleted = await db()
    .delete(schema.mealBasket)
    .where(and(eq(schema.mealBasket.userId, userId), eq(schema.mealBasket.id, id)))
    .returning({ id: schema.mealBasket.id });
  return deleted.length > 0;
}

/**
 * Les semaines dont le panier contient cette recette.
 *
 * Lue avant de toucher à une recette : ses ingrédients et ses parts décident
 * des quantités à acheter, et une liste engendrée avant la correction
 * réclamerait encore l'ancienne. Rendue triée, pour que deux appels successifs
 * réalignent dans le même ordre.
 *
 * Toutes les semaines sont rendues, passées comprises : c'est à l'appelant de
 * décider ce qu'il en fait, et `syncListToBasket` ne touchera de toute façon
 * qu'une liste encore ouverte.
 */
export async function basketWeeksForRecipe(
  userId: number,
  recipeId: number,
): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ weekStart: schema.mealBasket.weekStart })
    .from(schema.mealBasket)
    .where(
      and(eq(schema.mealBasket.userId, userId), eq(schema.mealBasket.recipeId, recipeId)),
    )
    .orderBy(asc(schema.mealBasket.weekStart));

  return rows.map((row) => String(row.weekStart).slice(0, 10));
}

/** Les recettes déjà installées depuis le catalogue, par `slug`. */
export async function installedCatalogSlugs(userId: number): Promise<Map<string, number>> {
  const rows = await db()
    .select({ id: schema.recipes.id, catalogSlug: schema.recipes.catalogSlug })
    .from(schema.recipes)
    .where(
      and(eq(schema.recipes.userId, userId), sql`${schema.recipes.catalogSlug} is not null`),
    );

  return new Map(
    rows
      .filter((row): row is { id: number; catalogSlug: string } => row.catalogSlug !== null)
      .map((row) => [row.catalogSlug, row.id]),
  );
}

/**
 * Les plats du panier d'une période, pour la liste de courses.
 *
 * Bornée par deux dates comme `listPlannedMeals`, et non par un seul lundi :
 * une liste de courses peut couvrir dix jours, et c'est l'appelant qui décide
 * de la période, pas cette fonction.
 */
export async function basketRecipesBetween(
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<{ recipeId: number; servings: number }[]> {
  const rows = await db()
    .select({
      recipeId: schema.mealBasket.recipeId,
      servings: schema.mealBasket.servings,
    })
    .from(schema.mealBasket)
    .where(
      and(
        eq(schema.mealBasket.userId, userId),
        gte(schema.mealBasket.weekStart, fromDate),
        lte(schema.mealBasket.weekStart, toDate),
      ),
    )
    .orderBy(asc(schema.mealBasket.createdAt), asc(schema.mealBasket.id));

  return rows.map((row) => ({ recipeId: row.recipeId, servings: Number(row.servings) }));
}
