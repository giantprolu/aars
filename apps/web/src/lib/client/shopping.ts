import type { IngredientRefKind } from '../recipe';

/**
 * Appels navigateur vers les routes de la liste de courses.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

export type GenerateListOutcome =
  | { kind: 'generated' }
  | { kind: 'empty' }
  | { kind: 'error' };

/** Engendre la liste depuis le panier de la semaine commençant à `from`. */
export async function generateList(from: string): Promise<GenerateListOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from }),
    });
  } catch {
    return { kind: 'error' };
  }

  // 400 ne signifie ici qu'une chose : rien n'était prévu sur la période.
  if (response.status === 400) {
    return { kind: 'empty' };
  }
  return response.ok ? { kind: 'generated' } : { kind: 'error' };
}

export type ItemOutcome = { kind: 'ok' } | { kind: 'error' };

/**
 * Coche ou décoche un article.
 *
 * `barcode` n'est renseigné que lorsque l'article a été coché en scannant le
 * produit en rayon. Il est alors retenu comme le produit acheté pour cet
 * ingrédient, et servira aux macros des prochains repas.
 */
export async function checkItem(input: {
  id: number;
  checked: boolean;
  barcode: string | null;
  refKind: IngredientRefKind;
  refValue: string;
}): Promise<ItemOutcome> {
  try {
    const response = await fetch(`/api/shopping/items/${input.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        checked: input.checked,
        barcode: input.barcode,
        refKind: input.refKind,
        refValue: input.refValue,
      }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export async function removeItem(id: number): Promise<ItemOutcome> {
  try {
    const response = await fetch(`/api/shopping/items/${id}`, { method: 'DELETE' });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
