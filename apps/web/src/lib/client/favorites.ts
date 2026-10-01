import type { Meal } from '../meal';

/**
 * Appels navigateur vers les routes des favoris.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

export type FavoriteOutcome = { kind: 'ok' } | { kind: 'error'; message: string | null };

async function readMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? null;
  } catch {
    return null;
  }
}

/** Met en favori un repas du journal du jour. */
export async function saveFavorite(meal: Meal, name: string | null): Promise<FavoriteOutcome> {
  try {
    const response = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meal, name }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error', message: await readMessage(response) };
  } catch {
    return { kind: 'error', message: null };
  }
}

/** Recopie un favori dans le journal du jour. */
export async function replayFavorite(id: number, meal: Meal): Promise<FavoriteOutcome> {
  try {
    const response = await fetch(`/api/favorites/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meal }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error', message: await readMessage(response) };
  } catch {
    return { kind: 'error', message: null };
  }
}

export async function deleteFavorite(id: number): Promise<FavoriteOutcome> {
  try {
    const response = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
    return response.ok ? { kind: 'ok' } : { kind: 'error', message: null };
  } catch {
    return { kind: 'error', message: null };
  }
}
