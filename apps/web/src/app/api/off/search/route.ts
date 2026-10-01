import { z } from 'zod';
import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';

export const runtime = 'nodejs';

/**
 * Relais de la recherche Open Food Facts par nom (FR-7 étendu).
 *
 * AD-2 veut qu'Open Food Facts soit appelé depuis le navigateur, et la règle
 * tient toujours pour le code-barres : `world.openfoodfacts.org` sert
 * `Access-Control-Allow-Origin: *`, et son quota se compte par adresse IP.
 *
 * La recherche par nom est un autre service, `search.openfoodfacts.org`, et il
 * ne sert aucun en-tête d'origine autorisée. Mesuré le 18/09/2026 : le
 * préambule CORS répond « Disallowed CORS origin », et la réponse au GET ne
 * porte pas d'`Access-Control-Allow-Origin`. Appelée depuis le navigateur, la
 * requête aboutit donc côté réseau mais la réponse est refusée au script — en
 * silence, la fonction appelante rendant une liste vide sur toute panne. D'où
 * une recherche « penne » ou « McFlurry » sans résultat alors que le code qui
 * la sert était écrit et correct.
 *
 * Le relais est le seul chemin qui fonctionne, et il ne rouvre pas ce que AD-2
 * prévient : ce moteur n'impose pas le quota de quinze requêtes par minute de
 * l'API produit, et la réponse est mémorisée une heure, ce qui réduit le
 * trafic sortant au lieu de le concentrer.
 */

const SEARCH_ENDPOINT = 'https://search.openfoodfacts.org/search';

/**
 * Champs demandés. `_score` n'est rendu que s'il est réclamé explicitement, et
 * il faut le réclamer : c'est lui qui porte la pertinence du moteur, seule
 * information qui distingue un vrai « McFlurry » d'un produit dont le nom ne
 * partage qu'un mot avec la requête.
 */
const SEARCH_FIELDS = [
  '_score',
  'code',
  'product_name',
  'product_name_fr',
  'brands',
  'nutriments',
  'unique_scans_n',
].join(',');

/**
 * Nombre de fiches demandées au moteur. Large parce qu'une bonne part d'entre
 * elles n'a pas de valeurs nutritionnelles exploitables : sur les requêtes
 * mesurées, une fiche sur cinq est écartée pour cette raison. En demander dix
 * en rendrait huit.
 */
const SEARCH_PAGE_SIZE = 50;

/** Le délai est plus court qu'au code-barres : la recherche, elle, se refrappe. */
const SEARCH_TIMEOUT_MS = 5000;

/** Durée de mémorisation d'une réponse. Un catalogue de produits ne bouge pas à l'heure. */
const CACHE_SECONDS = 3600;

/**
 * Identification de l'application, exigée par les conditions d'usage de l'API.
 * Côté serveur, `User-Agent` est posable directement, contrairement au
 * navigateur qui impose la variante `X-User-Agent`.
 */
const USER_AGENT = 'NutriPerso/1.0 (registre alimentaire personnel)';

const querySchema = z.object({
  q: z.string().trim().min(3).max(100),
});

export async function GET(request: Request): Promise<Response> {
  if (!(await hasSession())) {
    return apiError('unauthorized');
  }

  const parsed = querySchema.safeParse({
    q: new URL(request.url).searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const url =
    `${SEARCH_ENDPOINT}?q=${encodeURIComponent(parsed.data.q)}` +
    `&langs=fr&page_size=${SEARCH_PAGE_SIZE}&fields=${SEARCH_FIELDS}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) {
      return apiError('upstream_unavailable');
    }

    // Le corps est relayé tel quel : le tri et le contrôle de plausibilité des
    // fiches vivent dans le module qui les consomme, avec leurs justifications.
    return Response.json(await response.json());
  } catch {
    return apiError('upstream_unavailable');
  }
}
