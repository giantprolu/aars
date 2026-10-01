import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Goal } from '@/lib/energy';
import type { Meal } from '@/lib/meal';
import type { CatalogMeal } from '@/lib/meal-catalog';
import { db, schema } from '../client';

/**
 * Lecture du catalogue de plats.
 *
 * Aucun filtre d'utilisateur, et c'est voulu : le catalogue est un référentiel
 * commun, comme CIQUAL. Ce qu'un compte en a fait — les plats installés, le
 * panier — se lit ailleurs, avec sa clé.
 */

type CatalogMealRow = typeof schema.catalogMeals.$inferSelect;

function toCatalogMeal(row: CatalogMealRow): CatalogMeal {
  return {
    slug: row.slug,
    name: row.name,
    // La contrainte de la table garantit la valeur ; le type ne la voit pas.
    slot: row.slot as Meal,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    steps: row.steps,
    ingredients: row.ingredients,
    estimate: { kcal: row.estimateKcal, proteinG: row.estimateProteinG },
  };
}

/** Les plats d'un objectif, dans leur ordre d'affichage. */
export async function catalogMealsFor(goal: Goal): Promise<CatalogMeal[]> {
  const rows = await db()
    .select()
    .from(schema.catalogMeals)
    .where(eq(schema.catalogMeals.goal, goal))
    // Le slug départage deux rangs égaux, pour un ordre stable d'un affichage
    // à l'autre.
    .orderBy(asc(schema.catalogMeals.position), asc(schema.catalogMeals.slug));
  return rows.map(toCatalogMeal);
}

/**
 * Les plats qui portent ces `slug`, tous objectifs confondus.
 *
 * Un `slug` inconnu est simplement absent du résultat : c'est à l'appelant de
 * l'ignorer, comme il ignorait un plat introuvable dans le code.
 */
export async function catalogMealsBySlugs(slugs: readonly string[]): Promise<CatalogMeal[]> {
  if (slugs.length === 0) {
    return [];
  }
  const rows = await db()
    .select()
    .from(schema.catalogMeals)
    .where(inArray(schema.catalogMeals.slug, [...slugs]));
  return rows.map(toCatalogMeal);
}

/** Tous les plats, par objectif puis par rang : pour les scripts d'entretien. */
export async function allCatalogMealsWithGoal(): Promise<Array<CatalogMeal & { goal: Goal }>> {
  const rows = await db()
    .select()
    .from(schema.catalogMeals)
    .orderBy(
      asc(schema.catalogMeals.goal),
      asc(schema.catalogMeals.position),
      asc(schema.catalogMeals.slug),
    );
  return rows.map((row) => ({ ...toCatalogMeal(row), goal: row.goal as Goal }));
}
