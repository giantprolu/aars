import { notFound } from "next/navigation";
import { requireUserId } from "@/server/guard";
import {
  exerciseCatalog,
  fullExerciseCatalog,
  previousPerformance,
  sessionFor,
  templateFor,
} from "@/server/services/workouts";
import {
  parseSwaps,
  resolveSessionExercises,
  type Exercise,
  type WorkoutSet,
} from "@/lib/workout";
import { SessionRunner } from "./SessionRunner";

export const dynamic = "force-dynamic";

/**
 * Une séance, en cours ou terminée.
 *
 * La performance précédente est chargée ici et non dans le composant client :
 * c'est une lecture de base, et la faire depuis le navigateur ajouterait un
 * aller-retour au moment précis où l'on veut voir sa charge, entre deux séries.
 * Elle porte sur l'exercice réellement fait, remplacements compris : c'est
 * devant le tirage horizontal qu'on veut savoir ce qu'on y a mis la dernière
 * fois, pas devant le pec deck qu'on a laissé.
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
    session.templateId === null
      ? null
      : templateFor(userId, session.templateId),
    fullExerciseCatalog(),
    // Une séance terminée ne se modifie plus : inutile de lire la salle.
    closed ? ([] as Exercise[]) : exerciseCatalog(userId),
  ]);

  // Une séance terminée ne prend plus d'intention : seules ses séries parlent.
  const swaps = closed
    ? new Map<number, number>()
    : parseSwaps((await searchParams).swap);
  const exercises = resolveSessionExercises(
    template?.exercises ?? [],
    session.sets,
    swaps,
    new Map(catalog.map((exercise) => [exercise.id, exercise])),
  );

  const previous = await previousPerformance(
    userId,
    exercises.map((entry) => entry.exercise.id),
    session.id,
  );

  // La carte devient un objet simple : une Map ne traverse pas la frontière
  // serveur/client, qui sérialise en JSON.
  const previousByExercise: Record<number, WorkoutSet[]> = {};
  for (const [exerciseId, sets] of previous) {
    previousByExercise[exerciseId] = sets;
  }

  return (
    <SessionRunner
      session={session}
      exercises={exercises}
      previous={previousByExercise}
      catalog={available}
    />
  );
}
