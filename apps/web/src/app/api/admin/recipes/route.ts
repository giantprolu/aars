import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { adminOwnRecipes } from '@/server/db/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tableau de bord : les recettes écrites ou importées, sans photo d'abord. */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  return Response.json({ recipes: await adminOwnRecipes() });
}
