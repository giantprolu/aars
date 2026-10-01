import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { recordSet, removeSet } from '@/server/services/workouts';
import { MAX_REPS, MAX_SECONDS, MAX_SETS, MAX_WEIGHT_KG } from '@/lib/workout';

export const runtime = 'nodejs';

/**
 * Une série réalisée.
 *
 * Les trois mesures sont facultatives une à une mais pas toutes ensemble : le
 * service refuse une série vide, qui compterait dans le nombre de séries faites
 * sans rien dire de ce qui a été fait.
 */
const setSchema = z.object({
  sessionId: z.number().int().positive(),
  exerciseId: z.number().int().positive(),
  position: z.number().int().min(0).max(100),
  setIndex: z.number().int().min(1).max(MAX_SETS),
  weightKg: z.number().finite().min(0).max(MAX_WEIGHT_KG).nullable().default(null),
  reps: z.number().int().min(1).max(MAX_REPS).nullable().default(null),
  seconds: z.number().int().min(1).max(MAX_SECONDS).nullable().default(null),
  /** La série est allée jusqu'à l'échec musculaire. */
  toFailure: z.boolean().default(false),
});

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

  const parsed = setSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await recordSet(userId, parsed.data);
  if (result.kind === 'invalid') {
    return apiError('invalid_input', 'Série invalide.');
  }
  if (result.kind === 'not_found') {
    return apiError('not_found');
  }
  return Response.json({ ok: true }, { status: 201 });
}

const deleteSchema = z.object({ setId: z.number().int().positive() });

export async function DELETE(request: Request): Promise<Response> {
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

  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const removed = await removeSet(userId, parsed.data.setId);
  return removed ? new Response(null, { status: 204 }) : apiError('not_found');
}
