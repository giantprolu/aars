import 'server-only';
import { env } from '../env';
import { recognizeWithMistral } from './mistral';
import { recognizeWithGemini } from './gemini';

/**
 * Contrat du modèle de vision (FR-17, AD-4).
 *
 * Un seul rôle, quel que soit le fournisseur : nommer des aliments. Ni
 * quantité ni calories, parce qu'un modèle de vision n'a aucun moyen fiable
 * d'évaluer la masse d'une portion sur une image.
 *
 * Le fournisseur est une variable d'environnement et non une dépendance en
 * dur. La raison est vécue : le compte Mistral du projet s'est retrouvé avec
 * un quota à zéro, et l'application n'avait aucun moyen de basculer ailleurs
 * sans réécriture. Le reste du code ne connaît que `recognizeFoods` et ne sait
 * pas qui répond.
 *
 * La consigne et l'analyse de la réponse vivent ici plutôt que chez chaque
 * fournisseur : c'est ce qui garantit que changer de modèle ne change pas la
 * forme des noms rendus, donc pas la qualité de la recherche CIQUAL en aval.
 */

/**
 * Le modèle nomme pour une base précise, et la consigne le dit.
 *
 * Sans ces règles de nommage, le modèle rend des libellés de carte de
 * restaurant — « émincé de volaille et son riz parfumé » — que la recherche
 * CIQUAL ne peut pas rapprocher de « Poulet, blanc, cuit ». Un plat composé
 * rendu d'un bloc est pire encore : aucune ligne CIQUAL ne porte une recette
 * entière, alors que chacun de ses ingrédients y figure.
 *
 * Vérifié sur photos réelles : la consigne rend « poulet rôti », « riz cuit »,
 * « petit pois », « carotte », que la recherche retrouve tous en tête.
 */
export const SYSTEM_PROMPT = [
  "Tu identifies les aliments visibles sur une photo de repas. Ces noms serviront à",
  "retrouver chaque aliment dans la table CIQUAL de l'Anses, dont les libellés sont",
  'génériques et au singulier.',
  '',
  'Règles de nommage, impératives :',
  "- Décompose un plat composé en ses ingrédients principaux, un par entrée. Une pizza",
  "  donne « pâte à pizza », « fromage », « tomate ». Un couscous donne « semoule »,",
  '  « agneau », « carotte ».',
  "- Chaque nom fait un à trois mots : l'aliment de base, puis sa cuisson ou sa forme",
  '  quand elle est visible. « riz cuit », « poulet rôti », « haricot vert », « pain complet ».',
  "- Emploie le mot courant et générique du français, au singulier. Jamais de marque,",
  "  de nom de recette, ni d'adjectif d'aspect. Écris « poulet », pas « émincé de volaille",
  '  fermière ». Écris « tomate », pas « tomate bien mûre ».',
  '- Ne nomme ni la vaisselle, ni les couverts, ni la nappe, ni le décor.',
  '- Au plus huit entrées, les plus nourrissantes en premier.',
  '',
  "N'estime jamais de quantité, de poids, de calories ni de valeur nutritionnelle :",
  "l'utilisateur pèse lui-même.",
  '',
  'Réponds par un objet JSON de la forme {"aliments": ["riz cuit", "poulet rôti"]}.',
  'Si aucun aliment n\'est identifiable, réponds {"aliments": []}.',
].join('\n');

/** Question posée avec l'image. Identique chez les deux fournisseurs. */
export const USER_PROMPT = 'Quels aliments vois-tu ?';

const MAX_NAMES = 12;

/** De quoi énumérer une dizaine de noms courts, pas de quoi disserter. */
export const MAX_TOKENS = 400;

export type RecognizeResult =
  | { kind: 'recognized'; names: string[] }
  | { kind: 'unavailable' }
  | { kind: 'quota_exceeded' }
  | { kind: 'bad_format' };

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

/**
 * Retient les chaînes exploitables d'un tableau.
 *
 * Une entrée aberrante au milieu d'une réponse par ailleurs bonne est écartée,
 * là où la version précédente rejetait la réponse entière : perdre les six
 * aliments corrects d'une photo parce que le septième est un nombre n'aidait
 * personne, et se présentait à l'utilisateur comme une panne du modèle.
 */
function usableNames(items: readonly unknown[]): string[] {
  const names = items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 100);

  // Le modèle répète parfois un ingrédient vu à deux endroits de l'assiette.
  const unique = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, name);
    }
  }

  return [...unique.values()].slice(0, MAX_NAMES);
}

/**
 * Extrait la liste de noms d'une réponse.
 *
 * Trois formes sont acceptées : l'objet demandé, un tableau nu, et un objet à
 * clé unique portant un tableau. Le mode JSON garantit du JSON valide, pas la
 * forme exacte, et un modèle qui rend `["riz"]` au lieu de `{"aliments":
 * ["riz"]}` a fait le travail utile.
 */
export function parseNames(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    return usableNames(parsed);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const candidate = record.aliments ?? record.foods ?? Object.values(record)[0];
  return Array.isArray(candidate) ? usableNames(candidate) : null;
}

/**
 * Sépare l'en-tête d'une data URL de sa charge base64.
 *
 * Mistral veut la data URL entière, Gemini veut le type et les octets
 * séparément. La découpe est ici pour que les deux clients partent de la même
 * validation plutôt que de refaire chacun la sienne.
 */
export function splitDataUrl(
  dataUrl: string,
): { mimeType: string; base64: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  return { mimeType: match[1]!.toLowerCase(), base64: match[2]! };
}

/**
 * Nomme les aliments d'une photo, chez le fournisseur configuré.
 *
 * La photo n'est conservée ni sur disque ni en base : elle vit le temps de
 * l'appel, puis disparaît avec la requête (NFR-3).
 */
export function recognizeFoods(imageDataUrl: string): Promise<RecognizeResult> {
  return env.visionProvider === 'gemini'
    ? recognizeWithGemini(imageDataUrl)
    : recognizeWithMistral(imageDataUrl);
}
