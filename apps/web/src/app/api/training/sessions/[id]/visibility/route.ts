import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { shareSession } from '@/server/services/social';
import { SESSION_VISIBILITIES } from '@/lib/social';

export const runtime = 'nodejs';

const visibilitySchema = z.object({ visibility: z.enum(SESSION_VISIBILITIES) });

/** Règle ce que les abonnés voient d'une de mes séances. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError('invalid_input');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = visibilitySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const saved = await shareSession(userId, id, parsed.data.visibility);
  return saved ? Response.json({ ok: true }) : apiError('not_found');
}
