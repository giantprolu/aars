import 'server-only';
import { daysFrom, shiftDate } from '@/lib/date';
import { MAX_PLANNED_SERVINGS } from '@/lib/basket';
import type { Meal } from '@/lib/meal';
import {
  clearJournaled,
  deletePlannedMeal,
  findPlannedMeal,
  insertPlannedMeal,
  listPlannedMeals,
  markJournaled,
  recipeForPlanned,
  type PlannedMeal,
} from '../db/queries/meal-plan';
import { journalableIngredients, writeIngredients } from './recipe-journal';

/**
 * Service du plan de la semaine.
 *
 * C'est le seul endroit où un plat *prévu* devient des lignes de journal :
 * l'opération est nommée, et non un effet de bord d'un écran — elle écrit dans
 * les données de santé de quelqu'un, et doit pouvoir être lue d'un seul
 * endroit. Ce qui lui reste en propre est le verrou : un plat prévu ne se
 * mange qu'une fois.
 *
 * La conversion elle-même — parts, substitutions, écriture — vit dans
 * `recipe-journal`, qui la partage avec l'ajout direct d'un plat au journal.
 */

/** Une semaine pleine. Le plan ne se lit jamais jour par jour. */
export const WEEK_LENGTH = 7;

export { MAX_PLANNED_SERVINGS };

export type { PlannedMeal };

export function planForWeek(userId: number, startDate: string): Promise<PlannedMeal[]> {
  return listPlannedMeals(userId, startDate, shiftDate(startDate, WEEK_LENGTH - 1));
}

export function weekDays(startDate: string): string[] {
  return daysFrom(startDate, WEEK_LENGTH);
}

export type PlanMealResult =
  | { kind: 'planned'; id: number }
  | { kind: 'invalid' }
  | { kind: 'not_found' };

export async function planMeal(
  userId: number,
  input: { planDate: string; meal: Meal; recipeId: number; servings: number },
): Promise<PlanMealResult> {
  if (
    !Number.isFinite(input.servings) ||
    input.servings <= 0 ||
    input.servings > MAX_PLANNED_SERVINGS
  ) {
    return { kind: 'invalid' };
  }

  const id = await insertPlannedMeal(userId, input);
  // `null` signifie que la recette n'est pas la sienne : introuvable, et non
  // interdit, pour ne pas confirmer l'existence d'une recette d'un autre compte.
  return id === null ? { kind: 'not_found' } : { kind: 'planned', id };
}

export function unplanMeal(userId: number, id: number): Promise<boolean> {
  return deletePlannedMeal(userId, id);
}

export function reopenMeal(userId: number, id: number): Promise<boolean> {
  return clearJournaled(userId, id);
}

export type JournalPlannedResult =
  | { kind: 'journaled'; created: number; skipped: string[] }
  | { kind: 'nothing_to_journal' }
  | { kind: 'already_journaled' }
  | { kind: 'not_found' };

/**
 * Marque un plat prévu comme mangé et l'inscrit au journal, un ingrédient par
 * ligne.
 *
 * Le verrou est posé avant les écritures et non après, et c'est délibéré.
 * `markJournaled` ne réussit qu'une fois, la condition étant dans sa clause
 * `where` : deux appuis rapprochés sur « J'ai mangé ça » ne peuvent pas
 * compter le repas deux fois. Marquer après aurait laissé la fenêtre ouverte
 * pendant toute la durée des insertions.
 *
 * Le prix de ce choix est qu'une panne au milieu des écritures laisse un plat
 * marqué mangé avec des lignes manquantes. C'est le bon prix à payer : les
 * lignes manquantes se voient dans le journal du jour et se rattrapent à la
 * main, là où un repas compté deux fois ne se voit nulle part.
 */
export async function journalPlannedMeal(
  userId: number,
  id: number,
): Promise<JournalPlannedResult> {
  const planned = await findPlannedMeal(userId, id);
  if (planned === null) {
    return { kind: 'not_found' };
  }
  if (planned.journaledAt !== null) {
    return { kind: 'already_journaled' };
  }

  const recipe = await recipeForPlanned(userId, planned.recipeId);
  if (recipe === null) {
    return { kind: 'not_found' };
  }

  const { journaled, skipped } = await journalableIngredients(userId, recipe, planned.servings);
  if (journaled.length === 0) {
    // Rien d'inscriptible : ne pas marquer le plat mangé, sans quoi il serait
    // clos sans qu'une seule ligne ait rejoint le journal.
    return { kind: 'nothing_to_journal' };
  }

  if (!(await markJournaled(userId, id))) {
    return { kind: 'already_journaled' };
  }

  const written = await writeIngredients(userId, journaled, planned.planDate, planned.meal);
  return {
    kind: 'journaled',
    created: written.created,
    skipped: [...skipped, ...written.skipped],
  };
}
