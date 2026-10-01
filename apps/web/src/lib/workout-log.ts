/**
 * Lecture d'une séance écrite à la main. Fonctions pures (AD-8).
 *
 * Personne ne saisit sa séance case par case pendant qu'il s'entraîne. On la
 * note en trois lignes sur son téléphone, dans la langue de la salle :
 *
 *     Chest press machine 4X12 27.5kg - 20 kg - 27.5 kg - 20 kg
 *     shoulder press machine 3X10 50 - 42.5 - 35
 *     pec deck 2X12 et 1X10 (echec) 6-6-6
 *
 * Ce module transforme ces lignes en séries. Il ne devine jamais en silence :
 * ce qu'il n'a pas su trancher ressort en avertissement, et l'écran d'import
 * le fait confirmer avant d'écrire quoi que ce soit en base.
 *
 * Le parti pris est de lire ce qui est écrit plutôt que d'imposer une forme.
 * Une notation qu'il faut apprendre est une notation qu'on n'utilise pas, et
 * la séance finit sur un bout de papier au lieu du journal.
 */

import type { Exercise } from './workout';

/** Une série lue sur une ligne. */
export interface ParsedSet {
  reps: number | null;
  seconds: number | null;
  weightKg: number | null;
  toFailure: boolean;
}

/** Ce que la ligne n'a pas permis de trancher. */
export type ParseWarning =
  | 'none'
  /** Aucune indication de séries : la ligne est un titre, ou une note. */
  | 'no_sets'
  /** Le nombre de charges ne correspond pas au nombre de séries. */
  | 'weight_count';

export interface ParsedExerciseLine {
  /** La ligne telle qu'elle a été écrite, pour la réafficher à l'identique. */
  raw: string;
  /** Le nom de l'exercice, avant toute indication de séries. */
  name: string;
  sets: ParsedSet[];
  warning: ParseWarning;
}

/** Bornes de bon sens, alignées sur celles de la saisie série par série. */
const MAX_SETS_PER_LINE = 20;
const MAX_REPS_PER_SET = 200;

/**
 * « 4X12 », « 3 x 10 », « 2*12 ».
 *
 * Le nombre de séries d'abord, les répétitions ensuite : c'est l'ordre dans
 * lequel un programme s'écrit, et l'inverse ne se rencontre pas.
 */
const SET_SPEC = /(\d{1,2})\s*[x×*]\s*(\d{1,3})\s*(min|mn|sec|s)?(?![0-9])/gi;

/** Un nombre, entier ou décimal, à la virgule ou au point. */
const NUMBER = /\d+(?:[.,]\d+)?/g;

/** « 20 min », « 45 s » : une durée seule, sans notion de série. */
const DURATION = /(\d+(?:[.,]\d+)?)\s*(min(?:utes?)?|mn|s(?:ec(?:ondes?)?)?)\b/i;

/** Ce qui marque une série menée à l'échec, en français comme en anglais. */
const FAILURE = /\b(?:[ée]chec|failure|fail)\b/gi;

/** Puces et numérotations en tête de ligne, qui ne disent rien de l'exercice. */
const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s+/;

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/** Retire accents, ponctuation et doubles espaces. La forme de comparaison. */
export function normalizeExerciseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Convertit une valeur et son unité en secondes. */
function toSeconds(value: number, unit: string | undefined): number {
  const lower = (unit ?? 's').toLowerCase();
  return lower.startsWith('m') ? Math.round(value * 60) : Math.round(value);
}

interface SetSpec {
  count: number;
  reps: number | null;
  seconds: number | null;
  /** Fin de la correspondance dans la ligne, pour rattacher les marqueurs. */
  end: number;
  toFailure: boolean;
}

