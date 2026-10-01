import type { OffPartialProduct, ReferenceFood } from '../types';
import { lookupBarcode } from './openfoodfacts';

/**
 * Résolution d'un code-barres (FR-12, FR-13, FR-14).
 *
 * Ordre imposé : le cache produits d'abord, Open Food Facts ensuite. Un produit
 * déjà scanné se résout donc sans aucun appel réseau externe, ce qui rend le
 * parcours de scan tenable en trois interactions (UX-DR-4).
 */

export type ResolveResult =
  | { kind: 'cached'; product: ReferenceFood }
  | { kind: 'fetched'; product: ReferenceFood }
  | { kind: 'incomplete'; partial: OffPartialProduct }
  | { kind: 'not_found'; barcode: string }
  | { kind: 'upstream_error'; barcode: string; reason: 'timeout' | 'network' | 'malformed' };

async function readCache(barcode: string): Promise<ReferenceFood | null> {
  try {
    const response = await fetch(`/api/products/${barcode}`);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { product: ReferenceFood };
    return body.product;
  } catch {
    return null;
  }
}

/** Pousse un produit résolu dans le cache (FR-14). L'échec n'interrompt pas le parcours. */
export async function cacheProduct(input: {
  barcode: string;
  name: string;
  per100g: ReferenceFood['per100g'];
  servingSizeG: number | null;
  source: 'off' | 'manual';
}): Promise<ReferenceFood | null> {
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { product: ReferenceFood };
    return body.product;
  } catch {
    return null;
  }
}

export async function resolveBarcode(barcode: string): Promise<ResolveResult> {
  const cached = await readCache(barcode);
  if (cached) {
    return { kind: 'cached', product: cached };
  }

  const lookup = await lookupBarcode(barcode);

  switch (lookup.kind) {
    case 'found': {
      // Le cache est alimenté immédiatement : le prochain scan sera local.
      const stored = await cacheProduct({
        barcode: lookup.product.barcode,
        name: lookup.product.name,
        per100g: lookup.product.per100g,
        servingSizeG: lookup.product.servingSizeG,
        source: 'off',
      });
      return {
        kind: 'fetched',
        product: stored ?? {
          kind: 'product',
          ref: lookup.product.barcode,
          name: lookup.product.name,
          per100g: lookup.product.per100g,
          servingSizeG: lookup.product.servingSizeG,
        },
      };
    }
    case 'incomplete':
      return { kind: 'incomplete', partial: lookup.partial };
    case 'not_found':
      return { kind: 'not_found', barcode };
    case 'error':
      return { kind: 'upstream_error', barcode, reason: lookup.reason };
  }
}
