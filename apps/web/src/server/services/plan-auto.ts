import 'server-only';
import { todayInParis } from '@/lib/date';
import {
  assignPortions,
  emptySlots,
  pickCatalogMeals,
  weekIndexOf,
  type PlanAssignment,
  type PlanMeal,
} from '@/lib/plan-auto';
import { MAX_CHOSEN_MEALS, catalogFor, chooseCatalogMeals } from './catalog';
import { insertPlannedMeals } from '../db/queries/meal-plan';
import { installedCatalogSlugs, listBasket } from '../db/queries/basket';
import { findProfile } from '../db/queries/profiles';
import { planForWeek, weekDays } from './meal-plan';
import { hasKitchenPlus } from './premium';

/**
 * Plan automatique de la semaine (Cuisine+) : « Remplir la semaine ».
 *
 * Remplit les midis et soirs libres, du jour même à dimanche, dans cet
 * ordre de préférence :
 *
 * 1. les parts qui restent des plats déjà choisis pour la semaine : ce qui est
 *    acheté, ou va l'être, se mange avant tout le reste ;
 * 2. faute de quoi, des plats du catalogue pour l'objectif du compte, mis au
 *    panier comme si on les avait choisis — la liste de courses ouverte les
 *    suit, comme pour un choix à la main.
 *
 * Ce qui est déjà posé ne bouge pas, et une semaine passée ne se remplit pas.
 */

export type FillWeekResult =
  | {
      kind: 'filled';
      /** Repas posés au plan par cet appel. */
      placed: number;
      /** Plats du catalogue ajoutés au panier pour y parvenir, par leur nom. */
      added: string[];
      /** Cases encore vides : le catalogue n'a pas suffi. */
      empty: number;
    }
  | { kind: 'premium_required' };

export async function fillWeek(
  userId: number,
  weekStart: string,
  today: string = todayInParis(),
): Promise<FillWeekResult> {
  if (!(await hasKitchenPlus(userId))) {
    return { kind: 'premium_required' };
  }

  const days = weekDays(weekStart).filter((day) => day >= today);
  const slots = emptySlots(days, await planForWeek(userId, weekStart));
  if (slots.length === 0) {
    return { kind: 'filled', placed: 0, added: [], empty: 0 };
  }

  // 1. Les parts qui restent des plats choisis.
  const basket = await listBasket(userId, weekStart);
  const fromBasket = assignPortions(
    slots,
    basket.map((item) => ({
      recipeId: item.recipeId,
      portions: item.servings - item.plannedServings,
      meal: null,
    })),
  );
  const assignments: PlanAssignment[] = [...fromBasket.assigned];
  const added: string[] = [];
  let unassigned = fromBasket.unassigned;

  // 2. Le catalogue, pour ce qui reste.
  if (unassigned.length > 0) {
    const goal = (await findProfile(userId))?.goal ?? 'maintain';
    const [catalog, installed] = await Promise.all([catalogFor(goal), installedCatalogSlugs(userId)]);
    const inBasket = new Set(basket.map((item) => item.recipeId));
    const exclude = new Set(
      [...installed].filter(([, recipeId]) => inBasket.has(recipeId)).map(([slug]) => slug),
    );
    const need: Record<PlanMeal, number> = {
      lunch: unassigned.filter((slot) => slot.meal === 'lunch').length,
      dinner: unassigned.filter((slot) => slot.meal === 'dinner').length,
    };
    const slugs = pickCatalogMeals(catalog, need, exclude, weekIndexOf(weekStart)).slice(0, MAX_CHOSEN_MEALS);

    if (slugs.length > 0) {
      await chooseCatalogMeals(userId, weekStart, slugs);
      const [after, nowInstalled] = await Promise.all([listBasket(userId, weekStart), installedCatalogSlugs(userId)]);
      const slugOf = new Map([...nowInstalled].map(([slug, recipeId]) => [recipeId, slug]));
      const mealOf = new Map(catalog.map((meal) => [meal.slug, meal.slot]));
      const fresh = after.filter((item) => !inBasket.has(item.recipeId));
      const fromCatalog = assignPortions(
        unassigned,
        fresh.map((item) => {
          const slot = mealOf.get(slugOf.get(item.recipeId) ?? '');
          return {
            recipeId: item.recipeId,
            portions: item.servings - item.plannedServings,
            meal: slot === 'lunch' || slot === 'dinner' ? slot : null,
          };
        }),
      );
      assignments.push(...fromCatalog.assigned);
      unassigned = fromCatalog.unassigned;
      added.push(...fresh.map((item) => item.recipeName));
    }
  }

  const placed = await insertPlannedMeals(
    userId,
    assignments.map((item) => ({
      planDate: item.slot.date,
      meal: item.slot.meal,
      recipeId: item.recipeId,
      servings: 1,
    })),
  );
  return { kind: 'filled', placed, added, empty: slots.length - placed };
}