function readSpecs(line: string): SetSpec[] {
  const specs: SetSpec[] = [];
  SET_SPEC.lastIndex = 0;
  for (let match = SET_SPEC.exec(line); match !== null; match = SET_SPEC.exec(line)) {
    const count = Number(match[1]);
    const value = Number(match[2]);
    const unit = match[3];
    if (count < 1 || count > MAX_SETS_PER_LINE || value < 1) {
      continue;
    }
    // Au-delà du plafond, ce n'est plus une prescription mais une charge mal
    // placée : la ligne ressortira sans séries, à confirmer à la main.
    if (unit === undefined && value > MAX_REPS_PER_SET) {
      continue;
    }
    specs.push({
      count,
      reps: unit === undefined ? value : null,
      seconds: unit === undefined ? null : toSeconds(value, unit),
      end: match.index + match[0].length,
      toFailure: false,
    });
  }
  return specs;
}

/**
 * Rattache chaque « (échec) » au groupe de séries qui le précède.
 *
 * « 2×12 et 1×10 (échec) » n'a deux groupes que pour cette raison : la série
 * isolée est celle qui est allée au bout. Rattacher le marqueur à la ligne
 * entière effacerait précisément ce que la notation cherchait à dire.
 */
function attachFailures(line: string, specs: SetSpec[]): void {
  if (specs.length === 0) {
    return;
  }
  FAILURE.lastIndex = 0;
  for (let match = FAILURE.exec(line); match !== null; match = FAILURE.exec(line)) {
    let target = -1;
    for (const [index, spec] of specs.entries()) {
      if (spec.end <= match.index) {
        target = index;
      }
    }
    if (target >= 0) {
      specs[target]!.toFailure = true;
    }
  }
}

/** Les charges écrites après la dernière indication de séries. */
function readWeights(tail: string): number[] {
  NUMBER.lastIndex = 0;
  const weights: number[] = [];
  for (let match = NUMBER.exec(tail); match !== null; match = NUMBER.exec(tail)) {
    weights.push(toNumber(match[0]));
  }
  return weights;
}

function cleanName(raw: string): string {
  return raw.replace(BULLET, '').replace(/[\s:,;–—-]+$/u, '').trim();
}

/** Lit une ligne. Rend `null` si elle ne porte rien d'exploitable. */
export function parseWorkoutLine(raw: string): ParsedExerciseLine | null {
  const line = raw.trim();
  if (line === '') {
    return null;
  }

  const specs = readSpecs(line);

  if (specs.length === 0) {
    // Pas de « n×m » : reste la forme « Vélo 20 min », qui est une séance de
    // cardio écrite comme on la vit — une durée, et rien d'autre.
    const duration = DURATION.exec(line);
    if (duration !== null) {
      const name = cleanName(line.slice(0, duration.index));
      if (name !== '') {
        return {
          raw: line,
          name,
          sets: [
            {
              reps: null,
              seconds: toSeconds(toNumber(duration[1]!), duration[2]),
              weightKg: null,
              toFailure: false,
            },
          ],
          warning: 'none',
        };
      }
    }
    return { raw: line, name: cleanName(line), sets: [], warning: 'no_sets' };
  }

  attachFailures(line, specs);

  const name = cleanName(line.slice(0, firstSpecIndex(line)));
  const lastEnd = specs[specs.length - 1]!.end;
  const weights = readWeights(line.slice(lastEnd));

  const totalSets = specs.reduce((sum, spec) => sum + spec.count, 0);
  const sets: ParsedSet[] = [];
  for (const spec of specs) {
    for (let index = 0; index < spec.count; index += 1) {
      sets.push({
        reps: spec.reps,
        seconds: spec.seconds,
        weightKg: null,
        toFailure: spec.toFailure,
      });
    }
  }

  // Une charge unique vaut pour toutes les séries : « 3×10 50 » se lit sans
  // ambiguïté. Autant de charges que de séries, chacune la sienne. Tout autre
  // compte est un doute, qu'on reporte au lieu de le trancher au hasard.
  if (weights.length === 1) {
    for (const set of sets) {
      set.weightKg = weights[0]!;
    }
  } else if (weights.length > 0) {
    for (const [index, set] of sets.entries()) {
      set.weightKg = weights[index] ?? weights[weights.length - 1]!;
    }
  }

  const warning: ParseWarning =
    weights.length > 1 && weights.length !== totalSets ? 'weight_count' : 'none';

  return { raw: line, name, sets, warning };
}

