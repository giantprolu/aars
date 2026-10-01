/**
 * Appels navigateur vers les routes du panier de la semaine.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

/** Ce que l'installation d'un choix a réellement produit. */
export interface ChooseReport {
  chosen: number;
  installed: number;
  /** Plats qu'on n'a pas pu installer, désignés par leur nom. */
  failed: string[];
  /** Ingrédients sans fiche, absents des recettes installées. */
  skippedIngredients: string[];
}

export type ChooseOutcome =
  | { kind: 'chosen'; report: ChooseReport }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

/** Met une série de plats du catalogue au panier de la semaine. */
export async function chooseMeals(
  weekStart: string,
  slugs: readonly string[],
): Promise<ChooseOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/basket', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'catalog', weekStart, slugs }),
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 401) {
    return { kind: 'unauthorized' };
  }
  if (!response.ok) {
    return { kind: 'error' };
  }

  const body = (await response.json()) as { report: ChooseReport };
  return { kind: 'chosen', report: body.report };
}

export type AddRecipeOutcome =
  | { kind: 'added' }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

/**
 * Met une recette du carnet au panier de la semaine.
 *
 * Sans cette porte, une recette écrite à la main n'atteindrait jamais la liste
 * de courses : celle-ci se déduit du panier, et le panier ne se remplissait
 * que depuis le catalogue.
 */
export async function addRecipeToBasket(input: {
  weekStart: string;
  recipeId: number;
  servings: number;
}): Promise<AddRecipeOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/basket', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'recipe', ...input }),
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 401) {
    return { kind: 'unauthorized' };
  }
  return response.ok ? { kind: 'added' } : { kind: 'error' };
}

export type BasketOutcome = { kind: 'ok' } | { kind: 'error' };

export async function setBasketServings(
  id: number,
  servings: number,
): Promise<BasketOutcome> {
  try {
    const response = await fetch(`/api/basket/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servings }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export async function removeFromBasket(id: number): Promise<BasketOutcome> {
  try {
    const response = await fetch(`/api/basket/${id}`, { method: 'DELETE' });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
