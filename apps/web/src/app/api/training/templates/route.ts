import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { composeTemplate, startSession } from '@/server/services/workouts';
import {
  MAX_REPS,
  MAX_SECONDS,
  MAX_SETS,
  MAX_TEMPLATE_EXERCISES,
  MAX_TEMPLATE_NAME,
} from '@/lib/workout';

export const runtime = 'nodejs';

const composeSchema = z.object({
  name: z.string().max(MAX_TEMPLATE_NAME).nullable().default(null),
  exercises: z
    .array(
      z.object({
        exerciseId: z.number().int().positive(),
        sets: z.number().int().min(1).max(MAX_SETS),
        reps: z.number().int().min(1).max(MAX_REPS).nullable(),
        seconds: z.number().int().min(1).max(MAX_SECONDS).nullable(),
      }),
    )
    .min(1)
    .max(MAX_TEMPLATE_EXERCISES),
  /** Ranger la séance dans les favoris. */
  keep: z.boolean(),
  /** L'ouvrir aussitôt écrite. */
  start: z.boolean().default(false),
});

/**
 * Écrit une séance composée, et l'ouvre si on le demande.
 *
 * Les deux gestes partent d'un seul appel : composer puis commencer est le
 * cas courant, et deux allers-retours en salle sont un de trop.
 */
export async function POST(request: Request): Promise<Response> {
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

  const parsed = composeSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const { start, ...input } = parsed.data;
  const composed = await composeTemplate(userId, input);
  if (composed.kind === 'invalid') {
    return apiError('invalid_input');
  }

  if (!start) {
    return Response.json({ templateId: composed.templateId }, { status: 201 });
  }
  const session = await startSession(userId, composed.templateId);
  return Response.json(
    {
      templateId: composed.templateId,
      sessionId: session.kind === 'not_found' ? null : session.id,
      alreadyOpen: session.kind === 'already_open',
    },
    { status: 201 },
  );
}
