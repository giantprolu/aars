import type { Meal } from '../meal';

/**
 * Appels navigateur vers les routes du plan de la semaine.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

export type PlanMealOutcome =
  | { kind: 'planned'; id: number }
  | { kind: 'invalid' }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

export async function planMeal(input: {
  planDate: string;
  meal: Meal;
  recipeId: number;
  servings: number;
}): Promise<PlanMealOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 401) {
    return { kind: 'unauthorized' };
  }
  if (response.status === 400 || response.status === 404) {
    return { kind: 'invalid' };
  }
  if (!response.ok) {
    return { kind: 'error' };
  }

  const body = (await response.json()) as { id: number };
  return { kind: 'planned', id: body.id };
}

export type UnplanOutcome = { kind: 'removed' } | { kind: 'error' };

export async function unplanMeal(id: number): Promise<UnplanOutcome> {
  try {
    const response = await fetch(`/api/plan/${id}`, { method: 'DELETE' });
    return response.ok ? { kind: 'removed' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export type JournalMealOutcome =
  /** `skipped` porte les ingrédients sans fiche : le total du jour est incomplet. */
  | { kind: 'journaled'; created: number; skipped: string[] }
  | { kind: 'refused'; message: string }
  | { kind: 'error' };

async function readMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Marque un plat mangé et l'inscrit au journal, un ingrédient par ligne. */
export async function journalMeal(id: number): Promise<JournalMealOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/plan/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'journal' }),
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 400 || response.status === 404) {
    return { kind: 'refused', message: await readMessage(response, 'Enregistrement refusé.') };
  }
  if (!response.ok) {
    return { kind: 'error' };
  }

  const body = (await response.json()) as { created: number; skipped: string[] };
  return { kind: 'journaled', created: body.created, skipped: body.skipped };
}

/** Revient sur un marquage. Les entrées déjà créées, elles, ne bougent pas. */
export async function reopenMeal(id: number): Promise<UnplanOutcome> {
  try {
    const response = await fetch(`/api/plan/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reopen' }),
    });
    return response.ok ? { kind: 'removed' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
