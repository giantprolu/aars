import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { findProduct, upsertProduct } from '@/server/db/queries/products';
import { lookupBarcode } from '@/lib/client/openfoodfacts';

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

  const cached = await findProduct(barcode);
  if (cached) {
    return Response.json({ kind: 'found', product: cached });
  }

  const lookup = await lookupBarcode(barcode);
  switch (lookup.kind) {
    case 'found': {
      const product = await upsertProduct({
        barcode: lookup.product.barcode,
        name: lookup.product.name,
        per100g: lookup.product.per100g,
        servingSizeG: lookup.product.servingSizeG,
        source: 'off',
      });
      return Response.json({ kind: 'found', product });
    }
    case 'incomplete':
      return Response.json({ kind: 'incomplete', partial: lookup.partial });
    case 'not_found':
      return Response.json({ kind: 'not_found' });
    case 'error':
      return apiError('upstream_unavailable');
  }
}
