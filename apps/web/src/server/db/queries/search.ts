import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../client';
import type { SearchHit } from '@/lib/types';

/**
 * Recherche par similarité trigramme (FR-7, AD-6).
 *
 * La recherche porte sur les *mots* du terme, pas sur le terme entier. C'est
 * la seule façon d'atteindre CIQUAL, dont les libellés sont documentaires et
 * non naturels : « Poulet, cuisse, viande rôtie/cuite au four » ne contient
 * nulle part la suite continue « poulet roti ». Mesuré avant correction, la
 * requête « poulet roti » ne remontait que « Mulet, rôti/cuit au four ». La
 * reconnaissance photo en souffrait le plus, le modèle de vision rendant
 * précisément des libellés naturels.
 *
 * L'opérateur reste `word_similarity` et non `similarity` (chaîne entière) :
 * `similarity('riz', 'riz blanc, cuit, sans sel ajouté')` vaut 0,13, sous
 * tout seuil utile, alors que `word_similarity` vaut 1.
 *
 * Il s'écrit `colonne %> mot` et non `mot <% colonne`, bien que les deux
 * soient équivalents : GIN n'indexe que l'opérande de gauche. Écrite à
 * l'envers, la clause part en balayage séquentiel.
 *
 * L'expression `nutri_normalize(name)` est exactement celle de l'index GIN
 * créé en migration 0003. Toute divergence, même un `lower()` de plus, ferait
 * retomber le planificateur sur un balayage séquentiel.
 */

/**
 * Part des mots du terme qu'un candidat doit couvrir pour être retenu.
 *
 * Ce seuil s'applique à la moyenne des `word_similarity` mot à mot, pas à la
 * similarité du terme entier : il est donc bien plus permissif que l'ancien
 * 0,6 sur la chaîne complète, tout en restant sélectif sur un mot isolé.
 */
export const SIMILARITY_THRESHOLD = 0.55;

/**
 * Au-dessus de ce seuil, un mot du terme est considéré présent dans le libellé.
 * En dessous, les trigrammes partagés relèvent du hasard orthographique.
 */
const WORD_MATCH_THRESHOLD = 0.6;

/**
 * Part des mots du terme qui doivent être franchement présents.
 *
 * `cover`, qui est une moyenne, ne suffit pas à écarter un libellé qui ne
 * partage qu'un mot sur cinq : les mots absents n'y comptent pas zéro mais le
 * bruit de leurs trigrammes. Sur « saumon grillé au citron avec des légumes
 * verts », cela suffisait à faire remonter « Légumes farcis » et, pire, à
 * empêcher le repli de se déclencher puisque la liste n'était pas vide.
 */
const MIN_WORDS_MATCHED = 0.6;

/** Aucune requête en dessous de trois caractères (FR-7). */
export const MIN_QUERY_LENGTH = 3;

const DEFAULT_LIMIT = 20;

/**
 * Mots outils écartés du score. Sans eux, « blanc de poulet » serait jugé sur
 * trois mots dont un que la base ne porte jamais, et le candidat parfait
 * plafonnerait aux deux tiers.
 *
 * La liste ne contient que des mots grammaticaux. Les qualificatifs de taille
 * ou de forme n'y ont pas leur place, si vides de sens qu'ils paraissent : en
 * cuisine ils nomment l'aliment. « petit » retiré, « petit pois » se réduisait
 * à « pois » et remontait « Pois cassé, sec » ; « plat » retiré, « œuf au
 * plat » perdait ce qui le distingue d'un œuf dur.
 */
const STOP_WORDS = new Set([
  'avec',
  'sans',
  'aux',
  'des',
  'les',
  'une',
  'sur',
  'dans',
  'pour',
  'mon',
  'son',
  'leur',
  'que',
  'qui',
]);

/**
 * Normalisation d'un mot, alignée sur `nutri_normalize` côté base : minuscules
 * et accents retirés. Le découpage tombe sur tout ce qui n'est ni lettre ni
 * chiffre, la ponctuation de CIQUAL étant abondante (virgules, barres obliques,
 * parenthèses).
 */
function tokenize(term: string): string[] {
  const words = term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

  return [...new Set(words)];
}

/**
 * Dépluralisation minimale : le modèle de vision et les utilisateurs écrivent
 * « carottes », CIQUAL écrit « Carotte, crue ». Le `s` final suffit à faire
 * chuter `word_similarity` sous le seuil. Pas de véritable racinisation : sur
 * des noms d'aliments, couper plus loin confondrait « pomme » et « pommade ».
 */
