import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { repeatEntry } from '@/server/services/entries';
import { MEALS } from '@/lib/meal';
import { recordMeal } from '@/server/services/usage';

export const runtime = 'nodejs';

const repeatSchema = z.object({
  entryId: z.number().int().positive(),
  meal: z.enum(MEALS),
});

/**
 * Refait une entrée passée dans le journal du jour.
 *
 * Le corps ne porte que l'identifiant et le repas : l'aliment, la quantité et
 * les macros sont relus en base, parmi les entrées de l'utilisateur seulement.
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

  const parsed = repeatSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await repeatEntry(userId, parsed.data.entryId, parsed.data.meal);
  if (result.kind === 'not_found') {
    return apiError('not_found');
  }
  await recordMeal(userId, 'recent');
  return Response.json({ entry: result.entry }, { status: 201 });
}
