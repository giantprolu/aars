import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { recordWeighIn } from '@/server/services/profile';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '@/lib/weight';

export const runtime = 'nodejs';

const weighInSchema = z.object({
  weightKg: z.number().finite().min(MIN_WEIGHT_KG).max(MAX_WEIGHT_KG),
});

/** Enregistre la pesée du jour. Elle remplace celle déjà faite aujourd'hui. */
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

  const parsed = weighInSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await recordWeighIn(userId, parsed.data.weightKg);
  if (result.kind === 'invalid') {
    return apiError('invalid_input');
  }
  return Response.json({ ok: true, profileUpdated: result.profileUpdated }, { status: 201 });
}
