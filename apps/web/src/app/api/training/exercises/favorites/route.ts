import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { favoriteExercise, favoriteExerciseIdsFor } from '@/server/services/workouts';

export const runtime = 'nodejs';

/** Les exercices mis en favori. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  return Response.json({ exerciseIds: await favoriteExerciseIdsFor(userId) });
}

const putSchema = z.object({
  exerciseId: z.number().int().positive(),
  favorite: z.boolean(),
});

/** Met un exercice en favori ou l'en retire. Rejouable. */
export async function PUT(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = putSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const saved = await favoriteExercise(userId, parsed.data.exerciseId, parsed.data.favorite);
  return saved ? Response.json({ ok: true }) : apiError('not_found');
}
