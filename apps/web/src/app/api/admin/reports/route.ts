import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { adminReports } from '@/server/db/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tableau de bord : signalements ouverts, ou `?status=resolved` pour les 100 derniers clos. */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const status = new URL(request.url).searchParams.get('status') === 'resolved' ? 'resolved' : 'open';
  return Response.json({ status, reports: await adminReports(status) });
}
