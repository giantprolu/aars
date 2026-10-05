import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { answerRequest, block, follow, removeFollower, unblock, unfollow } from '@/server/services/social';

export const runtime = 'nodejs';

/**
 * Tous les gestes sur une relation, désignés par leur nom.
 *
 * `follow` et `unfollow` partent de moi vers l'autre ; `accept`, `decline` et
 * `remove` portent sur quelqu'un qui me suit ou le demande ; `block` et
 * `unblock` coupent ou rétablissent la possibilité de toute relation. L'autre
 * compte est désigné par son identifiant numérique, jamais par une adresse.
 */
const relationSchema = z.object({
  action: z.enum(['follow', 'unfollow', 'accept', 'decline', 'remove', 'block', 'unblock']),
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
    {
      const result = await follow(viewerId, userId);
      switch (result.kind) {
        case 'requested':
          return Response.json({ ok: true });
        case 'no_identity':
          return apiError('invalid_input', 'Choisis d’abord ton identifiant.');
        case 'unavailable':
          return apiError('not_found');
        case 'restricted':
          return apiError('community_restricted', result.message);
        case 'rate_limited':
          return apiError('rate_limited');
      }
      break;
    }
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
    case 'block':
      return (await block(viewerId, userId)) ? Response.json({ ok: true }) : apiError('not_found');
    case 'unblock':
      await unblock(viewerId, userId);
      return Response.json({ ok: true });
  }
}
