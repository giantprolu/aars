/**
 * Progression d'entraînement. Module pur, sans dépendance à la base (AD-8).
 *
 * La question posée est simple : est-ce que j'avance ? Elle ne se lit pas sur
 * une séance, qui varie avec le sommeil et l'humeur, mais sur une suite de
 * séances du même exercice. Ce module transforme des séries brutes en cette
 * suite, puis en quelques chiffres qui la résument.
 *
 * La mesure dépend de l'exercice, parce qu'un gainage ne se charge pas :
 *
 * - avec une charge, le 1RM estimé par la formule d'Epley. La charge maximale
 *   seule ne verrait pas passer de 60 kg × 6 à 60 kg × 10, qui est pourtant
 *   exactement la progression que prescrit le programme avant de charger ;
 * - au poids du corps, le plus grand nombre de répétitions d'une série ;
 * - en durée, la plus longue série.
 */

import { shiftDate, startOfWeek } from './date';
import { bestSet, setVolume, type ExerciseKind } from './workout';

/** Une série telle que la progression la lit : son exercice et son jour. */
export interface ProgressSet {
  sessionId: number;
  sessionDate: string;
  exerciseId: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  toFailure: boolean;
}

/** Ce que la progression retient d'un exercice. */
export interface ProgressExercise {
  id: number;
  name: string;
  kind: ExerciseKind;
  muscleGroup: string | null;
}

export type ProgressMetric = 'load' | 'reps' | 'time';

/** Une séance d'un exercice, réduite à ce qui se compare. */
export interface SessionPoint {
  sessionId: number;
  sessionDate: string;
  /** La valeur de la mesure : 1RM estimé en kg, répétitions ou secondes. */
  value: number;
  /** La série qui porte cette valeur, pour l'afficher telle qu'elle a été faite. */
  best: Pick<ProgressSet, 'weightKg' | 'reps' | 'seconds' | 'toFailure'>;
  /** Tonnage de la séance sur cet exercice, en kilogrammes. */
  volume: number;
  setCount: number;
}

export interface ExerciseProgress {
  exercise: ProgressExercise;
  metric: ProgressMetric;
  /** Du plus ancien au plus récent. Jamais vide. */
  points: SessionPoint[];
  latest: SessionPoint;
  /** La meilleure séance ; à égalité, la première à l'avoir atteinte. */
  record: SessionPoint;
  /** Écart entre la dernière séance et la première, `null` sur une seule séance. */
  change: number | null;
}

/** Une semaine de l'historique, lundi en tête. */
export interface WeekPoint {
  weekStart: string;
  volume: number;
  sessions: number;
}

/**
 * Le 1RM estimé d'une série, par la formule d'Epley.
 *
 * Une répétition unique vaut sa charge : Epley la majorerait de 3 %, ce qui
 * ferait mentir le seul cas où le maximum est mesuré et non estimé. Au-delà
 * d'une douzaine de répétitions l'estimation se dégrade, mais elle reste
 * monotone, et c'est la tendance qu'on lit, pas la valeur absolue.
 */
export function estimatedOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || reps === null || weightKg <= 0 || reps <= 0) {
    return null;
  }
  const estimate = reps === 1 ? weightKg : weightKg * (1 + reps / 30);
  return Math.round(estimate * 10) / 10;
}

/**
 * La mesure qui convient à un exercice, d'après sa nature et ses séries.
 *
 * La nature ne suffit pas : une traction est un exercice de force, faite au
 * poids du corps jusqu'au jour où l'on ajoute une ceinture lestée. Une seule
 * série chargée fait basculer l'exercice sur la charge.
 */
export function progressMetric(kind: ExerciseKind, sets: readonly ProgressSet[]): ProgressMetric {
  if (kind === 'hold' || kind === 'cardio') {
    return 'time';
  }
  return sets.some((set) => (set.weightKg ?? 0) > 0 && (set.reps ?? 0) > 0) ? 'load' : 'reps';
}

