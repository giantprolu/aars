import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { weightHistory } from '@/server/services/profile';
import { progressOverview } from '@/server/services/workouts';
import { weightChange } from '@/lib/weight';
import { formatChange, formatMetric } from '@/lib/workout-progress';

export const runtime = 'nodejs';

/** Les périodes proposées, en semaines : 4 sem., 12 sem., 1 an. */
const PERIODS = [4, 12, 52] as const;

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Progression pour les apps natives : tonnage et poids par semaine, puis le
 * 1RM estimé par exercice. Mêmes lectures et mêmes règles que
 * `app/training/progress/page.tsx` ; les valeurs d'exercice arrivent mises en
 * forme, la règle d'affichage d'une mesure n'existant qu'ici.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const raw = Number(new URL(request.url).searchParams.get('period'));
  const period = PERIODS.find((weeks) => weeks === raw) ?? 12;

  const [{ weeks, exercises }, weights] = await Promise.all([
    progressOverview(userId, period),
    weightHistory(userId, period),
  ]);

  const half = Math.floor(weeks.length / 2);
  const before = mean(weeks.slice(0, half).map((week) => week.volume));
  const after = mean(weeks.slice(half).map((week) => week.volume));

  return Response.json({
    period,
    weeks: weeks.map((week) => ({ weekStart: week.weekStart, volumeKg: week.volume, sessions: week.sessions })),
    weights: weights.map((week) => week.weightKg),
    sessions: weeks.reduce((total, week) => total + week.sessions, 0),
    volumeChange: before > 0 ? Math.round(((after - before) / before) * 100) : null,
    weightChangeKg: weightChange(weights),
    exercises: exercises.map(({ exercise, metric, latest, change }) => ({
      id: exercise.id,
      name: exercise.name,
      value: formatMetric(metric, latest.value),
      change: change === null ? null : formatChange(metric, change),
      progressed: change !== null && change > 0,
    })),
  });
}
