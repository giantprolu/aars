import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { rememberAlias } from '@/server/services/aliases';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetKind: z.enum(['ciqual', 'product']),
  targetRef: z.string().trim().min(1).max(64),
});

/** Mémorise le choix de l'utilisateur pour un nom reconnu (FR-19). */
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

  await rememberAlias(userId, parsed.data.name, parsed.data.targetKind, parsed.data.targetRef);
  return Response.json({ ok: true });
}
