import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { editTemplateExercise } from '@/server/services/workouts';
import { MAX_REST_SECONDS, MIN_REST_SECONDS } from '@/lib/workout';

export const runtime = 'nodejs';

/**
 * Modifie un exercice du programme.
 *
 * `exerciseId` inscrit un remplacement pour de bon ; `restSeconds` règle le
 * repos, `null` rendant la main au repos déduit de la prescription.
 */
const patchSchema = z
  .object({
    entryId: z.number().int().positive(),
    exerciseId: z.number().int().positive().optional(),
    restSeconds: z.number().int().min(MIN_REST_SECONDS).max(MAX_REST_SECONDS).nullable().optional(),
  })
  .refine((body) => body.exerciseId !== undefined || body.restSeconds !== undefined);

export async function PATCH(request: Request): Promise<Response> {
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

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const { entryId, exerciseId, restSeconds } = parsed.data;
  const result = await editTemplateExercise(userId, entryId, {
    ...(exerciseId === undefined ? {} : { exerciseId }),
    ...(restSeconds === undefined ? {} : { restSeconds }),
  });
  if (result.kind === 'invalid') {
    return apiError('invalid_input');
  }
  if (result.kind === 'not_found') {
    return apiError('not_found');
  }
  return Response.json({ ok: true });
}
