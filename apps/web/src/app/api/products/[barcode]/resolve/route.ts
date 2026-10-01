import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { resolveBarcodeOnServer } from '@/server/services/products';

export const runtime = 'nodejs';

const BARCODE = /^\d{8}$|^\d{12}$|^\d{13}$/;

/**
 * Résout un code-barres pour les apps natives, dans l'ordre de la PWA
 * (`lib/client/products.ts`) : le cache produits d'abord, Open Food Facts
 * ensuite, et le produit trouvé entre aussitôt au cache.
 *
 * Le navigateur interrogeait Open Food Facts lui-même ; une app native passe
 * par ici, ce qui garde une seule règle et un seul cache.
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

  const result = await resolveBarcodeOnServer(barcode);
  return result.kind === 'error' ? apiError('upstream_unavailable') : Response.json(result);
}
