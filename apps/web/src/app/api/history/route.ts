import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { historyPage } from '@/server/services/entries';

export const runtime = 'nodejs';

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Pages suivantes de l'historique, chargées progressivement (FR-20). */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    offset: params.get('offset') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const days = await historyPage(userId, parsed.data.limit, parsed.data.offset);
  return Response.json({ days });
}
