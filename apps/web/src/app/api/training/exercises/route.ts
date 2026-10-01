import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { favoriteExerciseIdsFor, fullExerciseCatalog } from '@/server/services/workouts';

export const runtime = 'nodejs';

/**
 * Le catalogue d'exercices et les favoris de l'utilisateur, pour composer une
 * séance depuis les apps natives (comme `app/training/compose/page.tsx`).
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const [catalog, favorites] = await Promise.all([fullExerciseCatalog(), favoriteExerciseIdsFor(userId)]);
  return Response.json({
    exercises: catalog.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      kind: exercise.kind,
      muscleGroup: exercise.muscleGroup,
    })),
    favoriteIds: favorites,
  });
}
