import { findProduct, upsertProduct } from '../db/queries/products';
import { lookupBarcode } from '@/lib/client/openfoodfacts';
import type { OffPartialProduct, ReferenceFood } from '@/lib/types';

export type ServerResolveResult =
  | { kind: 'found'; product: ReferenceFood }
  | { kind: 'incomplete'; partial: OffPartialProduct }
  | { kind: 'not_found' }
  | { kind: 'error' };

/**
 * Résout un code-barres côté serveur, dans l'ordre de la PWA
 * (`lib/client/products.ts`) : le cache produits d'abord, Open Food Facts
 * ensuite, et le produit trouvé entre aussitôt au cache.
 */
export async function resolveBarcodeOnServer(barcode: string): Promise<ServerResolveResult> {
  const cached = await findProduct(barcode);
  if (cached) {
    return { kind: 'found', product: cached };
  }
  const lookup = await lookupBarcode(barcode);
  switch (lookup.kind) {
    case 'found':
      return {
        kind: 'found',
        product: await upsertProduct({
          barcode: lookup.product.barcode,
          name: lookup.product.name,
          per100g: lookup.product.per100g,
          servingSizeG: lookup.product.servingSizeG,
          source: 'off',
        }),
      };
    case 'incomplete':
      return { kind: 'incomplete', partial: lookup.partial };
    case 'not_found':
      return { kind: 'not_found' };
    case 'error':
      return { kind: 'error' };
  }
}