function singularize(word: string): string {
  return word.length > 4 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

interface SearchRow extends Record<string, unknown> {
  kind: 'ciqual' | 'product';
  ref: string;
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  serving_size_g: string | null;
  score: number;
}

function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * Score composite, mesuré sur les libellés CIQUAL réels :
 *
 * - `cover` : couverture mot à mot, le signal principal. C'est lui qui fait
 *   remonter « Poulet, cuisse, viande rôtie » sur « poulet roti ».
 * - `head` : le libellé commence par un mot du terme. CIQUAL nomme l'aliment
 *   d'abord et le qualifie ensuite ; sans ce bonus, « avocat » remontait
 *   « Huile d'avocat » avant « Avocat, chair sans peau, crue », et « frites »
 *   plaçait « Sauce pommes frites » en tête.
 * - `whole` : similarité de chaîne entière, qui départage à couverture égale
 *   en faveur du libellé le plus proche et le moins bavard.
 *
 * Une correspondance obtenue sur la racine compte un peu moins qu'une
 * correspondance sur le mot écrit. Sans cet écart, « pates » remontait « Pâté
 * breton » avant « Pâtes sèches » : les accents tombant à la normalisation,
 * « pâté » et « pâtes » partagent la même racine « pate », et le libellé le
 * plus court gagnait le départage.
 *
 * À score égal, le libellé le plus court gagne : c'est le plus générique, donc
 * le plus probable quand l'utilisateur n'a rien précisé.
 */
async function runSearch(
  words: readonly string[],
  term: string,
  limit: number,
): Promise<SearchHit[]> {
  const roots = words.map(singularize);

  const rows = await db().execute<SearchRow>(sql`
    WITH w AS MATERIALIZED (
      SELECT unnest(${textArray(words)}) AS word,
             unnest(${textArray(roots)}) AS root
    ),
    recall AS MATERIALIZED (
      SELECT DISTINCT ON (kind, ref) * FROM (
        SELECT
          'ciqual'::text AS kind,
          c.ciqual_code AS ref,
          c.name AS name,
          c.kcal_100g AS kcal,
          c.protein_100g AS protein,
          c.carbs_100g AS carbs,
          c.fat_100g AS fat,
          NULL::numeric AS serving_size_g
        FROM ciqual_foods c
        JOIN w ON nutri_normalize(c.name) %> w.root
        WHERE c.is_complete

        UNION ALL

        SELECT
          'product'::text,
          p.barcode,
          p.name,
          p.kcal_100g,
          p.protein_100g,
          p.carbs_100g,
          p.fat_100g,
          p.serving_size_g
        FROM products p
        JOIN w ON nutri_normalize(p.name) %> w.root
      ) hits
    ),
    scored AS (
      SELECT
        r.*,
        (
          SELECT avg(greatest(
            word_similarity(w.word, nutri_normalize(r.name)),
            word_similarity(w.root, nutri_normalize(r.name)) * 0.93
          ))
          FROM w
        ) AS cover,
        (
          SELECT max(CASE
            WHEN nutri_normalize(r.name) LIKE w.word || '%' THEN 1.0
            WHEN nutri_normalize(r.name) LIKE w.root || '%' THEN 0.8
            ELSE 0.0
          END)
          FROM w
        ) AS head,
        (
          SELECT avg(CASE WHEN greatest(
            word_similarity(w.word, nutri_normalize(r.name)),
            word_similarity(w.root, nutri_normalize(r.name))
          ) >= ${WORD_MATCH_THRESHOLD} THEN 1.0 ELSE 0.0 END)
          FROM w
        ) AS matched,
        similarity(nutri_normalize(${term}), nutri_normalize(r.name)) AS whole
      FROM recall r
    )
    SELECT
      kind, ref, name, kcal, protein, carbs, fat, serving_size_g,
      (cover * 0.60 + whole * 0.20 + head * 0.20) AS score
    FROM scored
    WHERE cover >= ${SIMILARITY_THRESHOLD}
      AND matched >= ${MIN_WORDS_MATCHED}
    ORDER BY score DESC, length(name) ASC
    LIMIT ${limit}
  `);

  return rows.rows.map((row) => ({
    kind: row.kind,
    origin: row.kind === 'ciqual' ? ('ciqual' as const) : ('cache' as const),
    ref: row.ref,
    name: row.name,
    per100g: {
      kcal: Number(row.kcal),
      proteinG: Number(row.protein),
      carbsG: Number(row.carbs),
      fatG: Number(row.fat),
    },
    servingSizeG: row.serving_size_g === null ? null : Number(row.serving_size_g),
    similarity: Number(row.score),
  }));
}

/**
 * Cherche dans les aliments CIQUAL et le cache produits (FR-7).
 * Les aliments incomplets sont exclus : leurs macros ne sont pas exploitables.
 *
 * Un terme long et descriptif — « saumon grillé au citron avec des légumes » —
 * ne trouve rien en une passe, la moyenne étant tirée vers le bas par les mots
 * que la base n'a pas. Plutôt que de rendre une liste vide, une seconde passe
 * ne garde que les deux premiers mots significatifs. En français l'aliment se
 * nomme avant de se qualifier : « saumon grillé » y survit, et c'est bien
 * « Saumon, grillé/poêlé » qui remonte. Trier ces mots par longueur plutôt que
 * par position remontait « Légumes farcis », le plus long des mots n'étant pas
 * celui qui désigne le plat.
 *
 * Reste le cas du qualificatif que CIQUAL n'emploie pas : « grande crevette »
 * ne couvre qu'un mot sur deux et se voit écarté. Une dernière passe garde le
 * mot le plus long, meilleur indice de spécificité quand il n'en reste qu'un à
 * choisir. Ces passes ne coûtent un aller-retour que dans le cas déjà perdu.
 */
export async function searchReferenceFoods(
  term: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SearchHit[]> {
  const trimmed = term.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const words = tokenize(trimmed);
  if (words.length === 0) {
    return [];
  }

  const hits = await runSearch(words, trimmed, limit);
  if (hits.length > 0) {
    return hits;
  }

  if (words.length >= 3) {
    const narrowed = words.slice(0, 2);
    const second = await runSearch(narrowed, narrowed.join(' '), limit);
    if (second.length > 0) {
      return second;
    }
  }

  if (words.length < 2) {
    return hits;
  }

  // Dernier recours : le mot le plus long, faute de mieux le plus spécifique.
  const longest = [...words].sort((a, b) => b.length - a.length)[0]!;
  return runSearch([longest], longest, limit);
}
