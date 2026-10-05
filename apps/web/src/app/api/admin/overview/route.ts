import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { adminOverview } from '@/server/db/queries/admin';
import { SALES_OPEN } from '@/lib/premium';
import { startOfWeek, todayInParis } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tableau de bord : la vue d'ensemble (comptes, actifs, recettes, abonnés). */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const today = todayInParis();
  const overview = await adminOverview(today, startOfWeek(today));
  return Response.json({ ...overview, salesOpen: SALES_OPEN, today });
}
