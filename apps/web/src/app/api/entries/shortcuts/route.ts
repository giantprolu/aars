import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { quantityShortcuts } from '@/server/services/entries';

export const runtime = 'nodejs';

const querySchema = z.object({
  sourceKind: z.enum(['ciqual', 'product', 'manual']),
  sourceRef: z.string().trim().min(1).max(64).nullable(),
  foodLabel: z.string().trim().min(1).max(200),
});

/** Les deux dernières quantités saisies pour un aliment (FR-9). */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    sourceKind: params.get('sourceKind'),
    sourceRef: params.get('sourceRef'),
    foodLabel: params.get('foodLabel'),
  });
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const quantities = await quantityShortcuts(
    userId,
    parsed.data.sourceKind,
    parsed.data.sourceRef,
    parsed.data.foodLabel,
  );
  return Response.json({ quantities });
}
