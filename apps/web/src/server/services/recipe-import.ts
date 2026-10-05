import 'server-only';
import { parseIngredientLine, parseRecipePage, singularTerm } from '@/lib/recipe-import';
import type { SearchHit } from '@/lib/types';
import { fetchRecipePage } from '../clients/recipe-page';
import { searchReferenceFoods } from '../db/queries/search';
import { hasKitchenPlus } from './premium';

/**
 * Import de recette (Cuisine+) : une adresse de page devient un brouillon.
 *
 * Rien n'est enregistré ici. Le brouillon part à l'éditeur de recette, qui
 * montre chaque ingrédient avec la fiche trouvée et son poids, et c'est
 * l'enregistrement ordinaire qui crée la recette. Une correspondance CIQUAL
 * trouvée par un terme pris sur une page étrangère se trompe parfois, et
 * l'endroit pour s'en apercevoir est l'écran, pas le journal d'une semaine.
 *
 * L'adresse n'est pas conservée : elle sert à lire la page, puis disparaît.
 */

/** Recherches CIQUAL menées de front, comme pour le catalogue. */
const SEARCH_CONCURRENCY = 8;

export interface DraftIngredient {
  /** La ligne de la page, pour que l'éditeur dise d'où vient la fiche. */
  line: string;
  hit: SearchHit;
  /** Poids en grammes, ou `null` : l'éditeur le demandera. */
  quantityG: number | null;
}

export interface RecipeDraft {
  name: string;
  servings: number;
  prepMinutes: number | null;
  steps: string[];
  ingredients: DraftIngredient[];
  /** Lignes non reprises : sans quantité (sel, poivre) ou sans fiche trouvée. */
  unmatched: string[];
}

export type ImportResult =
  | { kind: 'draft'; draft: RecipeDraft }
  | { kind: 'premium_required' }
  | { kind: 'invalid_url' }
  | { kind: 'unreachable' }
  | { kind: 'no_recipe' };

/** La meilleure fiche de chaque terme ; un terme manqué est réessayé au singulier. */
async function bestHits(terms: readonly string[]): Promise<Map<string, SearchHit>> {
  const distinct = [...new Set(terms)];
  const found = new Map<string, SearchHit>();
  for (let index = 0; index < distinct.length; index += SEARCH_CONCURRENCY) {
    const batch = distinct.slice(index, index + SEARCH_CONCURRENCY);
    const hits = await Promise.all(
      batch.map(async (term) => {
        const [first] = await searchReferenceFoods(term, 1);
        if (first) {
          return first;
        }
        const singular = singularTerm(term);
        return singular === null ? null : ((await searchReferenceFoods(singular, 1))[0] ?? null);
      }),
    );
    batch.forEach((term, position) => {
      const hit = hits[position];
      if (hit) {
        found.set(term, hit);
      }
    });
  }
  return found;
}

/** Fait d'une page de recette publiée un brouillon, ingrédients rapprochés de CIQUAL. */
export async function draftFromHtml(html: string): Promise<RecipeDraft | null> {
  const parsed = parseRecipePage(html);
  if (parsed === null) {
    return null;
  }

  const lines = parsed.ingredientLines.map((line) => ({ line, parsed: parseIngredientLine(line) }));
  const hits = await bestHits(
    lines.flatMap((item) => (item.parsed === null ? [] : [item.parsed.term])),
  );

  const ingredients: DraftIngredient[] = [];
  const unmatched: string[] = [];
  for (const item of lines) {
    const hit = item.parsed === null ? undefined : hits.get(item.parsed.term);
    if (item.parsed === null || hit === undefined) {
      unmatched.push(item.line);
      continue;
    }
    ingredients.push({ line: item.parsed.line, hit, quantityG: item.parsed.quantityG });
  }

  return {
    name: parsed.name,
    servings: parsed.servings,
    prepMinutes: parsed.prepMinutes,
    steps: parsed.steps,
    ingredients,
    unmatched,
  };
}

export async function importRecipe(userId: number, url: string): Promise<ImportResult> {
  if (!(await hasKitchenPlus(userId))) {
    return { kind: 'premium_required' };
  }
  const page = await fetchRecipePage(url);
  if (page.kind !== 'ok') {
    return page;
  }
  const draft = await draftFromHtml(page.html);
  return draft === null ? { kind: 'no_recipe' } : { kind: 'draft', draft };
}
