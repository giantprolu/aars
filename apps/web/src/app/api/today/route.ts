import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { historyPage, journalForToday } from '@/server/services/entries';
import { planForWeek } from '@/server/services/meal-plan';
import { bridgeStatus, lastWeighIn, targetFor, weightHistory } from '@/server/services/profile';
import { recipesFor } from '@/server/services/recipes';
import { identityFor } from '@/server/services/social';
import { quickSessionFor } from '@/server/services/today';
import { preferencesFor, sessionHistory } from '@/server/services/workouts';
import { daysFrom, hourInParis, isoWeekNumber, startOfWeek, todayInParis } from '@/lib/date';
import { macrosPerServing } from '@/lib/recipe';
import { weightChange } from '@/lib/weight';

export const runtime = 'nodejs';

/** Semaines de pesées lues pour la tuile Poids, comme la page web. */
const WEIGHT_WEEKS = 6;

/**
 * L'écran Aujourd'hui en une lecture, pour les apps natives.
 *
 * La page web lit les services directement depuis un composant serveur ; une
 * app native n'a que l'API. Mêmes lectures, mêmes règles, mises en forme
 * JSON. Le calcul des tuiles reste ici pour ne pas être recopié en Swift et
 * en Kotlin.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const today = todayInParis();
  const weekStart = startOfWeek(today);
  const [
    { totals, entries },
    target,
    identity,
    recentDays,
    session,
    planned,
    recipes,
    weights,
    lastWeight,
    bridge,
    preferences,
    sessions,
  ] = await Promise.all([
    journalForToday(userId),
    targetFor(userId),
    identityFor(userId),
    historyPage(userId, 7, 0),
    quickSessionFor(userId),
    planForWeek(userId, weekStart),
    recipesFor(userId),
    weightHistory(userId, WEIGHT_WEEKS),
    lastWeighIn(userId),
    bridgeStatus(userId),
    preferencesFor(userId),
    sessionHistory(userId, 14),
  ]);

  const kcalByDay = new Map(recentDays.map((day) => [day.entryDate, day.macros.kcal]));
  kcalByDay.set(today, totals.macros.kcal);
  const week = daysFrom(weekStart, 7).map((day) => ({ day, kcal: kcalByDay.get(day) ?? 0 }));

  // Le plat prévu : le dîner, ou le déjeuner tant qu'on est avant 15 h.
  const todays = planned.filter((meal) => meal.planDate === today);
  const lunchFirst = hourInParis() < 15;
  const pick =
    (lunchFirst ? todays.find((meal) => meal.meal === 'lunch' && meal.journaledAt === null) : undefined) ??
    todays.find((meal) => meal.meal === 'dinner') ??
    todays.find((meal) => meal.meal === 'lunch');
  let plannedMeal = null;
  if (pick !== undefined) {
    const recipe = recipes.find((candidate) => candidate.id === pick.recipeId);
    const perServing = recipe === undefined ? null : macrosPerServing(recipe).macros.kcal;
    plannedMeal = {
      planId: pick.id,
      meal: pick.meal,
      name: pick.recipeName,
      kcal: perServing === null ? null : Math.round(perServing * pick.servings),
      servings: pick.servings,
      eaten: pick.journaledAt !== null,
    };
  }

  const sessionsDone = sessions.filter(
    (item) => item.finishedAt !== null && item.sessionDate >= weekStart,
  ).length;

  return Response.json({
    today,
    isoWeek: isoWeekNumber(today),
    identity: { handle: identity.handle, displayName: identity.displayName },
    totals: totals.macros,
    target:
      target === null
        ? null
        : {
            targetKcal: target.targetKcal,
            proteinG: target.proteinG,
            carbsG: target.carbsG,
            fatG: target.fatG,
            trainingDay: target.trainingDay,
            cycleKcal: target.cycleKcal,
          },
    week,
    entries,
    session,
    plannedMeal,
    weight:
      lastWeight === null
        ? null
        : {
            latestKg: lastWeight.weightKg,
            latestDay: lastWeight.day,
            changeKg: weightChange(weights),
            weeks: weights.map((item) => item.weightKg),
          },
    activity: {
      activeKcal: bridge.lastDay === today ? bridge.lastKcal : null,
      sessionsDone,
      sessionsPlanned: preferences.sessionsPerWeek,
    },
  });
}
