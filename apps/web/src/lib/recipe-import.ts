/**
 * Import de recette depuis une page web : la lecture, sans réseau ni base
 * (AD-8). Le téléchargement vit dans `server/clients/recipe-page`, la
 * correspondance avec CIQUAL dans `server/services/recipe-import`.
 *
 * Seules les données structurées sont lues : le bloc JSON-LD `Recipe` que
 * publient presque tous les sites de cuisine, pour les moteurs de recherche.
 * Deviner une recette dans la mise en page d'un site serait fragile et
 * changerait à chaque refonte ; le JSON-LD, lui, est un format.
 *
 * Rien de ce qui sort d'ici n'est enregistré tel quel. Le brouillon s'ouvre
 * dans l'éditeur de recette, où chaque quantité se relit : les conversions
 * ci-dessous sont des ordres de grandeur (une cuillère à soupe, un oignon),
 * et une ligne dont on ne sait pas le poids arrive sans poids, pour que
 * l'éditeur la réclame au lieu d'inventer un chiffre.
 */

import { MAX_INGREDIENTS, MAX_SERVINGS, MAX_STEPS } from './recipe';

/** Ce qu'on retient d'un bloc `Recipe`, avant toute correspondance. */
export interface ParsedRecipe {
  name: string;
  servings: number;
  prepMinutes: number | null;
  steps: string[];
  ingredientLines: string[];
}

/** Une ligne d'ingrédient comprise : ce qu'il faut chercher, et combien. */
export interface ParsedIngredient {
  /** La ligne telle que la page l'écrit, nettoyée. */
  line: string;
  /** Ce qu'on cherche dans CIQUAL : « farine de blé », « oignon ». */
  term: string;
  /** Poids en grammes, ou `null` quand la ligne ne permet pas de le dire. */
  quantityG: number | null;
}

/** Bornes de recopie : celles que la validation des recettes impose. */
const MAX_NAME = 80;
const MAX_STEP = 500;
const MAX_MINUTES = 600;
const DEFAULT_SERVINGS = 4;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  laquo: '«', raquo: '»', hellip: '…', deg: '°', frac12: '½', frac14: '¼', frac34: '¾',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', ccedil: 'ç',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', oelig: 'œ', Eacute: 'É',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return Object.hasOwn(NAMED_ENTITIES, code) ? (NAMED_ENTITIES[code] ?? whole) : whole;
  });
}

