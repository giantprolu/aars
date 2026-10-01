import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { findProduct } from '@/server/db/queries/products';

export const runtime = 'nodejs';

const BARCODE = /^\d{8}$|^\d{12}$|^\d{13}$/;

/**
 * Lecture du cache produits (FR-12).
 * Le cache est consulté par une route serveur, la table Postgres n'étant pas
 * accessible depuis le navigateur. L'appel à Open Food Facts, lui, part du
 * navigateur (AD-2) : cette route ne le contacte jamais.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ barcode: string }> },
): Promise<Response> {
  if (!(await hasSession())) {
    return apiError('unauthorized');
  }

  const { barcode } = await context.params;
  if (!BARCODE.test(barcode)) {
    return apiError('invalid_input');
  }

  const product = await findProduct(barcode);
  if (!product) {
    return apiError('not_found');
  }
  return Response.json({ product });
}
