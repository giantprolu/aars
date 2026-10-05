import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { fillWeek } from '@/server/services/plan-auto';
import { recordUsage } from '@/server/services/usage';
import { isJournalDate, startOfWeek } from '@/lib/date';
import { MEALS } from '@/lib/meal';

export const runtime = 'nodejs';

const bodySchema = z.object({
  weekStart: z.string().refine(isJournalDate, 'Date invalide.'),
  // Les repas à remplir. Absent : midi et soir, ce que les apps d'avant le
  // 05/10/2026 attendent et savent montrer.
  meals: z.array(z.enum(MEALS)).min(1).max(MEALS.length).optional(),
});

/** « Remplir la semaine » (Cuisine+) : pose un plat sur chaque repas libre demandé. */
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

  const result = await fillWeek(userId, parsed.data.weekStart, parsed.data.meals);
  if (result.kind === 'premium_required') {
    await recordUsage(userId, 'paywall_hit');
    return apiError('premium_required', 'Le plan automatique fait partie de Cuisine+.');
  }
  return Response.json({ placed: result.placed, added: result.added, empty: result.empty });
}
