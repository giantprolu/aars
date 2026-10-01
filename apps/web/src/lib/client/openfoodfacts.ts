import type { Macros, OffLookup, OffPartialProduct, ReferenceFood } from '../types';

/**
 * Interrogation d'Open Food Facts (FR-13).
 *
 * AD-2 : cet appel part du NAVIGATEUR, jamais d'une route serveur. La limite
 * d'Open Food Facts est de 15 requêtes par minute et par adresse IP ; passer
 * par une fonction Vercel mutualiserait l'IP et consommerait ce quota pour
 * tous les appels de la plateforme.
 *
 * AD-3 : l'API répond HTTP 200 même quand le produit est introuvable. Le seul
 * indicateur exploitable est le champ `status` du corps, dont la valeur 1
 * signifie que le produit a été trouvé. Un `response.ok` ici serait un bug.
 *
 * Ce module est le seul de l'application autorisé à joindre ce domaine.
 */

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';

/** Restreint la charge utile : sans ce paramètre, une fiche pèse plusieurs centaines de kilo-octets. */
const FIELDS = [
  'code',
  'product_name',
  'product_name_fr',
  'generic_name_fr',
  'brands',
  'serving_quantity',
  'serving_size',
  'nutriments',
].join(',');

/** Au-delà, on bascule sur le parcours de produit inconnu (FR-13). */
const TIMEOUT_MS = 8000;

/**
 * Identification de l'application, exigée par les conditions d'usage de l'API.
 *
 * L'en-tête est `X-User-Agent` et non `User-Agent` : les navigateurs
 * interdisent de surcharger `User-Agent` depuis fetch, et Open Food Facts
 * documente cette variante pour les clients JavaScript.
 *
 * La valeur est en dur : `src/server/env.ts` ne franchit pas la frontière
 * serveur, et ce n'est pas un secret.
 */
const USER_AGENT_COMMENT =
  'NutriPerso/0.1 (usage personnel; https://github.com/giantprolu/nutri-perso)';

