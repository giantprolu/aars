import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { createRecoveryCode } from '@/server/services/account';

export const runtime = 'nodejs';

/**
 * Tire un nouveau code de secours et le rend, une seule fois.
 *
 * La réponse n'est jamais mise en cache : c'est la seule occasion de lire le
 * code en clair, la base n'en garde que l'empreinte.
 */
export async function POST(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  return Response.json(
    { code: await createRecoveryCode(userId) },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  );
}
