import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { candidatesFor } from '@/server/services/aliases';

export const runtime = 'nodejs';

const bodySchema = z.object({
  names: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
});

/** Candidats CIQUAL pour chaque nom reconnu (FR-18). */
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
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const results = await Promise.all(
    parsed.data.names.map(async (name) => ({
      name,
      candidates: await candidatesFor(userId, name),
    })),
  );

  return Response.json({ results });
}
