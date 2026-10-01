import type { Entry, Macros, SourceKind } from '../types';
import type { Meal } from '../meal';

/**
 * Appels navigateur vers les routes d'entrées.
 * Résultats discriminés plutôt qu'exceptions (AD-12) : l'interface aiguille
 * sur la variante au lieu d'afficher un message générique.
 */

export type CreateEntryResult =
  | { kind: 'created'; entry: Entry }
  | { kind: 'invalid' }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

export interface CreateEntryPayload {
  foodLabel: string;
  per100g: Macros;
  quantityG: number;
  sourceKind: SourceKind;
  sourceRef: string | null;
  meal: Meal;
}

export async function createEntry(payload: CreateEntryPayload): Promise<CreateEntryResult> {
  let response: Response;
  try {
    response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 401) {
    return { kind: 'unauthorized' };
  }
  if (response.status === 400) {
    return { kind: 'invalid' };
  }
  if (!response.ok) {
    return { kind: 'error' };
  }

  const body = (await response.json()) as { entry: Entry };
  return { kind: 'created', entry: body.entry };
}

/** Les dernières quantités saisies pour un aliment (FR-9). Silencieux en cas d'échec. */
export async function fetchRecentQuantities(
  sourceKind: SourceKind,
  sourceRef: string | null,
  foodLabel: string,
): Promise<number[]> {
  const params = new URLSearchParams({ sourceKind, foodLabel });
  if (sourceRef !== null) {
    params.set('sourceRef', sourceRef);
  }

  try {
    const response = await fetch(`/api/entries/shortcuts?${params.toString()}`);
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as { quantities: number[] };
    return body.quantities;
  } catch {
    return [];
  }
}