/**
 * Où commence la première indication de séries.
 *
 * Une expression neuve est construite à chaque appel parce que `SET_SPEC` est
 * globale et porte un curseur : la réutiliser après l'avoir parcourue rendrait
 * une position fausse une fois sur deux, et le nom de l'exercice serait
 * tronqué au milieu d'un mot.
 */
function firstSpecIndex(line: string): number {
  const found = new RegExp(SET_SPEC.source, 'i').exec(line);
  return found === null ? line.length : found.index;
}

/** Lit un bloc de texte, une ligne par exercice. */
export function parseWorkoutLog(text: string): ParsedExerciseLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseWorkoutLine(line))
    .filter((line): line is ParsedExerciseLine => line !== null);
}

export interface ExerciseMatch {
  exercise: Exercise;
  /** De 0 à 1. Une correspondance exacte, nom ou alias, vaut 1. */
  score: number;
}

/**
 * En deçà, la proposition serait plus déroutante qu'utile.
 *
 * Mieux vaut annoncer « exercice inconnu, choisis ou crée » que proposer le
 * rowing barre pour « hip thrust » : une proposition fausse se valide plus
 * facilement qu'elle ne se corrige.
 */
export const MATCH_THRESHOLD = 0.45;

function tokenScore(query: string, candidate: string): number {
  const left = new Set(query.split(' ').filter((token) => token !== ''));
  const right = new Set(candidate.split(' ').filter((token) => token !== ''));
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : (shared / union) * 0.7;
}

function pairScore(query: string, candidate: string): number {
  if (query === candidate) {
    return 1;
  }
  if (query !== '' && candidate !== '' && (candidate.includes(query) || query.includes(candidate))) {
    const ratio =
      Math.min(query.length, candidate.length) / Math.max(query.length, candidate.length);
    return 0.75 + 0.2 * ratio;
  }
  return tokenScore(query, candidate);
}

/** Les exercices du catalogue les plus proches d'un nom écrit à la main. */
export function rankExercises(
  name: string,
  catalog: readonly Exercise[],
  limit = 5,
): ExerciseMatch[] {
  const query = normalizeExerciseName(name);
  if (query === '') {
    return [];
  }

  const scored = catalog.map((exercise) => {
    let best = pairScore(query, normalizeExerciseName(exercise.name));
    for (const alias of exercise.aliases) {
      best = Math.max(best, pairScore(query, normalizeExerciseName(alias)));
    }
    return { exercise, score: best };
  });

  // Le slug départage : deux exercices également proches doivent sortir dans
  // le même ordre d'un import à l'autre, sans quoi la même séance recopiée
  // deux fois viserait deux exercices différents.
  return scored
    .filter((match) => match.score > 0)
    .sort((a, b) =>
      a.score === b.score ? a.exercise.slug.localeCompare(b.exercise.slug) : b.score - a.score,
    )
    .slice(0, limit);
}

/** Le meilleur candidat, s'il est assez proche pour être proposé d'emblée. */
export function bestExerciseMatch(
  name: string,
  catalog: readonly Exercise[],
): ExerciseMatch | null {
  const [best] = rankExercises(name, catalog, 1);
  return best !== undefined && best.score >= MATCH_THRESHOLD ? best : null;
}

/** Un slug acceptable pour un exercice créé depuis un import. */
export function slugFromName(name: string): string {
  const base = normalizeExerciseName(name).replace(/ /g, '-');
  return base === '' ? 'exercice' : base.slice(0, 60);
}
