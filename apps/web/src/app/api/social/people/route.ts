import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { findPeople } from '@/server/services/social';

export const runtime = 'nodejs';

/** Cherche des comptes par identifiant ou par nom. Jamais par adresse. */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.length > 60) {
    return apiError('invalid_input');
  }
  return Response.json({ people: await findPeople(userId, query) });
}
