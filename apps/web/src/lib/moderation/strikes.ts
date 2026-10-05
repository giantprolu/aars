/**
 * Strikes et récidive.
 *
 * Un strike perd la moitié de son poids tous les `STRIKE_HALF_LIFE_DAYS`
 * jours : un écart d'il y a six mois ne pèse plus qu'un quart, une série de
 * la semaine pèse entière. Le total amorti, lu sur l'échelle, donne la
 * sanction ; au-delà du plafond de l'automatique, elle n'est que proposée.
 */

import { AUTO_ACTION_CEILING, STRIKE_HALF_LIFE_DAYS, STRIKE_LADDER } from './config';
import { actionRank, type ModerationAction, type SanctionKind } from './types';

export interface StrikeRecord {
  weight: number;
  at: Date;
  /** Annulé en appel : il ne compte plus du tout. */
  voided: boolean;
}

const DAY_MS = 86_400_000;

export function decayedWeight(weight: number, ageDays: number, halfLifeDays: number = STRIKE_HALF_LIFE_DAYS): number {
  return weight * 0.5 ** (Math.max(0, ageDays) / halfLifeDays);
}

/** Le total amorti des strikes, au millième. */
export function strikeTotal(strikes: readonly StrikeRecord[], now: Date): number {
  const total = strikes
    .filter((strike) => !strike.voided)
    .reduce((sum, strike) => sum + decayedWeight(strike.weight, (now.getTime() - strike.at.getTime()) / DAY_MS), 0);
  return Math.round(total * 1000) / 1000;
}

export interface LadderStep {
  action: ModerationAction;
  kind: SanctionKind;
  hours: number | null;
}

/** Le palier atteint par un total, ou `null` sous le premier. */
export function ladderStep(total: number): LadderStep | null {
  const step = STRIKE_LADDER.find((entry) => total >= entry.from);
  return step === undefined ? null : { action: step.action, kind: step.kind, hours: step.hours };
}

/** Le palier de l'échelle qui porte cette action, pour appliquer un plancher de catégorie. */
export function stepFor(action: ModerationAction): LadderStep | null {
  const step = STRIKE_LADDER.find((entry) => entry.action === action);
  return step === undefined ? null : { action: step.action, kind: step.kind, hours: step.hours };
}

/** Vrai si l'automatique peut appliquer cette action seul. */
export function isAutomatable(action: ModerationAction): boolean {
  return actionRank(action) <= actionRank(AUTO_ACTION_CEILING);
}

/** Le palier le plus haut que l'automatique puisse appliquer, à partir d'un palier visé. */
export function cappedStep(step: LadderStep): LadderStep | null {
  if (isAutomatable(step.action)) {
    return step;
  }
  const ceiling = STRIKE_LADDER.find((entry) => entry.action === AUTO_ACTION_CEILING);
  return ceiling === undefined ? null : { action: ceiling.action, kind: ceiling.kind, hours: ceiling.hours };
}