/** Du texte lisible : balises retirées, entités décodées, espaces resserrés. */
export function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/[  \s]+/g, ' ')
    .trim();
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Les blocs JSON-LD d'une page, lisibles ou non. */
function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const body = (match[1] ?? '').trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try {
      blocks.push(JSON.parse(body));
    } catch {
      // Un bloc mal formé n'empêche pas de lire les autres.
    }
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecipeNode(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

/** Le premier nœud `Recipe`, où qu'il soit : tableau, `@graph`, imbrication. */
function findRecipeNode(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (isRecipeNode(value)) {
    return value;
  }
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const found = findRecipeNode(value[key], depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

/** Une durée ISO 8601 (« PT1H30M ») en minutes, ou `null`. */
export function isoMinutes(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
    value.trim(),
  );
  if (!match) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 1440 + Number(hours ?? 0) * 60 + Number(minutes ?? 0) + Number(seconds ?? 0) / 60;
  return total > 0 ? Math.round(total) : null;
}

/** Le nombre de parts : « 4 personnes », 4, ["4", "4 parts"]. */
function servingsOf(value: unknown): number {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = typeof first === 'number' ? first : typeof first === 'string' ? Number.parseFloat(first.replace(/^\D+/, '')) : NaN;
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SERVINGS;
  }
  return Math.min(MAX_SERVINGS, Math.max(1, Math.round(raw)));
}

/** Les étapes, quelle que soit leur forme : texte, liste, `HowToStep`, `HowToSection`. */
function stepsOf(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return value
      .split(/<br\s*\/?>|<\/p>|<\/li>|\n+/i)
      .map(cleanText)
      .filter((step) => step.length > 0);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => stepsOf(item, depth + 1));
  }
  if (isRecord(value)) {
    if (value.itemListElement !== undefined) {
      return stepsOf(value.itemListElement, depth + 1);
    }
    if (typeof value.text === 'string') {
      return stepsOf(value.text, depth + 1);
    }
    if (typeof value.name === 'string') {
      return stepsOf(value.name, depth + 1);
    }
  }
  return [];
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** La recette publiée par la page, ou `null` si elle n'en publie aucune. */
export function parseRecipePage(html: string): ParsedRecipe | null {
  let node: Record<string, unknown> | null = null;
  for (const block of jsonLdBlocks(html)) {
    node = findRecipeNode(block);
    if (node) {
      break;
    }
  }
  if (!node) {
    return null;
  }

  const name = typeof node.name === 'string' ? clip(cleanText(node.name), MAX_NAME) : '';
  const ingredientLines = stringsOf(node.recipeIngredient ?? node.ingredients)
    .map(cleanText)
    .filter((line) => line.length > 0)
    .slice(0, MAX_INGREDIENTS);
  if (name.length === 0 || ingredientLines.length === 0) {
    return null;
  }

  const total = isoMinutes(node.totalTime);
  const parts = [isoMinutes(node.prepTime), isoMinutes(node.cookTime)].filter((item): item is number => item !== null);
  const minutes = total ?? (parts.length > 0 ? parts.reduce((sum, item) => sum + item, 0) : null);

  return {
    name,
    servings: servingsOf(node.recipeYield ?? node.yield),
    prepMinutes: minutes === null ? null : Math.min(MAX_MINUTES, minutes),
    steps: stepsOf(node.recipeInstructions)
      .map((step) => clip(step, MAX_STEP))
      .slice(0, MAX_STEPS),
    ingredientLines,
  };
}

// --- Lignes d'ingrédients -------------------------------------------------

const FRACTIONS: Record<string, string> = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8' };

const NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10, douze: 12,
  demi: 0.5, 'demi-': 0.5, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4,
};

/**
 * Les unités, en grammes par unité. Un liquide compte pour sa masse d'eau,
 * une cuillère pour ce qu'elle contient d'ordinaire : à dix ou vingt pour cent
 * près, ce que l'éditeur laisse corriger.
 */
const UNITS: readonly { pattern: RegExp; grams: number }[] = [
  { pattern: /^(?:kg|kilos?|kilogrammes?)\b/, grams: 1000 },
  { pattern: /^(?:mg|milligrammes?)\b/, grams: 0.001 },
  { pattern: /^(?:g|gr|grs|grammes?|grams?)\b\.?/, grams: 1 },
  { pattern: /^(?:ml|millilitres?)\b/, grams: 1 },
  { pattern: /^(?:cl|centilitres?)\b/, grams: 10 },
  { pattern: /^(?:dl|decilitres?)\b/, grams: 100 },
  { pattern: /^(?:l|litres?|liters?)\b/, grams: 1000 },
  { pattern: /^(?:c\.?\s*a\.?\s*s\.?|cas|cs|cuil(?:l?ere)?s?\.?\s*a\s*soupe|c\.?\s*a\s*soupe|tbsp|tablespoons?)(?=\s|$|\.)\.?/, grams: 15 },
  { pattern: /^(?:c\.?\s*a\.?\s*c\.?|cac|cc|cuil(?:l?ere)?s?\.?\s*a\s*cafe|c\.?\s*a\s*cafe|tsp|teaspoons?)(?=\s|$|\.)\.?/, grams: 5 },
  { pattern: /^pincees?\b/, grams: 1 },
  { pattern: /^(?:verres?)\b/, grams: 200 },
  { pattern: /^(?:tasses?|cups?)\b/, grams: 240 },
  { pattern: /^(?:bols?)\b/, grams: 300 },
  { pattern: /^sachets?\b/, grams: 10 },
  { pattern: /^(?:noix)\b(?=\s+de\s+beurre)/, grams: 10 },
  { pattern: /^noisettes?\b(?=\s+de\s+beurre)/, grams: 5 },
  { pattern: /^gousses?\b/, grams: 5 },
  { pattern: /^tranches?\b/, grams: 30 },
  { pattern: /^(?:boites?|conserves?)\b/, grams: 400 },
  { pattern: /^briques?\b/, grams: 200 },
  { pattern: /^pots?\b/, grams: 125 },
  { pattern: /^(?:oz|ounces?)\b/, grams: 28 },
  { pattern: /^(?:lb|lbs|pounds?)\b/, grams: 454 },
];

