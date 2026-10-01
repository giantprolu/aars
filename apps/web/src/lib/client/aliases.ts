import type { Candidate } from '../types';

/** Candidats et alias mémorisés (FR-18, FR-19). */

export interface CandidatesForName {
  name: string;
  candidates: Candidate[];
}

export async function fetchCandidates(names: readonly string[]): Promise<CandidatesForName[]> {
  try {
    const response = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    if (!response.ok) {
      return names.map((name) => ({ name, candidates: [] }));
    }
    const body = (await response.json()) as { results: CandidatesForName[] };
    return body.results;
  } catch {
    return names.map((name) => ({ name, candidates: [] }));
  }
}

/** Mémorise le choix pour que la même reconnaissance le propose en tête (FR-19). */
export async function rememberAlias(
  name: string,
  targetKind: 'ciqual' | 'product',
  targetRef: string,
): Promise<void> {
  try {
    await fetch('/api/aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, targetKind, targetRef }),
    });
  } catch {
    // L'échec de mémorisation ne doit pas empêcher l'enregistrement de l'entrée.
  }
}
