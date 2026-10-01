import 'server-only';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import { isMeal, type Meal } from '@/lib/meal';
import type { Recipe } from '@/lib/recipe';
import { findRecipe } from './recipes';

/**
 * Accès au plan de la semaine.
 *
 * Comme partout, l'utilisateur est le premier argument et n'est jamais déduit.
 * Il figure ici jusque dans les lectures par identifiant : un plat du plan de
 * quelqu'un d'autre doit être introuvable, et non refusé.
 */

/** Une ligne du plan, telle que l'écran la lit. */
export interface PlannedMeal {
  id: number;
  planDate: string;
  meal: Meal;
  recipeId: number;
  recipeName: string;
  servings: number;
  /** Horodatage de journalisation, ou `null` si le plat n'a pas été mangé. */
  journaledAt: Date | null;
}

function toPlanned(row: {
  id: number;
  planDate: string;
  meal: string;
  recipeId: number;
  recipeName: string;
  servings: string;
  journaledAt: Date | null;
}): PlannedMeal {
  return {
    id: row.id,
    // Le pilote rend parfois une date complète ; seule la journée compte.
    planDate: String(row.planDate).slice(0, 10),
    // La contrainte en base garantit déjà la valeur ; le repli évite un
    // transtypage muet si une ligne antérieure portait autre chose.
    meal: isMeal(row.meal) ? row.meal : 'dinner',
    recipeId: row.recipeId,
    recipeName: row.recipeName,
    servings: Number(row.servings),
    journaledAt: row.journaledAt,
  };
}

/**
 * Les plats prévus entre deux dates, bornes comprises.
 *
 * Le nom de la recette est joint plutôt que recopié dans le plan : renommer
 * une recette doit renommer ce qui est prévu. C'est l'inverse exact du choix
 * fait pour le journal, où la désignation est figée (AD-1) — mais le journal
 * raconte le passé, le plan annonce l'avenir.
 */
export async function listPlannedMeals(
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<PlannedMeal[]> {
  const rows = await db()
    .select({
      id: schema.mealPlanEntries.id,
      planDate: schema.mealPlanEntries.planDate,
      meal: schema.mealPlanEntries.meal,
      recipeId: schema.mealPlanEntries.recipeId,
      recipeName: schema.recipes.name,
      servings: schema.mealPlanEntries.servings,
      journaledAt: schema.mealPlanEntries.journaledAt,
    })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.mealPlanEntries.recipeId))
    .where(
      and(
        eq(schema.mealPlanEntries.userId, userId),
        gte(schema.mealPlanEntries.planDate, fromDate),
        lte(schema.mealPlanEntries.planDate, toDate),
      ),
    )
    .orderBy(asc(schema.mealPlanEntries.planDate), asc(schema.mealPlanEntries.createdAt));

  return rows.map(toPlanned);
}

/** Un plat du plan, ou `null` s'il n'existe pas ou appartient à quelqu'un d'autre. */
export async function findPlannedMeal(
  userId: number,
  id: number,
): Promise<PlannedMeal | null> {
  const [row] = await db()
    .select({
      id: schema.mealPlanEntries.id,
      planDate: schema.mealPlanEntries.planDate,
      meal: schema.mealPlanEntries.meal,
      recipeId: schema.mealPlanEntries.recipeId,
      recipeName: schema.recipes.name,
      servings: schema.mealPlanEntries.servings,
      journaledAt: schema.mealPlanEntries.journaledAt,
    })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.mealPlanEntries.recipeId))
    .where(and(eq(schema.mealPlanEntries.userId, userId), eq(schema.mealPlanEntries.id, id)))
    .limit(1);

  return row ? toPlanned(row) : null;
}

export interface PlanMealInput {
  planDate: string;
  meal: Meal;
  recipeId: number;
  servings: number;
}

/**
 * Ajoute un plat au plan. Rend `null` si la recette n'appartient pas à
 * l'utilisateur : le client envoie un identifiant de recette, et rien ne
 * garantit qu'il soit le sien.
 */
export async function insertPlannedMeal(
  userId: number,
  input: PlanMealInput,
): Promise<number | null> {
  const recipe = await findRecipe(userId, input.recipeId);
  if (recipe === null) {
    return null;
  }

  const [row] = await db()
    .insert(schema.mealPlanEntries)
    .values({
      userId,
      planDate: input.planDate,
      meal: input.meal,
      recipeId: input.recipeId,
      servings: String(input.servings),
    })
    .returning({ id: schema.mealPlanEntries.id });

  return row?.id ?? null;
}

export async function deletePlannedMeal(userId: number, id: number): Promise<boolean> {
  const deleted = await db()
    .delete(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.userId, userId), eq(schema.mealPlanEntries.id, id)))
    .returning({ id: schema.mealPlanEntries.id });
  return deleted.length > 0;
}

/**
 * Marque un plat comme journalisé, et rend vrai si c'est cette écriture qui
 * l'a fait.
 *
 * La condition `journaled_at is null` est dans la clause `where` et non dans
 * un contrôle préalable : deux appuis rapprochés sur « J'ai mangé ça »
 * passeraient tous deux un contrôle fait avant, et compteraient le repas deux
 * fois. Ici, le second n'écrit aucune ligne et le service le sait.
 */
export async function markJournaled(userId: number, id: number): Promise<boolean> {
  const updated = await db()
    .update(schema.mealPlanEntries)
    .set({ journaledAt: new Date() })
    .where(
      and(
        eq(schema.mealPlanEntries.userId, userId),
        eq(schema.mealPlanEntries.id, id),
        sql`${schema.mealPlanEntries.journaledAt} is null`,
      ),
    )
    .returning({ id: schema.mealPlanEntries.id });
  return updated.length > 0;
}

/** Revient sur une journalisation, pour rouvrir un plat marqué mangé par erreur. */
export async function clearJournaled(userId: number, id: number): Promise<boolean> {
  const updated = await db()
    .update(schema.mealPlanEntries)
    .set({ journaledAt: null })
    .where(and(eq(schema.mealPlanEntries.userId, userId), eq(schema.mealPlanEntries.id, id)))
    .returning({ id: schema.mealPlanEntries.id });
  return updated.length > 0;
}

/** La recette d'un plat prévu, ingrédients résolus, pour la journalisation. */
export function recipeForPlanned(userId: number, recipeId: number): Promise<Recipe | null> {
  return findRecipe(userId, recipeId);
}
