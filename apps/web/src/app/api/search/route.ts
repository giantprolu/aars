import { z } from 'zod';
import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { MIN_QUERY_LENGTH, search } from '@/server/services/search';

export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH).max(100),
});

/** Recherche textuelle dans CIQUAL et le cache produits (FR-7). */
export async function GET(request: Request): Promise<Response> {
  if (!(await hasSession())) {
    return apiError('unauthorized');
  }

  const parsed = querySchema.safeParse({
    q: new URL(request.url).searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const hits = await search(parsed.data.q);
  return Response.json({ hits });
}
