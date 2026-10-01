import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { answerRequest, follow, removeFollower, unfollow } from '@/server/services/social';

export const runtime = 'nodejs';

/**
 * Tous les gestes sur une relation, désignés par leur nom.
 *
 * `follow` et `unfollow` partent de moi vers l'autre ; `accept`, `decline` et
 * `remove` portent sur quelqu'un qui me suit ou le demande. L'autre compte est
 * désigné par son identifiant numérique, jamais par une adresse.
 */
const relationSchema = z.object({
  action: z.enum(['follow', 'unfollow', 'accept', 'decline', 'remove']),
  userId: z.number().int().positive(),
});

export async function POST(request: Request): Promise<Response> {
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

  const parsed = relationSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const { action, userId } = parsed.data;
  switch (action) {
    case 'follow':
      return (await follow(viewerId, userId))
        ? Response.json({ ok: true })
        : apiError('invalid_input', 'Choisis d’abord ton identifiant.');
    case 'unfollow':
      await unfollow(viewerId, userId);
      return Response.json({ ok: true });
    case 'accept':
    case 'decline':
      return (await answerRequest(viewerId, userId, action === 'accept'))
        ? Response.json({ ok: true })
        : apiError('not_found');
    case 'remove':
      await removeFollower(viewerId, userId);
      return Response.json({ ok: true });
  }
}
