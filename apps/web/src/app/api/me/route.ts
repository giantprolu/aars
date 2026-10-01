import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { hasIngestToken } from '@/server/db/queries/users';
import { bridgeStatus, lastWeighIn, weightHistory } from '@/server/services/profile';
import { identityFor } from '@/server/services/social';
import { gymCatalog, preferencesFor, progressOverview } from '@/server/services/workouts';
import { todayInParis } from '@/lib/date';
import { weightChange } from '@/lib/weight';
import { formatSet } from '@/lib/workout';
import { recordsSince } from '@/lib/workout-progress';

export const runtime = 'nodejs';

/** Semaines lues pour le poids et la régularité, comme la page web. */
const WEEKS = 12;

/**
 * Moi pour les apps natives : identité, poids, records du mois, régularité,
 * état du pont Santé. Mêmes lectures et mêmes règles que `app/me/page.tsx`.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const today = todayInParis();
  const [identity, preferences, gyms, weights, last, progress, bridge, tokenExists] = await Promise.all([
    identityFor(userId),
    preferencesFor(userId),
    gymCatalog(),
    weightHistory(userId, WEEKS),
    lastWeighIn(userId),
    progressOverview(userId, WEEKS),
    bridgeStatus(userId),
    hasIngestToken(userId),
  ]);

  const weighed = weights.filter((week) => week.weightKg !== null);
  const records = recordsSince(progress.exercises, `${today.slice(0, 8)}01`);
  const topRecord = records[0];

  return Response.json({
    identity: { handle: identity.handle, displayName: identity.displayName },
    gym: gyms.find((item) => item.id === preferences.gymId)?.name ?? null,
    sessionsPerWeek: preferences.sessionsPerWeek,
    weekAverageKg: weighed[weighed.length - 1]?.weightKg ?? null,
    weightChangeKg: weightChange(weights.slice(-5)),
    weights: weights.map((week) => week.weightKg),
    lastWeighIn: last,
    recordsThisMonth: records.length,
    topRecord: topRecord === undefined ? null : `${topRecord.exercise.name} ${formatSet(topRecord.record.best)}`,
    activeWeeks: progress.weeks.filter((week) => week.sessions > 0).length,
    weeks: WEEKS,
    // Actif dès que la mesure pilote la cible ; en attente dès qu'une source
    // est branchée, raccourci iOS (jeton fabriqué) ou Health Connect (une
    // journée reçue sans jeton).
    health:
      bridge.dayCount >= bridge.requiredDays
        ? 'active'
        : tokenExists || bridge.lastDay !== null
          ? 'pending'
          : 'inactive',
    healthBridge: bridge,
  });
}
