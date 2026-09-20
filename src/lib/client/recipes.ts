import type { Meal } from '../meal';
import type { RecipeInput } from '../recipe';

/**
 * Appels navigateur vers les routes de recettes.
 * Résultats discriminés plutôt qu'exceptions (AD-12) : l'interface aiguille
 * sur la variante au lieu d'afficher un message générique.
 */

export type SaveRecipeOutcome =
  | { kind: 'saved'; id: number }
  /** Le serveur dit pourquoi ; le message est fait pour être affiché tel quel. */
  | { kind: 'invalid'; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

/** Lit le message de refus renvoyé par la route, ou un repli si le corps est muet. */
async function readRejection(
  response: Response,
  fallback = 'Recette invalide.',
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function send(
  url: string,
  method: 'POST' | 'PUT',
  payload: unknown,
): Promise<SaveRecipeOutcome> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
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
    return { kind: 'invalid', message: await readRejection(response) };
  }
  if (!response.ok) {
    return { kind: 'error' };
  }

  const body = (await response.json()) as { id: number };
  return { kind: 'saved', id: body.id };
}

export function createRecipe(input: RecipeInput): Promise<SaveRecipeOutcome> {
  return send('/api/recipes', 'POST', { ...input, action: 'create' });
}

export function updateRecipe(id: number, input: RecipeInput): Promise<SaveRecipeOutcome> {
  return send(`/api/recipes/${id}`, 'PUT', input);
}

export type DeleteRecipeOutcome = { kind: 'deleted' } | { kind: 'error' };

export async function deleteRecipe(id: number): Promise<DeleteRecipeOutcome> {
  try {
    const response = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
    return response.ok ? { kind: 'deleted' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export type JournalRecipeOutcome =
  /** `skipped` porte les ingrédients sans fiche : le total du jour est incomplet. */
  | { kind: 'journaled'; created: number; skipped: string[] }
  /** Le serveur dit pourquoi ; le message est fait pour être affiché tel quel. */
  | { kind: 'refused'; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

/**
 * Inscrit un plat du carnet au journal du jour, un ingrédient par ligne.
 *
 * Le pendant direct de « J'ai mangé ça » du plan, pour un plat qu'on n'avait
 * pas prévu : mêmes lignes, mêmes substitutions, même service au bout.
 */
export async function journalRecipe(
  id: number,
  input: { meal: Meal; servings: number },
): Promise<JournalRecipeOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/recipes/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'journal', ...input }),
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 401) {
    return { kind: 'unauthorized' };
  }
  if (response.status === 400 || response.status === 404) {
    return { kind: 'refused', message: await readRejection(response, 'Enregistrement refusé.') };
  }
  if (!response.ok) {
    return { kind: 'error' };
  }

  const body = (await response.json()) as { created: number; skipped: string[] };
  return { kind: 'journaled', created: body.created, skipped: body.skipped };
}