/** Le poids d'une pièce, pour ce qui se compte à l'unité. */
const PIECES: readonly { pattern: RegExp; grams: number }[] = [
  { pattern: /\bjaunes? d.?oeufs?/, grams: 18 },
  { pattern: /\bblancs? d.?oeufs?/, grams: 35 },
  { pattern: /\boeufs?\b|\beggs?\b/, grams: 55 },
  { pattern: /\bechalotes?/, grams: 30 },
  { pattern: /\boignons? nouveaux?/, grams: 20 },
  { pattern: /\boignons?|\bonions?/, grams: 100 },
  { pattern: /\bgousses?\b|\bail\b|\bgarlic/, grams: 5 },
  { pattern: /\bcitrons? verts?|\blimes?\b/, grams: 60 },
  { pattern: /\bcitrons?|\blemons?/, grams: 100 },
  { pattern: /\boranges?/, grams: 150 },
  { pattern: /\btomates? cerises?/, grams: 15 },
  { pattern: /\btomates?|\btomatoes?/, grams: 120 },
  { pattern: /\bcarottes?|\bcarrots?/, grams: 100 },
  { pattern: /\bpommes? de terre|\bpotatoes?/, grams: 150 },
  { pattern: /\bpommes?\b|\bapples?/, grams: 150 },
  { pattern: /\bpoires?/, grams: 150 },
  { pattern: /\bbananes?|\bbananas?/, grams: 120 },
  { pattern: /\bcourgettes?|\bzucchinis?/, grams: 200 },
  { pattern: /\baubergines?/, grams: 250 },
  { pattern: /\bpoivrons?|\bpeppers?/, grams: 150 },
  { pattern: /\bavocats?|\bavocados?/, grams: 150 },
  { pattern: /\bconcombres?/, grams: 300 },
  { pattern: /\bpoireaux?/, grams: 150 },
  { pattern: /\bpatates? douces?/, grams: 200 },
  { pattern: /\bblancs? de poulet|\bescalopes?|\bfilets? de poulet/, grams: 130 },
  { pattern: /\bpaves? de saumon|\bfilets? de saumon|\bpave/, grams: 125 },
  { pattern: /\bsteaks? haches?/, grams: 100 },
  { pattern: /\btortillas?|\bwraps?/, grams: 60 },
  { pattern: /\byaourts?/, grams: 125 },
  { pattern: /\bfeuilles? de laurier|\bbrins?|\bbranches?/, grams: 1 },
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .toLowerCase();
}

/** « 1/2 », « 1 1/2 », « 1,5 », « 2-3 » (la première borne), « une ». */
function readQuantity(text: string): { value: number; rest: string } | null {
  const numeric = /^(\d+(?:[.,]\d+)?)(?:\s+(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+))?(?:\s*(?:-|–|à|a|to)\s*\d+(?:[.,]\d+)?)?\s*/.exec(text);
  if (numeric) {
    const whole = Number((numeric[1] ?? '0').replace(',', '.'));
    let value = whole;
    if (numeric[2] !== undefined && numeric[3] !== undefined) {
      value = whole + Number(numeric[2]) / Number(numeric[3]);
    } else if (numeric[4] !== undefined) {
      value = whole / Number(numeric[4]);
    }
    return Number.isFinite(value) && value > 0 ? { value, rest: text.slice(numeric[0].length) } : null;
  }
  const word = /^([a-z-]+)\s+/.exec(text);
  const key = word?.[1] ?? '';
  const known = Object.hasOwn(NUMBER_WORDS, key) ? NUMBER_WORDS[key] : undefined;
  if (word && known !== undefined) {
    // « une demi-botte », « un demi citron ».
    const rest = text.slice(word[0].length);
    const half = /^demi-?\s*/.exec(rest);
    return half ? { value: known * 0.5, rest: rest.slice(half[0].length) } : { value: known, rest };
  }
  return null;
}

