import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { giveKudos } from '@/server/services/social';

export const runtime = 'nodejs';

const kudosSchema = z.object({
  sessionId: z.number().int().positive(),
  given: z.boolean(),
});

/** Laisse ou retire un bravo sur une séance qu'on a le droit de voir. */
export async function PUT(request: Request): Promise<Response> {
  const viewerId = await currentUserId();
  if (viewerId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = kudosSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const saved = await giveKudos(viewerId, parsed.data.sessionId, parsed.data.given);
  // Une séance invisible répond comme une séance inexistante : rien ne doit
  // permettre de sonder ce qu'un autre a fait.
  return saved ? Response.json({ ok: true }) : apiError('not_found');
}
