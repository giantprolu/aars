import type { ReferenceFood, SearchHit } from '../types';
import { searchProducts } from './openfoodfacts';

/**
 * Recherche d'aliment, en deux sources interrogées ensemble.
 *
 * La route serveur couvre CIQUAL et le cache produits ; Open Food Facts couvre
 * les marques, que CIQUAL ne nomme pas et ne nommera jamais. Les deux sont
 * appelées en parallèle et non l'une après l'autre : ce sont deux réseaux
 * différents, et l'attente vaut celle de la plus lente, pas leur somme.
 *
 * L'ordre du résultat place toujours le local devant. Ce n'est pas un
 * chauvinisme d'implémentation : CIQUAL donne des moyennes d'aliments vérifiées
 * par l'ANSES là où Open Food Facts donne des fiches saisies par des passants,
 * et sur « vin rouge » la première rend le vin quand la seconde rend du vinaigre.
 * Quand le local répond, il a raison ; quand il ne répond pas — « mcflurry »,
 * « penne », « coca » — la seconde liste prend toute la place.
 */

/** Aucune requête en dessous de trois caractères (FR-7). */
export const MIN_QUERY_LENGTH = 3;

/** Temporisation avant requête, pour ne pas interroger à chaque frappe. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Nombre de résultats affichés, toutes sources confondues. Au-delà, la liste
 * cesse d'être un choix pour devenir un catalogue à lire.
 */
const MERGED_LIMIT = 24;

export type SearchOutcome =
  | { kind: 'hits'; hits: SearchHit[] }
  | { kind: 'too_short' }
  | { kind: 'error' };

/**
 * Interroge CIQUAL et le cache produits.
 * Rend `null` sur panne, pour la distinguer d'une absence de résultat : une
 * base injoignable ne doit pas faire dire « aucun aliment trouvé ».
 */
async function searchLocal(term: string, signal?: AbortSignal): Promise<SearchHit[] | null> {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { hits: SearchHit[] };
    return body.hits;
  } catch {
    return null;
  }
}

/**
 * Le score de similarité d'un produit venu d'Open Food Facts.
 *
 * Il n'est pas comparable à celui de la recherche locale, qui mesure une
 * couverture trigramme, et ne sert d'ailleurs à rien ici : la liste est déjà
 * ordonnée par la source. La valeur est là parce que `SearchHit` la porte pour
 * les candidats de la reconnaissance photo, où elle a un sens.
 */
function toHit(food: ReferenceFood): SearchHit {
  return { ...food, origin: 'off', similarity: 0 };
}

export async function searchFoods(
  term: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const trimmed = term.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { kind: 'too_short' };
  }

  const [local, remote] = await Promise.all([
    searchLocal(trimmed, signal),
    searchProducts(trimmed, signal),
  ]);

  // Les deux sources muettes, dont la locale en panne : c'est une erreur.
  // La locale seule en panne avec des produits en face reste un résultat.
  if (local === null && remote.length === 0) {
    return { kind: 'error' };
  }

  const hits = local ?? [];
  // Un produit déjà en cache est rendu par les deux sources, sous la même
  // référence. Celui du cache l'emporte : il porte sa taille de portion, que la
  // recherche Open Food Facts n'indexe pas.
  const known = new Set(hits.filter((hit) => hit.kind === 'product').map((hit) => hit.ref));

  return {
    kind: 'hits',
    hits: [...hits, ...remote.filter((food) => !known.has(food.ref)).map(toHit)].slice(
      0,
      MERGED_LIMIT,
    ),
  };
}