/** Retire « de », « d' », « du », « des », « of » en tête. */
function dropArticle(text: string): string {
  return text.replace(/^(?:de la\s+|de l['’]\s*|de\s+|d['’]\s*|du\s+|des\s+|of\s+)/, '');
}

/** Ce qui suit le nom de l'aliment : précisions, alternatives, préparation. */
function termOf(text: string): string {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .split(/,|;|\s+ou\s+|\s+or\s+|\s+pour\s+|\s+\+\s+|\s+\(/)[0]!
    .replace(/\b(?:environ|about|approx\.?)\b/g, ' ')
    .replace(/[^a-z0-9%' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Le terme au singulier, mot à mot : « lardons fumes » → « lardon fume ».
 * Second essai pour un terme que la recherche n'a pas trouvé, CIQUAL nommant
 * ses aliments au singulier. Rend `null` si rien ne change.
 */
export function singularTerm(term: string): string | null {
  const singular = term
    .split(' ')
    .map((word) => (word.length > 3 && /[sx]$/.test(word) && !/(?:ss|us|is)$/.test(word) ? word.slice(0, -1) : word))
    .join(' ');
  return singular === term ? null : singular;
}

/**
 * Une ligne d'ingrédient comprise, ou `null` pour une ligne sans quantité :
 * « sel », « poivre », « huile pour la cuisson ». Celles-là ne pèsent rien
 * qui compte, et l'écran les montre comme non reprises plutôt que de leur
 * inventer un poids.
 */
export function parseIngredientLine(raw: string): ParsedIngredient | null {
  const line = cleanText(raw);
  let text = fold(line).replace(/[½¼¾⅓⅔⅛]/g, (fraction) => FRACTIONS[fraction] ?? fraction).trim();

  // « 1 boîte (400 g) de tomates » : le poids entre parenthèses fait foi.
  const bracketGrams = /\((?:[^)]*?\s)?(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l)\b[^)]*\)/.exec(text);

  const quantity = readQuantity(text);
  if (!quantity) {
    return null;
  }
  text = quantity.rest.trim();

  let gramsPerUnit: number | null = null;
  for (const unit of UNITS) {
    const match = unit.pattern.exec(text);
    if (match) {
      gramsPerUnit = unit.grams;
      text = text.slice(match[0].length).trim();
      break;
    }
  }
  text = dropArticle(text.replace(/\([^)]*\)/g, ' ').trim());
  const term = termOf(text);
  if (term.length < 2) {
    return null;
  }

  let quantityG: number | null = null;
  if (bracketGrams) {
    const unitWeight = UNITS.find((unit) => unit.pattern.test(bracketGrams[2] ?? ''))?.grams ?? 1;
    const perPiece = Number((bracketGrams[1] ?? '0').replace(',', '.')) * unitWeight;
    // Le poids d'une boîte s'applique à chaque boîte, sauf si la parenthèse
    // donne déjà le total (« 2 boîtes (800 g) ») : on ne peut pas le savoir,
    // et l'éditeur le montre de toute façon.
    quantityG = perPiece * (gramsPerUnit !== null ? quantity.value : 1);
  } else if (gramsPerUnit !== null) {
    quantityG = quantity.value * gramsPerUnit;
  } else {
    const piece = PIECES.find((item) => item.pattern.test(term));
    quantityG = piece ? quantity.value * piece.grams : null;
  }

  return {
    line,
    term,
    quantityG: quantityG === null ? null : Math.max(1, Math.round(quantityG)),
  };
}
