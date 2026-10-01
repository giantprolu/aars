/**
 * Analyse de la réponse du modèle de vision (FR-17).
 *
 * Module pur, sans `server-only` : la vérification hors ligne
 * (`scripts/verify-pure.ts`) doit pouvoir l'exercer sur des réponses réelles
 * sans appeler de fournisseur.
 */

/** Un aliment reconnu, et la masse que le modèle lui prête sur la photo. */
export interface RecognizedItem {
  name: string;
  /** Absent quand le modèle n'a pas su ou pas voulu estimer. */
  grams: number | null;
}

const MAX_ITEMS = 12;

/**
 * Au-delà, l'estimation n'est plus une portion mais une erreur de lecture :
 * mieux vaut ne rien pré-remplir que proposer trois kilos de riz.
 */
const MAX_ESTIMATED_G = 1500;

/**
 * Le modèle encadre parfois sa réponse dans un bloc de code, malgré la
 * consigne. On retire ces délimiteurs avant d'analyser, plutôt que de
 * traiter une réponse par ailleurs correcte comme un échec.
 */
function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function usableGrams(value: unknown): number | null {
  const grams = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
    return null;
  }
  return grams > MAX_ESTIMATED_G ? null : Math.round(grams);
}

/**
 * Lit une entrée, sous l'une des formes que les modèles rendent réellement.
 *
 * La forme demandée est `{nom, grammes}`. Mais un modèle à qui l'on demande du
 * JSON sans schéma imposé rend aussi `{name, grams}`, `{aliment, quantite}`,
 * ou une simple chaîne. L'ancienne analyse n'acceptait que des chaînes : une
 * réponse faite d'objets, pourtant juste, devenait une liste vide, affichée
 * « Aucun aliment identifié ».
 */
function readItem(item: unknown): RecognizedItem | null {
  if (typeof item === 'string') {
    return { name: item, grams: null };
  }
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = record.nom ?? record.name ?? record.aliment ?? record.food ?? record.label;
  if (typeof name !== 'string') {
    return null;
  }
  const grams =
    record.grammes ?? record.grams ?? record.quantite ?? record.quantity ?? record.poids;
  return { name, grams: usableGrams(grams) };
}

/**
 * Retient les entrées exploitables d'un tableau.
 *
 * Une entrée aberrante au milieu d'une réponse par ailleurs bonne est écartée
 * sans rejeter les autres : perdre six aliments corrects parce que le septième
 * est un nombre se présentait à l'utilisateur comme une panne du modèle.
 */
function usableItems(items: readonly unknown[]): RecognizedItem[] {
  // Le modèle répète parfois un ingrédient vu à deux endroits de l'assiette :
  // les deux masses s'additionnent, puisqu'il s'agit du même aliment mangé.
  const unique = new Map<string, RecognizedItem>();
  for (const raw of items) {
    const item = readItem(raw);
    if (item === null) {
      continue;
    }
    const name = item.name.trim();
    if (name.length === 0 || name.length > 100) {
      continue;
    }
    const key = name.toLowerCase();
    const known = unique.get(key);
    if (known === undefined) {
      unique.set(key, { name, grams: item.grams });
    } else if (item.grams !== null) {
      known.grams = (known.grams ?? 0) + item.grams;
    }
  }
  return [...unique.values()].slice(0, MAX_ITEMS);
}

/**
 * Extrait la liste d'aliments d'une réponse.
 *
 * Trois formes sont acceptées : l'objet demandé, un tableau nu, et un objet à
 * clé unique portant un tableau. Le mode JSON garantit du JSON valide, pas la
 * forme exacte, et un modèle qui rend `["riz"]` au lieu de `{"aliments":
 * [...]}` a fait le travail utile. Rend `null` quand rien n'est lisible, ce
 * qui distingue une réponse cassée d'une assiette vraiment vide.
 */
export function parseItems(raw: string): RecognizedItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    return usableItems(parsed);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const candidate =
    record.aliments ??
    record.foods ??
    record.items ??
    Object.values(record).find((value) => Array.isArray(value));
  return Array.isArray(candidate) ? usableItems(candidate) : null;
}
