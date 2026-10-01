import {
  exerciseCatalog,
  favoriteExerciseIdsFor,
  fullExerciseCatalog,
  habitualSwapsFor,
  isSessionFavorited,
  personalBests,
  previousPerformance,
  sessionFor,
  templateFor,
} from './workouts';
import {
  resolveSessionExercises,
  type Exercise,
  type SessionExercise,
  type WorkoutSession,
  type WorkoutSet,
} from '@/lib/workout';
import type { PersonalBest } from '@/lib/workout-progress';

/** Tout ce que l'écran d'une séance lit, pour la page web comme pour l'API. */
export interface SessionRunnerData {
  session: WorkoutSession;
  exercises: SessionExercise[];
  previous: Record<number, WorkoutSet[]>;
  bests: Record<number, PersonalBest | null>;
  /** Rangs dont l'exercice vient d'un remplacement habituel. */
  habitual: number[];
  /** Exercices qu'on peut ajouter, vide une fois la séance close. */
  catalog: Exercise[];
  canAddExercise: boolean;
  favorited: boolean;
  favoriteExercises: number[];
}

/**
 * Lit une séance et ce qui l'entoure : le programme, les remplacements, la
 * dernière fois et les records. `null` si la séance n'est pas à l'utilisateur.
 */
export async function sessionRunnerFor(
  userId: number,
  id: number,
  requestedSwaps: Map<number, number>,
): Promise<SessionRunnerData | null> {
  const session = await sessionFor(userId, id);
  if (session === null) {
    return null;
  }

  const closed = session.finishedAt !== null;
  const [template, catalog, available] = await Promise.all([
    session.templateId === null ? null : templateFor(userId, session.templateId),
    fullExerciseCatalog(),
    closed ? ([] as Exercise[]) : exerciseCatalog(userId),
  ]);

  const habits =
    closed || template === null
      ? new Map<number, number>()
      : await habitualSwapsFor(userId, template, session.id);
  const swaps = closed ? new Map<number, number>() : requestedSwaps;
  for (const [position, exerciseId] of habits) {
    if (!swaps.has(position)) {
      swaps.set(position, exerciseId);
    }
  }

  const exercises = resolveSessionExercises(
    template?.exercises ?? [],
    session.sets,
    swaps,
    new Map(catalog.map((exercise) => [exercise.id, exercise])),
  );

  const [previous, bests, favorited, favoriteExercises] = await Promise.all([
    previousPerformance(
      userId,
      exercises.map((entry) => entry.exercise.id),
      session.id,
    ),
    personalBests(
      userId,
      exercises.map((entry) => entry.exercise),
      session.id,
    ),
    closed ? isSessionFavorited(userId, session.id) : Promise.resolve(false),
    closed ? Promise.resolve([] as number[]) : favoriteExerciseIdsFor(userId),
  ]);

  const previousByExercise: Record<number, WorkoutSet[]> = {};
  for (const [exerciseId, sets] of previous) {
    previousByExercise[exerciseId] = sets;
  }
  const bestByExercise: Record<number, PersonalBest | null> = {};
  for (const [exerciseId, best] of bests) {
    bestByExercise[exerciseId] = best;
  }

  return {
    session,
    exercises,
    previous: previousByExercise,
    bests: bestByExercise,
    habitual: exercises
      .filter((entry) => entry.planned !== null && habits.get(entry.position) === entry.exercise.id)
      .map((entry) => entry.position),
    catalog: available,
    canAddExercise: !closed && template?.kind === 'adhoc',
    favorited,
    favoriteExercises,
  };
}
