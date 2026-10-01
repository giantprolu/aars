import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { addManualItem } from '@/server/services/shopping';
import { isJournalDate, startOfWeek } from '@/lib/date';
import { MAX_QUANTITY_G } from '@/lib/nutrition';

export const runtime = 'nodejs';

const addSchema = z.object({
  from: z.string().refine(isJournalDate, 'Date invalide.'),
  refKind: z.enum(['ciqual', 'product']),
  refValue: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  quantityG: z.number().int().positive().max(MAX_QUANTITY_G - 1),
});

/** Ajoute un article à la main à la liste de la semaine (« Un article »). */
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

  const parsed = addSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const { from, ...item } = parsed.data;
  const id = await addManualItem(userId, startOfWeek(from), item);
  return id === null ? apiError('not_found', 'Pas de liste pour cette semaine.') : Response.json({ id }, { status: 201 });
}
