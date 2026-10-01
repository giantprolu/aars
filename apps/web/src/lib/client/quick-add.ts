import type { Meal } from '../meal';
import type { QuickAddContext } from '../quick-add';

/**
 * Appels navigateur du bouton +.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

export async function fetchQuickAdd(): Promise<QuickAddContext | null> {
  try {
    const response = await fetch('/api/quick-add', { cache: 'no-store' });
    return response.ok ? ((await response.json()) as QuickAddContext) : null;
  } catch {
    return null;
  }
}

export type RepeatOutcome = { kind: 'ok' } | { kind: 'error' };

/** Refait une entrée passée, aujourd'hui, au repas choisi. */
export async function repeatEntry(entryId: number, meal: Meal): Promise<RepeatOutcome> {
  try {
    const response = await fetch('/api/entries/repeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId, meal }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
