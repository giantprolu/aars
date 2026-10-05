import { requireUserId } from '@/server/guard';
import { favoriteExerciseIdsFor, pickableExerciseCatalog } from '@/server/services/workouts';
import { ComposeForm } from './ComposeForm';

export const dynamic = 'force-dynamic';

/**
 * Composer une séance en touchant des exercices.
 *
 * Composant serveur, aucun import client (AD-10). Le catalogue entier est
 * proposé, et non celui de la salle choisie : on compose aussi pour la salle
 * d'un week-end, et un exercice absent de la liste ne se choisit pas.
 */
export default async function ComposePage() {
  const userId = await requireUserId();
  const [catalog, favorites] = await Promise.all([
    pickableExerciseCatalog(),
    favoriteExerciseIdsFor(userId),
  ]);
  return <ComposeForm catalog={catalog} initialFavorites={favorites} />;
}
