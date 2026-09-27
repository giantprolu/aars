/**
 * Pesées. Fonctions pures (AD-8).
 *
 * Le poids d'un jour ne veut rien dire : il bouge d'un kilo avec le sel et
 * l'eau de la veille. La moyenne d'une semaine, elle, se lit — et c'est sur
 * la même grille de semaines que le tonnage qu'on la pose, pour voir d'un
 * coup d'œil si le poids qui monte est celui d'un corps qui soulève plus.
 */

import { shiftDate, startOfWeek } from './date';

export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;

export function isValidWeighIn(weightKg: number): boolean {
  return Number.isFinite(weightKg) && weightKg >= MIN_WEIGHT_KG && weightKg <= MAX_WEIGHT_KG;
}

export interface WeighIn {
  day: string;
  weightKg: number;
}

/** Une semaine de pesées, lundi en tête. `null` quand on ne s'est pas pesé. */
export interface WeekWeight {
  weekStart: string;
  weightKg: number | null;
  count: number;
}

/**
 * La moyenne des pesées, semaine par semaine, sur les `weeks` dernières.
 *
 * Une semaine sans pesée reste vide et non interpolée : un trait tiré entre
 * deux mesures inventerait un poids qu'on n'a jamais lu sur la balance.
 */
export function weeklyWeights(
  weighIns: readonly WeighIn[],
  weeks: number,
  today: string,
): WeekWeight[] {
  const current = startOfWeek(today);
  const sums = new Map<string, { total: number; count: number }>();
  for (const weighIn of weighIns) {
    const week = startOfWeek(weighIn.day);
    const sum = sums.get(week) ?? { total: 0, count: 0 };
    sum.total += weighIn.weightKg;
    sum.count += 1;
    sums.set(week, sum);
  }

  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = shiftDate(current, -7 * (weeks - 1 - index));
    const sum = sums.get(weekStart);
    return {
      weekStart,
      weightKg: sum === undefined ? null : Math.round((sum.total / sum.count) * 10) / 10,
      count: sum?.count ?? 0,
    };
  });
}

/**
 * L'écart entre la première et la dernière semaine pesées, en kilos.
 * `null` tant qu'il n'y a pas deux semaines à comparer.
 */
export function weightChange(weeks: readonly WeekWeight[]): number | null {
  const weighed = weeks.filter((week) => week.weightKg !== null);
  const first = weighed[0]?.weightKg;
  const last = weighed[weighed.length - 1]?.weightKg;
  if (weighed.length < 2 || first === undefined || last === undefined || first === null || last === null) {
    return null;
  }
  return Math.round((last - first) * 10) / 10;
}
