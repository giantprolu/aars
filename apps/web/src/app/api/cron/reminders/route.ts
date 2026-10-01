import { apiError } from '@/server/errors';
import { env } from '@/server/env';
import { REMINDER_HOUR, sendLunchReminders } from '@/server/services/reminders';
import { purgeOldUsage } from '@/server/services/usage';
import { hourInParis } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tâche planifiée des rappels, appelée par Vercel.
 *
 * Vercel planifie en UTC, et 14 heures à Paris tombe à 12 h UTC l'été, à 13 h
 * l'hiver. Deux déclenchements sont donc prévus (voir `vercel.json`), et
 * celui qui ne tombe pas à 14 heures à Paris repart sans rien faire : c'est
 * plus simple que de réécrire l'horaire deux fois par an, et cela tient aussi
 * si l'appel arrive en retard dans l'heure.
 *
 * Vercel joint `Authorization: Bearer <CRON_SECRET>` à ses appels. Sans ce
 * secret, la route est une porte ouverte pour envoyer des notifications à
 * tout le monde : elle refuse donc tant qu'il n'est pas configuré.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = env.cronSecret;
  if (secret === undefined || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return apiError('unauthorized');
  }

  if (hourInParis() !== REMINDER_HOUR) {
    return Response.json({ skipped: 'hors de l’heure du rappel' });
  }

  // Le passage quotidien sert aussi à tenir la durée de conservation des
  // compteurs d'usage : une tâche de plus pour une ligne n'en vaudrait pas la peine.
  await purgeOldUsage();
  return Response.json(await sendLunchReminders());
}
