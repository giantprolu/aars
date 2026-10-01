import 'server-only';
import { shiftDate, todayInParis } from '@/lib/date';
import { mealEvent, type MealMethod, type UsageEvent } from '@/lib/usage';
import { bumpUsage, deleteUsageBefore } from '../db/queries/usage';

/**
 * Durée de conservation des compteurs, en jours : treize mois, la durée que la
 * CNIL retient pour la mesure d'audience. Assez pour lire une rétention à
 * trente jours sur une année entière.
 */
export const USAGE_RETENTION_DAYS = 395;

/**
 * Compte un événement d'usage (étape « mesurer », 01/10/2026).
 *
 * Ne lève jamais : la mesure est un à-côté, et un repas ne doit pas échouer
 * parce que son compteur n'a pas pu s'écrire. L'échec est seulement journalisé.
 */
export async function recordUsage(userId: number, event: UsageEvent): Promise<void> {
  try {
    await bumpUsage(userId, todayInParis(), event);
  } catch (error) {
    console.error('[usage] compteur non ecrit :', event, error instanceof Error ? error.message : error);
  }
}

export function recordMeal(userId: number, method: MealMethod): Promise<void> {
  return recordUsage(userId, mealEvent(method));
}

/** Efface les compteurs plus vieux que la durée de conservation. */
export function purgeOldUsage(): Promise<void> {
  return deleteUsageBefore(shiftDate(todayInParis(), -USAGE_RETENTION_DAYS));
}
