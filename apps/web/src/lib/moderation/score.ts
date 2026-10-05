/**
 * Le score de risque : un nombre entre 0 et 1, et le détail de ce qui l'a fait.
 *
 * Le contenu fait le score ; l'historique et le contexte ne font que
 * l'aggraver. Un compte récidiviste qui écrit un nom anodin ne présente
 * aucun risque, et ne doit pas être traité comme s'il en présentait un.
 *
 * Les signalements sont la seule composante qui existe sans contenu détecté,
 * et elle est plafonnée sous le seuil MEDIUM : on ne fait pas sanctionner
 * quelqu'un en mobilisant des comptes, on le fait au plus examiner par un
 * humain. Le poids d'un signalement dépend de qui le fait (`reports.ts`), et
 * une vague coordonnée ne compte presque plus.
 */

import { RISK_MODIFIERS, RISK_THRESHOLDS, SEVERITY_WEIGHT } from './config';
import { unit, type Detection, type RiskLevel } from './types';

export interface RiskInput {
  /** Détections sur le contenu (règles, liens), déjà ajustées au contexte. */
  detections: readonly Detection[];
  /** Poids crédible des signalements ouverts sur la cible. */
  reportWeight: number;
  /** Les signalements forment une vague coordonnée. */
  coordinated: boolean;
  /** Strikes amortis de l'auteur, avant cette affaire. */
  strikeTotal: number;
  /** Dossiers de la même catégorie ouverts contre l'auteur dans la fenêtre récente. */
  recentSameCategory: number;
  accountAgeDays: number;
  /** Signaux d'automate relevés (rafales, inscriptions en série…). */
  botSignals: number;
}

export interface RiskBreakdown {
  /** Le contenu seul : confiance × poids de la gravité, la pire catégorie l'emportant. */
  content: number;
  recidivism: number;
  pattern: number;
  evasion: number;
  newAccount: number;
  bot: number;
  reports: number;
  total: number;
  level: RiskLevel;
  /** La détection qui porte le score de contenu, ou `null`. */
  dominant: Detection | null;
}

export function levelOf(score: number): RiskLevel {
  return RISK_THRESHOLDS.find((threshold) => score >= threshold.from)?.level ?? 'safe';
}

export function contentScore(detection: Detection): number {
  return detection.confidence * SEVERITY_WEIGHT[detection.severity];
}

/** La composante des signalements, plafonnée. */
export function reportComponent(reportWeight: number, coordinated: boolean): number {
  const weight = Math.max(0, reportWeight) * (coordinated ? RISK_MODIFIERS.coordinatedDamping : 1);
  return Math.min(RISK_MODIFIERS.reportsCap, RISK_MODIFIERS.reportsPerLog2 * Math.log2(1 + weight));
}

export function computeRisk(input: RiskInput): RiskBreakdown {
  let dominant: Detection | null = null;
  for (const detection of input.detections) {
    if (dominant === null || contentScore(detection) > contentScore(dominant)) {
      dominant = detection;
    }
  }
  const content = dominant === null ? 0 : contentScore(dominant);
  const detected = content > 0;

  const recidivism = detected
    ? content * Math.min(RISK_MODIFIERS.recidivismCap, RISK_MODIFIERS.recidivismPerStrike * Math.max(0, input.strikeTotal))
    : 0;
  const pattern = detected && input.recentSameCategory >= RISK_MODIFIERS.patternCount ? RISK_MODIFIERS.patternBonus : 0;
  const evasion =
    detected && input.detections.some((detection) => detection.signals.includes('evasion')) ? RISK_MODIFIERS.evasionBonus : 0;
  const newAccount = detected && input.accountAgeDays < RISK_MODIFIERS.newAccountDays ? RISK_MODIFIERS.newAccountBonus : 0;
  const bot = detected ? Math.min(RISK_MODIFIERS.botCap, RISK_MODIFIERS.botPerSignal * Math.max(0, input.botSignals)) : 0;
  const reports = reportComponent(input.reportWeight, input.coordinated);

  const total = unit(content + recidivism + pattern + evasion + newAccount + bot + reports);
  return {
    content: unit(content),
    recidivism: unit(recidivism),
    pattern,
    evasion,
    newAccount,
    bot: unit(bot),
    reports: unit(reports),
    total,
    level: levelOf(total),
    dominant,
  };
}
