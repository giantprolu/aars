import { notFound } from 'next/navigation';
import { requireUserId } from '@/server/guard';
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
} from '@/server/services/workouts';
import { parseSwaps, resolveSessionExercises, type Exercise, type WorkoutSet } from '@/lib/workout';
import type { PersonalBest } from '@/lib/workout-progress';
import { SessionRunner } from './SessionRunner';

export const dynamic = 'force-dynamic';

/**
 * Une séance, en cours ou terminée.
 *
 * La performance précédente est chargée ici et non dans le composant client :
 * c'est une lecture de base, et la faire depuis le navigateur ajouterait un
 * aller-retour au moment précis où l'on veut voir sa charge, entre deux séries.
 * Elle porte sur l'exercice réellement fait, remplacements compris : c'est
 * devant le tirage horizontal qu'on veut savoir ce qu'on y a mis la dernière
 * fois, pas devant le pec deck qu'on a laissé.
 *
 * Un remplacement fait aux deux dernières séances est réappliqué d'office. Il
 * reste une intention, que l'adresse peut contredire (`rang:0`) : la machine
 * habituellement prise peut être libre aujourd'hui.
 */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ swap?: string | string[] }>;
}) {
  const userId = await requireUserId();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    notFound();
  }

  const session = await sessionFor(userId, id);
  if (session === null) {
    notFound();
  }

  const closed = session.finishedAt !== null;
  const [template, catalog, available] = await Promise.all([
    session.templateId === null ? null : templateFor(userId, session.templateId),
    fullExerciseCatalog(),
    // Une séance terminée ne se modifie plus : inutile de lire la salle.
    closed ? ([] as Exercise[]) : exerciseCatalog(userId),
  ]);

  // Une séance terminée ne prend plus d'intention : seules ses séries parlent.
  const habits =
    closed || template === null
      ? new Map<number, number>()
      : await habitualSwapsFor(userId, template, session.id);
  const swaps = closed ? new Map<number, number>() : parseSwaps((await searchParams).swap);
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

  // Une séance libre en cours reçoit des exercices en route ; une séance
  // terminée peut rejoindre les favoris, et doit dire si elle y est déjà.
  const canAddExercise = !closed && template?.kind === 'adhoc';
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

  // Les cartes deviennent des objets simples : une Map ne traverse pas la
  // frontière serveur/client, qui sérialise en JSON.
  const previousByExercise: Record<number, WorkoutSet[]> = {};
  for (const [exerciseId, sets] of previous) {
    previousByExercise[exerciseId] = sets;
  }
  const bestByExercise: Record<number, PersonalBest | null> = {};
  for (const [exerciseId, best] of bests) {
    bestByExercise[exerciseId] = best;
  }
  const habitual = exercises
    .filter((entry) => entry.planned !== null && habits.get(entry.position) === entry.exercise.id)
    .map((entry) => entry.position);

  return (
    <SessionRunner
      session={session}
      exercises={exercises}
      previous={previousByExercise}
      bests={bestByExercise}
      habitual={habitual}
      catalog={available}
      canAddExercise={canAddExercise}
      favorited={favorited}
      favoriteExercises={favoriteExercises}
    />
  );
}
