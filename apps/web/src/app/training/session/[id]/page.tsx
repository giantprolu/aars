import { notFound } from 'next/navigation';
import { requireUserId } from '@/server/guard';
import { sessionRunnerFor } from '@/server/services/session-runner';
import { parseSwaps } from '@/lib/workout';
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

  const data = await sessionRunnerFor(userId, id, parseSwaps((await searchParams).swap));
  if (data === null) {
    notFound();
  }

  return (
    <SessionRunner
      session={data.session}
      exercises={data.exercises}
      previous={data.previous}
      bests={data.bests}
      habitual={data.habitual}
      catalog={data.catalog}
      canAddExercise={data.canAddExercise}
      favorited={data.favorited}
      favoriteExercises={data.favoriteExercises}
    />
  );
}
