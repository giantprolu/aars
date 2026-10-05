import { apiError } from '@/server/errors';
import { adminActor, isAdminRequest } from '@/server/admin';
import { moderationQueue } from '@/server/db/queries/admin';
import { can } from '@/lib/moderation/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** La file de modération : dossiers à traiter par priorité, ou `?status=closed` pour les 100 derniers clos. */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  if (!can(adminActor(request).role, 'queue.read')) {
    return apiError('forbidden');
  }
  const status = new URL(request.url).searchParams.get('status') === 'closed' ? 'closed' : 'open';
  return Response.json({ status, cases: await moderationQueue(status) });
}