interface OffNutriments {
  'energy-kcal_100g'?: number;
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

interface OffPayload {
  status?: number;
  product?: {
    code?: string;
    product_name?: string;
    product_name_fr?: string;
    generic_name_fr?: string;
    brands?: string;
    serving_quantity?: number | string;
    serving_size?: string;
    nutriments?: OffNutriments;
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : undefined;
}

/** Le français d'abord : la base est multilingue et `product_name` peut être anglais. */
function pickName(product: NonNullable<OffPayload['product']>): string | null {
  const candidates = [
    product.product_name_fr,
    product.product_name,
    product.generic_name_fr,
  ];
  const name = candidates.find((value) => typeof value === 'string' && value.trim() !== '');
  if (!name) {
    return null;
  }
  const brand = product.brands?.split(',')[0]?.trim();
  return brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${name.trim()} — ${brand}`
    : name.trim();
}

/**
 * L'énergie est parfois absente en kcal et présente en kilojoules.
 * La conversion est faite ici, à l'écriture, jamais à la lecture (AD-8).
 */
function pickKcal(nutriments: OffNutriments): number | undefined {
  const kcal = toFiniteNumber(nutriments['energy-kcal_100g']);
  if (kcal !== undefined) {
    return kcal;
  }
  const kj = toFiniteNumber(nutriments.energy_100g);
  return kj === undefined ? undefined : Math.round((kj / 4.184) * 1000) / 1000;
}

function pickServingSize(product: NonNullable<OffPayload['product']>): number | null {
  const quantity = toFiniteNumber(product.serving_quantity);
  if (quantity !== undefined && quantity > 0) {
    return quantity;
  }
  // `serving_size` est du texte libre : « 30 g », « 1 pot (125g) ».
  const match = product.serving_size?.match(/(\d+(?:[.,]\d+)?)\s*g/i);
  const parsed = match?.[1] === undefined ? undefined : toFiniteNumber(match[1]);
  return parsed !== undefined && parsed > 0 ? parsed : null;
}

/**
 * Résout un code-barres auprès d'Open Food Facts.
 * Renvoie une variante plutôt que de lever (AD-12) : l'interface doit pouvoir
 * distinguer « inconnu » de « fiche incomplète » de « service injoignable ».
 */
export async function lookupBarcode(barcode: string): Promise<OffLookup> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${barcode}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-User-Agent': USER_AGENT_COMMENT },
    });
  } catch (error) {
    return {
      kind: 'error',
      reason: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network',
    };
  } finally {
    clearTimeout(timeout);
  }

  let payload: OffPayload;
  try {
    payload = (await response.json()) as OffPayload;
  } catch {
    return { kind: 'error', reason: 'malformed' };
  }

  // AD-3 : le succès se lit ici, pas dans response.ok.
  if (payload.status !== 1 || !payload.product) {
    return { kind: 'not_found' };
  }

  const product = payload.product;
  const nutriments = product.nutriments ?? {};
  const name = pickName(product);
  const servingSizeG = pickServingSize(product);

  const per100g: Partial<Macros> = {
    kcal: pickKcal(nutriments),
    proteinG: toFiniteNumber(nutriments.proteins_100g),
    carbsG: toFiniteNumber(nutriments.carbohydrates_100g),
    fatG: toFiniteNumber(nutriments.fat_100g),
  };

  const complete =
    name !== null &&
    per100g.kcal !== undefined &&
    per100g.proteinG !== undefined &&
    per100g.carbsG !== undefined &&
    per100g.fatG !== undefined;

  if (!complete) {
    const partial: OffPartialProduct = { barcode, name, per100g, servingSizeG };
    return { kind: 'incomplete', partial };
  }

  return {
    kind: 'found',
    product: {
      barcode,
      name,
      per100g: per100g as Macros,
      servingSizeG,
    },
  };
}

/**
 * Recherche textuelle dans Open Food Facts (FR-7 étendu).
 *
 * CIQUAL décrit des aliments, pas des produits : « Glace ou crème glacée, en
 * bac » y figure, un McFlurry non, et c'est normal — l'ANSES publie des
 * moyennes d'aliments, pas un catalogue de marques. L'utilisateur, lui, mange
 * des marques. Sans cette recherche, un McFlurry, un paquet de penne Barilla ou
 * une canette de Coca n'existaient dans l'application qu'une fois scannés, ce
 * qui suppose d'avoir l'emballage sous la main : impossible au restaurant, et
 * pénible pour tout ce qui se consomme sans code-barres à portée.
 *
 * Le service interrogé est Search-a-licious, sur `search.openfoodfacts.org`,
 * et non l'ancien `cgi/search.pl` d'Open Food Facts : celui-ci a été observé
 * hors service, et le premier répond en quelques millisecondes.
 *
 * Il est joint par `/api/off/search`, et non directement comme le code-barres.
 * Ce moteur ne sert aucun en-tête CORS — mesuré le 18/09/2026, son préambule
 * répond « Disallowed CORS origin » — si bien que la requête aboutissait côté
 * réseau et que la réponse était refusée au script. L'échec étant muet par
 * construction, la recherche rendait une liste vide : « penne » et
 * « McFlurry » restaient introuvables alors que tout ce fichier fonctionnait.
 * La justification du relais, et son rapport à AD-2, est écrite dans la route.
 */

const SEARCH_ENDPOINT = '/api/off/search';

/** Nombre de produits finalement proposés, une fois le tri fait. */
const SEARCH_LIMIT = 12;

/**
 * Largeur de la bande de pertinence, en part du meilleur score.
 *
 * À l'intérieur de cette bande, les fiches sont tenues pour également
 * pertinentes et c'est la popularité qui les départage : sur « yaourt nature »,
 * le moteur rend quarante fiches nommées exactement pareil et séparées par un
 * pour cent de score, autant montrer d'abord celle que les gens scannent.
 * Au-delà, l'ordre du moteur est conservé — trier tout le résultat par
 * popularité remontait « Peanut Pouch » en tête d'une recherche « McFlurry ».
 */
const RELEVANCE_BAND = 0.95;

/** Valeurs au-delà desquelles une fiche est fausse : rien ne dépasse 900 kcal. */
const MAX_PLAUSIBLE_KCAL_100G = 900;
const MAX_PLAUSIBLE_MACRO_100G = 100;

/**
 * Contrôle de cohérence entre l'énergie déclarée et ses macronutriments.
 *
 * Les coefficients d'Atwater — quatre, quatre et neuf kilocalories par gramme —
 * redonnent l'énergie à partir des trois macros. Quand l'énergie déclarée est
 * très inférieure à cette somme, la fiche se contredit : Open Food Facts porte
 * un « Coca-cola » a trois kilocalories pour dix grammes de glucides, soit une
 * énergie par portion recopiée dans la case des cent grammes. Recopiée dans le
 * journal, elle y resterait figee (AD-1).
 *
 * Le contrôle ne joue que dans ce sens. Dans l'autre, l'écart est normal et
 * fréquent : l'alcool et les polyols portent de l'énergie qu'aucune des trois
 * macros ne compte, et un vin rouge affiche soixante-quinze kilocalories pour
 * une somme d'Atwater nulle.
 */
const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Part de la somme d'Atwater sous laquelle l'énergie déclarée est jugee fausse. */
const ATWATER_MIN_RATIO = 0.6;

/**
 * Tolérance absolue, en kilocalories, sous laquelle l'écart ne prouve rien.
 * Sans elle, les boissons allégées — zéro macro déclarée, quelques calories —
 * tomberaient sur des arrondis.
 */
const ATWATER_TOLERANCE_KCAL = 20;

/**
 * Le délai est plus court qu'au code-barres : la recherche, elle, se refrappe.
 * Il couvre ici le relais et le moteur, donc un peu plus large que le temps
 * accordé au moteur seul de l'autre côté.
 */
const SEARCH_TIMEOUT_MS = 6000;

interface OffSearchHit {
  _score?: number;
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string | string[];
  nutriments?: OffNutriments;
  unique_scans_n?: number;
}

interface OffSearchPayload {
  hits?: OffSearchHit[];
}

/**
 * Le nom affiché, marque comprise. La recherche rend des homonymes par
 * dizaines — quarante « Yaourt nature » — et la marque est le seul élément qui
 * permette de reconnaître le sien.
 *
 * `brands` arrive tantôt en chaîne, tantôt en tableau selon la fiche.
 */
function pickSearchName(hit: OffSearchHit): string | null {
  const base = [hit.product_name_fr, hit.product_name].find(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  if (!base) {
    return null;
  }

  const brands = Array.isArray(hit.brands) ? hit.brands : hit.brands?.split(',');
  const brand = brands?.[0]?.trim();
  const name = base.trim();
  return brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${name} — ${brand}`
    : name;
}

/**
 * Les quatre valeurs pour 100 g, ou `null` si la fiche n'est pas exploitable.
 *
 * Une fiche sans énergie, sans protéines, ou qui annonce cent-vingt grammes de
 * lipides pour cent grammes de produit, est écartée sans autre forme de procès :
 * Open Food Facts est contributif, et une valeur fausse recopiée dans le
 * journal y resterait figée (AD-1).
 */
function pickSearchMacros(nutriments: OffNutriments | undefined): Macros | null {
  if (!nutriments) {
    return null;
  }

  const kcal = pickKcal(nutriments);
  const proteinG = toFiniteNumber(nutriments.proteins_100g);
  const carbsG = toFiniteNumber(nutriments.carbohydrates_100g);
  const fatG = toFiniteNumber(nutriments.fat_100g);

  if (
    kcal === undefined ||
    proteinG === undefined ||
    carbsG === undefined ||
    fatG === undefined
  ) {
    return null;
  }

  const atwater =
    proteinG * ATWATER.protein + carbsG * ATWATER.carbs + fatG * ATWATER.fat;

  const implausible =
    kcal > MAX_PLAUSIBLE_KCAL_100G ||
    proteinG > MAX_PLAUSIBLE_MACRO_100G ||
    carbsG > MAX_PLAUSIBLE_MACRO_100G ||
    fatG > MAX_PLAUSIBLE_MACRO_100G ||
    kcal + ATWATER_TOLERANCE_KCAL < atwater * ATWATER_MIN_RATIO;

  if (implausible) {
    return null;
  }

  // Arrondi à la précision de la colonne (AD-9). Open Food Facts rend des
  // flottants bruités — « 4,6999998092651 g » — que rien ne gagnerait à
  // promener jusqu'au journal.
  return {
    kcal: roundToMilli(kcal),
    proteinG: roundToMilli(proteinG),
    carbsG: roundToMilli(carbsG),
    fatG: roundToMilli(fatG),
  };
}

/** Arrondi au millième, précision des colonnes nutritionnelles (AD-9). */
function roundToMilli(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Cherche des produits par leur nom.
 *
 * Rend une liste vide plutôt que de lever, et sur toutes les pannes : la
 * recherche locale est servie en parallèle, et un moteur externe injoignable ne
 * doit pas vider un écran que CIQUAL remplissait très bien.
 */
export async function searchProducts(
  term: string,
  signal?: AbortSignal,
): Promise<ReferenceFood[]> {
  const query = term.trim();
  if (query === '') {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  // L'abandon demandé par l'appelant, à chaque frappe, doit atteindre la
  // requête sans effacer la temporisation qui la borne.
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;

  let payload: OffSearchPayload;
  try {
    // Requête de même origine : ni en-tête personnalisé, ni préambule CORS.
    // L'identification de l'application est posée par le relais.
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return [];
    }
    payload = (await response.json()) as OffSearchPayload;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }

  const usable = (payload.hits ?? []).flatMap((hit) => {
    const barcode = hit.code?.trim();
    const name = pickSearchName(hit);
    const per100g = pickSearchMacros(hit.nutriments);
    if (!barcode || !name || !per100g) {
      return [];
    }
    return [
      {
        food: { kind: 'product' as const, ref: barcode, name, per100g, servingSizeG: null },
        score: typeof hit._score === 'number' ? hit._score : 0,
        scans: typeof hit.unique_scans_n === 'number' ? hit.unique_scans_n : 0,
      },
    ];
  });

  const best = usable[0];
  if (best === undefined) {
    return [];
  }

  // Le moteur rend déjà ses fiches par pertinence décroissante ; on ne réordonne
  // que la tête de liste, celle dont les scores sont indiscernables.
  const floor = best.score * RELEVANCE_BAND;
  const band = usable.filter((entry) => entry.score >= floor);
  const rest = usable.filter((entry) => entry.score < floor);
  band.sort((a, b) => b.scans - a.scans);

  return [...band, ...rest].slice(0, SEARCH_LIMIT).map((entry) => entry.food);
}
