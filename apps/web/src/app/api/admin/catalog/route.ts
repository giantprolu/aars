import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { adminCatalog } from '@/server/db/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tableau de bord : les plats du catalogue, tous objectifs, avec leur photo. */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  return Response.json({ meals: await adminCatalog() });
}
