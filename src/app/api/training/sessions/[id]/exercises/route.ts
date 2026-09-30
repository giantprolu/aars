import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { addExerciseToSession } from '@/server/services/workouts';

export const runtime = 'nodejs';

const addSchema = z.object({ exerciseId: z.number().int().positive() });

/** Ajoute un exercice à une séance libre en cours. */
export async function POST(
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = addSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await addExerciseToSession(userId, id, parsed.data.exerciseId);
  switch (result.kind) {
    case 'added':
      return Response.json({ ok: true }, { status: 201 });
    case 'invalid':
      return apiError('invalid_input');
    case 'not_found':
      return apiError('not_found');
  }
}
