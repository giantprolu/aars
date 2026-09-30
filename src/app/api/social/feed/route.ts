import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { feedFor } from '@/server/services/social';

export const runtime = 'nodejs';

/** Une page du fil, avant la séance `before` si elle est donnée. */
export async function GET(request: Request): Promise<Response> {
  const viewerId = await currentUserId();
  if (viewerId === null) {
    return apiError('unauthorized');
  }
  const raw = new URL(request.url).searchParams.get('before');
  const before = raw === null ? null : Number(raw);
  if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) {
    return apiError('invalid_input');
  }
  return Response.json(await feedFor(viewerId, before));
}
