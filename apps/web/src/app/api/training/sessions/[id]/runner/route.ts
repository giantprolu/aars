import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { sessionRunnerFor } from '@/server/services/session-runner';
import {
  SESSION_VISIBILITIES,
  VISIBILITY_LABELS,
  VISIBILITY_NOTES,
} from '@/lib/social';
import {
  bestSet,
  formatPrescription,
  formatSet,
  parseSwaps,
  prefillMeasures,
  restAfterSet,
  sessionVolume,
  suggestLoad,
} from '@/lib/workout';
import { recordSetIndex } from '@/lib/workout-progress';

export const runtime = 'nodejs';

/**
 * Une séance prête à dérouler, pour les apps natives : chaque exercice avec
 * sa consigne, son repos, la suggestion de charge, ses séries faites et
 * celles à faire déjà préremplies. Les règles sont celles de l'écran web
 * (`SessionRunner`), lues depuis `lib/workout` : rien n'est recalculé côté
 * client.
 *
 * `?swap=rang:exercice` remplace un exercice avant sa première série, comme
 * l'URL de la page web.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError('invalid_input');
  }

  const swaps = parseSwaps(new URL(request.url).searchParams.getAll('swap'));
  const data = await sessionRunnerFor(userId, id, swaps);
  if (data === null) {
    return apiError('not_found');
  }

  const { session, exercises } = data;
  const closed = session.finishedAt !== null;

  return Response.json({
    id: session.id,
    name: session.templateName ?? 'Séance libre',
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
    closed,
    visibility: session.visibility,
    favorited: data.favorited,
    canAddExercise: data.canAddExercise,
    plannedSets: exercises.reduce((total, entry) => total + entry.targetSets, 0),
    recordedSets: session.sets.length,
    volumeKg: sessionVolume(session.sets),
    visibilities: SESSION_VISIBILITIES.map((value) => ({
      value,
      label: VISIBILITY_LABELS[value],
      note: VISIBILITY_NOTES[value],
    })),
    exercises: exercises.map((entry) => {
      const history = data.previous[entry.exercise.id] ?? [];
      const suggestion = closed ? null : suggestLoad(entry, history);
      const recorded = session.sets.filter((set) => set.exerciseId === entry.exercise.id);
      const count = Math.max(entry.targetSets, ...recorded.map((set) => set.setIndex));
      const sets = Array.from({ length: count }, (_, index) => {
        const setIndex = index + 1;
        const done = recorded.find((set) => set.setIndex === setIndex);
        if (done !== undefined) {
          return {
            setIndex,
            done: true,
            weightKg: done.weightKg,
            reps: done.reps,
            seconds: done.seconds,
            toFailure: done.toFailure,
          };
        }
        const prefill = prefillMeasures(entry, history[setIndex - 1] ?? bestSet(history), suggestion);
        return { setIndex, done: false, ...prefill, toFailure: false };
      });
      return {
        position: entry.position,
        entryId: entry.id,
        exerciseId: entry.exercise.id,
        name: entry.exercise.name,
        kind: entry.exercise.kind,
        prescription: formatPrescription(entry),
        restSeconds: restAfterSet(entry, exercises),
        suggestion: suggestion === null ? null : { reason: suggestion.reason, trend: suggestion.trend },
        previous: history.length === 0 ? null : history.map((set) => formatSet(set)).join(' · '),
        recordSetIndex: recordSetIndex(entry.exercise.id, data.bests[entry.exercise.id] ?? null, session.sets),
        sets,
      };
    }),
    catalog: data.canAddExercise
      ? data.catalog.map((exercise) => ({ id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup }))
      : [],
  });
}