function valueOf(metric: ProgressMetric, set: ProgressSet): number | null {
  switch (metric) {
    case 'load':
      return estimatedOneRepMax(set.weightKg, set.reps);
    case 'reps':
      return set.reps !== null && set.reps > 0 ? set.reps : null;
    case 'time':
      return set.seconds !== null && set.seconds > 0 ? set.seconds : null;
  }
}

/**
 * Les séances d'un exercice, une par point, du plus ancien au plus récent.
 *
 * Une séance dont aucune série ne porte la mesure est omise plutôt que
 * rendue à zéro : un zéro sur la courbe se lirait comme une régression, alors
 * qu'il ne dit qu'une saisie incomplète.
 */
export function sessionPoints(metric: ProgressMetric, sets: readonly ProgressSet[]): SessionPoint[] {
  const bySession = new Map<number, ProgressSet[]>();
  for (const set of sets) {
    const list = bySession.get(set.sessionId) ?? [];
    list.push(set);
    bySession.set(set.sessionId, list);
  }

  const points: SessionPoint[] = [];
  for (const [sessionId, list] of bySession) {
    let best: ProgressSet | null = null;
    let value: number | null = null;
    for (const set of list) {
      const candidate = valueOf(metric, set);
      if (candidate !== null && (value === null || candidate > value)) {
        value = candidate;
        best = set;
      }
    }
    if (best === null || value === null) {
      continue;
    }
    // À 1RM estimé égal, la série affichée est la plus lourde : 70 × 1 et
    // 60 × 5 se valent presque, mais c'est la charge qu'on retient.
    const shown = metric === 'load' ? (bestSet(list) ?? best) : best;
    points.push({
      sessionId,
      sessionDate: list[0]!.sessionDate,
      value,
      best: {
        weightKg: shown.weightKg,
        reps: shown.reps,
        seconds: shown.seconds,
        toFailure: shown.toFailure,
      },
      volume: Math.round(list.reduce((total, set) => total + setVolume(set), 0)),
      setCount: list.length,
    });
  }

  return points.sort(
    (a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.sessionId - b.sessionId,
  );
}

/** La progression d'un exercice, ou `null` s'il n'a aucune séance mesurable. */
export function exerciseProgress(
  exercise: ProgressExercise,
  sets: readonly ProgressSet[],
): ExerciseProgress | null {
  const own = sets.filter((set) => set.exerciseId === exercise.id);
  const metric = progressMetric(exercise.kind, own);
  const points = sessionPoints(metric, own);
  const first = points[0];
  const latest = points[points.length - 1];
  if (first === undefined || latest === undefined) {
    return null;
  }

  let record = first;
  for (const point of points) {
    if (point.value > record.value) {
      record = point;
    }
  }

  return {
    exercise,
    metric,
    points,
    latest,
    record,
    change: points.length < 2 ? null : Math.round((latest.value - first.value) * 10) / 10,
  };
}

/** Tous les exercices travaillés, le plus récemment fait en tête. */
export function progressByExercise(
  exercises: readonly ProgressExercise[],
  sets: readonly ProgressSet[],
): ExerciseProgress[] {
  return exercises
    .map((exercise) => exerciseProgress(exercise, sets))
    .filter((progress): progress is ExerciseProgress => progress !== null)
    .sort(
      (a, b) =>
        b.latest.sessionDate.localeCompare(a.latest.sessionDate) ||
        a.exercise.name.localeCompare(b.exercise.name, 'fr'),
    );
}

/**
 * Tonnage et nombre de séances par semaine, semaines vides comprises.
 *
 * Les semaines sans séance sont rendues à zéro, contrairement aux séances
 * sans mesure : une semaine de repos est un fait, et la cacher tasserait le
 * graphique au point de faire croire à une régularité qui n'a pas eu lieu.
 */
export function weeklyTotals(
  sets: readonly ProgressSet[],
  weeks: number,
  today: string,
): WeekPoint[] {
  const current = startOfWeek(today);
  const points: WeekPoint[] = Array.from({ length: weeks }, (_, index) => ({
    weekStart: shiftDate(current, -7 * (weeks - 1 - index)),
    volume: 0,
    sessions: 0,
  }));
  const byWeek = new Map(points.map((point) => [point.weekStart, point]));
  const sessionsByWeek = new Map<string, Set<number>>();

  for (const set of sets) {
    const week = startOfWeek(set.sessionDate);
    const point = byWeek.get(week);
    if (point === undefined) {
      continue;
    }
    point.volume += setVolume(set);
    const sessions = sessionsByWeek.get(week) ?? new Set<number>();
    sessions.add(set.sessionId);
    sessionsByWeek.set(week, sessions);
  }

  for (const point of points) {
    point.volume = Math.round(point.volume);
    point.sessions = sessionsByWeek.get(point.weekStart)?.size ?? 0;
  }
  return points;
}

/** Libellé court de la mesure, pour les en-têtes et les axes. */
export const METRIC_LABELS: Record<ProgressMetric, string> = {
  load: '1RM estimé',
  reps: 'Répétitions max',
  time: 'Série la plus longue',
};

function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${formatNumber(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Une valeur de la mesure, avec son unité : « 72,5 kg », « 14 rép. », « 1 min 30 s ». */
export function formatMetric(metric: ProgressMetric, value: number): string {
  switch (metric) {
    case 'load':
      return `${formatNumber(value)} kg`;
    case 'reps':
      return `${formatNumber(value)} rép.`;
    case 'time':
      return formatDuration(value);
  }
}

/** Un écart signé : « +2,5 kg », « −3 rép. », « = » quand rien n'a bougé. */
export function formatChange(metric: ProgressMetric, change: number): string {
  if (change === 0) {
    return '=';
  }
  const sign = change > 0 ? '+' : '−';
  return `${sign}${formatMetric(metric, Math.abs(change))}`;
}

const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

/** « 15 sept. », pour les axes des graphiques où la place manque. */
export function formatShortDate(isoDate: string): string {
  return shortDateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Ce qu'une série mesure, sans son jour ni sa séance. */
export type MeasuredSet = Pick<ProgressSet, 'weightKg' | 'reps' | 'seconds'>;

/** Le record d'un exercice avant la séance du jour. */
export interface PersonalBest {
  metric: ProgressMetric;
  value: number;
}

/** La valeur d'une série dans une mesure donnée, ou `null` si elle ne la porte pas. */
export function setMeasure(metric: ProgressMetric, set: MeasuredSet): number | null {
  switch (metric) {
    case 'load':
      return estimatedOneRepMax(set.weightKg, set.reps);
    case 'reps':
      return (set.weightKg ?? 0) === 0 && set.reps !== null && set.reps > 0 ? set.reps : null;
    case 'time':
      return set.seconds !== null && set.seconds > 0 ? set.seconds : null;
  }
}

/**
 * Le record d'un exercice, sur toutes les séances passées.
 *
 * `null` quand il n'y a rien avant : la première série sur un exercice n'est
 * pas un record, elle est un point de départ, et la fêter chaque fois qu'on
 * découvre une machine viderait le mot de son sens.
 */
export function personalBest(kind: ExerciseKind, history: readonly MeasuredSet[]): PersonalBest | null {
  const metric = progressMetric(
    kind,
    history.map((set) => ({ ...set, sessionId: 0, sessionDate: '', exerciseId: 0, toFailure: false })),
  );
  let best: number | null = null;
  for (const set of history) {
    const value = setMeasure(metric, set);
    if (value !== null && (best === null || value > best)) {
      best = value;
    }
  }
  return best === null ? null : { metric, value: best };
}

/**
 * Vrai si la série dépasse le record.
 *
 * La mesure est celle du record : une traction lestée après des mois au poids
 * du corps change de mesure, et la comparer à un nombre de répétitions n'aurait
 * aucun sens. Elle ne compte donc pas, jusqu'à ce qu'un record lesté existe.
 */
export function beatsPersonalBest(best: PersonalBest | null, set: MeasuredSet): boolean {
  if (best === null) {
    return false;
  }
  const value = setMeasure(best.metric, set);
  return value !== null && value > best.value;
}
