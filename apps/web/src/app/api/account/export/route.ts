import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { todayInParis } from '@/lib/date';
import { exportAccount } from '@/server/services/account';

export const runtime = 'nodejs';

/** Toutes les données du compte, en un fichier JSON à télécharger. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const data = await exportAccount(userId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="nutriperso-${todayInParis()}.json"`,
      'cache-control': 'no-store',
    },
  });
}
