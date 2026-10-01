import 'server-only';
import { env } from '../env';
import type { RecognizedItem } from '@/lib/vision-parse';
import { recognizeWithMistral } from './mistral';
import { recognizeWithGemini } from './gemini';

/**
 * Contrat du modèle de vision (FR-17, AD-4).
 *
 * Un seul rôle, quel que soit le fournisseur : nommer les aliments d'une
 * photo et estimer la masse de chacun.
 *
 * L'estimation de masse était exclue à l'origine, faute de fiabilité. La
 * décision a été renversée le 01/10/2026 avec la reconnaissance payante : une
 * photo qui oblige encore à tout peser n'apporte pas assez pour être vendue.
 * L'estimation reste une proposition. Elle pré-remplit le premier raccourci
 * du pavé de quantité, l'utilisateur la valide ou la corrige, et les calories
 * viennent toujours de la fiche CIQUAL choisie, jamais du modèle.
 *
 * Le fournisseur est une variable d'environnement et non une dépendance en
 * dur. La raison est vécue : le compte Mistral du projet s'est retrouvé avec
 * un quota à zéro, et l'application n'avait aucun moyen de basculer ailleurs
 * sans réécriture. Le reste du code ne connaît que `recognizeFoods` et ne sait
 * pas qui répond.
 *
 * La consigne vit ici plutôt que chez chaque fournisseur, et l'analyse de la
 * réponse dans `lib/vision-parse.ts` : changer de modèle ne change pas la
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
 * La consigne pousse aussi le modèle à toujours proposer quelque chose. Elle
 * l'autorisait à rendre une liste vide « si aucun aliment n'est
 * identifiable », et un modèle rapide à température nulle prenait trop
 * souvent cette sortie sur une photo floue ou mal cadrée : l'utilisateur
 * voyait « Aucun aliment identifié » devant une assiette pleine.
 */
export const SYSTEM_PROMPT = [
  "Tu identifies les aliments d'une photo de repas et tu estimes la masse de chacun.",
  "Les noms serviront à retrouver chaque aliment dans la table CIQUAL de l'Anses, dont",
  'les libellés sont génériques et au singulier.',
  '',
  'Règles de nommage, impératives :',
  "- Décompose un plat composé en ses ingrédients principaux, un par entrée. Une pizza",
  "  donne « pâte à pizza », « fromage », « tomate ». Un couscous donne « semoule »,",
  "  « agneau », « carotte ». Un plat qu'on ne décompose pas à l'œil (soupe, purée,",
  '  gratin, lasagne) garde son nom courant : « soupe de légumes », « lasagne ».',
  "- Chaque nom fait un à trois mots : l'aliment de base, puis sa cuisson ou sa forme",
  '  quand elle est visible. « riz cuit », « poulet rôti », « haricot vert », « pain complet ».',
  "- Emploie le mot courant et générique du français, au singulier. Jamais de marque,",
  "  de nom de recette, ni d'adjectif d'aspect. Écris « poulet », pas « émincé de volaille",
  '  fermière ». Écris « tomate », pas « tomate bien mûre ».',
  '- Compte aussi les boissons, sauces et accompagnements visibles.',
  '- Ne nomme ni la vaisselle, ni les couverts, ni la nappe, ni le décor.',
  '- Au plus huit entrées, les plus nourrissantes en premier.',
  '',
  'Estimation des masses :',
  "- Pour chaque entrée, estime en grammes la quantité qui sera mangée, telle qu'elle",
  '  est servie (cuite si elle est cuite).',
  "- Sers-toi des repères de taille visibles : une assiette plate mesure environ 26 cm,",
  "  une fourchette 19 cm, une tranche de pain environ 30 g, un œuf environ 50 g.",
  '- Donne un nombre entier, sans fourchette ni unité.',
  '',
  "Même sur une photo floue, sombre ou partielle, donne ta meilleure hypothèse :",
  "l'utilisateur corrige ensuite. Ne rends une liste vide que si la photo ne montre",
  'manifestement aucun aliment ni aucune boisson.',
  '',
  'Réponds par un objet JSON de la forme',
  '{"aliments": [{"nom": "riz cuit", "grammes": 150}, {"nom": "poulet rôti", "grammes": 120}]}.',
].join('\n');

/** Question posée avec l'image. Identique chez les deux fournisseurs. */
export const USER_PROMPT = 'Quels aliments vois-tu, et combien de grammes de chacun ?';

/**
 * Plafond de la réponse, raisonnement compris.
 *
 * Il était de 400, calibré pour une dizaine de noms courts. Mais les modèles
 * Gemini récents raisonnent avant de répondre, et ce raisonnement est décompté
 * du même plafond : il pouvait l'épuiser avant que la liste ne soit écrite.
 * La réponse utile reste courte ; ce plafond ne fait que laisser la place de
 * réfléchir.
 */
export const MAX_TOKENS = 4096;

export type RecognizeResult =
  | { kind: 'recognized'; items: RecognizedItem[] }
  | { kind: 'unavailable' }
  | { kind: 'quota_exceeded' }
  | { kind: 'bad_format' };

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
