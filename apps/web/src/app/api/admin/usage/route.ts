import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { adminUsage } from '@/server/db/queries/admin';
import { todayInParis } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tableau de bord : les compteurs d'usage par jour, `?days=` de 7 à 90 (30 par défaut). */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const asked = Number(new URL(request.url).searchParams.get('days') ?? '30');
  const days = Number.isInteger(asked) ? Math.min(90, Math.max(7, asked)) : 30;
  const today = todayInParis();
  return Response.json({ today, days, points: await adminUsage(today, days) });
}
