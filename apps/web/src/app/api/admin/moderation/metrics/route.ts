import { apiError } from '@/server/errors';
import { adminActor, isAdminRequest } from '@/server/admin';
import { moderationMetrics } from '@/server/db/queries/admin';
import { can } from '@/lib/moderation/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Les indicateurs de la modération sur `?days=` jours (30 par défaut, 365 au plus). */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  if (!can(adminActor(request).role, 'queue.read')) {
    return apiError('forbidden');
  }
  const raw = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const days = Number.isInteger(raw) && raw >= 1 && raw <= 365 ? raw : 30;
  return Response.json(await moderationMetrics(days));
}
