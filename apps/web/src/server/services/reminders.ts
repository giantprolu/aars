import 'server-only';
import webpush, { WebPushError } from 'web-push';
import { todayInParis } from '@/lib/date';
import type { Meal } from '@/lib/meal';
import { env } from '../env';
import { hasEntriesForMeals } from '../db/queries/entries';
import {
  deleteSubscription,
  subscriptionCount,
  subscriptionsByUser,
  upsertSubscription,
  type PushTarget,
} from '../db/queries/push';

/**
 * Rappels de repas, par notification.
 *
 * Un seul rappel par jour, à 14 heures : s'il n'y a rien au déjeuner à cette
 * heure-là, il est oublié plus qu'il n'est en retard, et c'est le seul moment
 * où un rappel change quelque chose — le soir, on ne se souvient plus des
 * grammes. Un rappel qui sonnerait à chaque repas deviendrait vite celui qu'on
 * coupe.
 */

/** L'heure du rappel, à Paris. */
export const REMINDER_HOUR = 14;

/**
 * Les repas qui font taire le rappel. Le dîner compte aussi : un repas de midi
 * rangé sous le mauvais repas reste un repas noté, et c'est l'oubli qu'on
 * cherche à rattraper, pas le classement.
 */
const MEALS_THAT_COUNT: readonly Meal[] = ['lunch', 'dinner'];

export function pushPublicKey(): string | null {
  return env.push?.publicKey ?? null;
}

export function subscribe(userId: number, target: PushTarget): Promise<void> {
  return upsertSubscription(userId, target);
}

export function unsubscribe(userId: number, endpoint: string): Promise<void> {
  return deleteSubscription(userId, endpoint);
}

export async function remindersEnabled(userId: number): Promise<boolean> {
  return (await subscriptionCount(userId)) > 0;
}

export interface ReminderReport {
  users: number;
  sent: number;
  skipped: number;
  removed: number;
}

/**
 * Envoie le rappel du déjeuner à chaque compte abonné qui n'a noté ni
 * déjeuner ni dîner.
 *
 * Le journal de chaque compte est lu avec son utilisateur, un par un : même
 * une tâche planifiée ne balaie pas les entrées de tout le monde d'un coup.
 * Un abonnement que le service déclare mort (404, 410) est oublié.
 */
export async function sendLunchReminders(): Promise<ReminderReport> {
  const push = env.push;
  const report: ReminderReport = { users: 0, sent: 0, skipped: 0, removed: 0 };
  if (push === null) {
    return report;
  }
  webpush.setVapidDetails(push.subject, push.publicKey, push.privateKey);

  const today = todayInParis();
  const payload = JSON.stringify({
    title: 'Rien de noté ce midi',
    body: 'Deux touches maintenant valent mieux qu’un souvenir approximatif ce soir.',
    url: '/add',
  });

  for (const [userId, targets] of await subscriptionsByUser()) {
    report.users += 1;
    if (await hasEntriesForMeals(userId, today, MEALS_THAT_COUNT)) {
      report.skipped += 1;
      continue;
    }
    for (const target of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          payload,
          { TTL: 60 * 60 },
        );
        report.sent += 1;
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          await deleteSubscription(userId, target.endpoint);
          report.removed += 1;
          continue;
        }
        console.error('[reminders] envoi en echec', error);
      }
    }
  }
  return report;
}
