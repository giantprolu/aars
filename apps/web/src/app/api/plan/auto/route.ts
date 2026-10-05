import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { fillWeek } from '@/server/services/plan-auto';
import { recordUsage } from '@/server/services/usage';
import { isJournalDate, startOfWeek } from '@/lib/date';

export const runtime = 'nodejs';

const bodySchema = z.object({
  weekStart: z.string().refine(isJournalDate, 'Date invalide.'),
});

/** « Remplir la semaine » (Cuisine+) : pose un plat sur chaque repas libre. */
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
  const parsed = bodySchema.safeParse(payload);
  // Le panier et le plan se rangent par lundi : un autre jour ne désigne
  // aucune semaine.
  if (!parsed.success || startOfWeek(parsed.data.weekStart) !== parsed.data.weekStart) {
    return apiError('invalid_input');
  }

  const result = await fillWeek(userId, parsed.data.weekStart);
  if (result.kind === 'premium_required') {
    await recordUsage(userId, 'paywall_hit');
    return apiError('premium_required', 'Le plan automatique fait partie de Cuisine+.');
  }
  return Response.json({ placed: result.placed, added: result.added, empty: result.empty });
}
