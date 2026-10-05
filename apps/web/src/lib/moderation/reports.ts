/**
 * Les signalements : ce qu'ils pèsent, et quand ils forment une vague.
 *
 * Un signalement n'est jamais une preuve. Il pèse selon qui le fait — un
 * compte d'hier pèse moins qu'un compte installé, un compte dont les
 * signalements ont été rejetés pèse moins qu'un autre — et une même personne
 * ne pèse jamais plus d'une fois, quel que soit le nombre de ses signalements.
 *
 * Une vague coordonnée (beaucoup de comptes récents ou peu fiables qui visent
 * la même personne en peu de temps) n'est pas traitée comme une preuve de
 * culpabilité, ni comme une preuve d'innocence : elle est marquée
 * `COORDINATED_REPORTING`, presque neutralisée dans le score, et envoyée à un
 * humain pour qu'il regarde ce qui se passe.
 */

import { REPORT_RULES } from './config';
import { normalizeText } from './normalize';
import { detectWithRules } from './rules';
import { unit, type Priority } from './types';
import type { ReportReason } from '../social';

export function reportWeight(reporter: { trust: number; accountAgeDays: number }): number {
  const youth = reporter.accountAgeDays < REPORT_RULES.youngReporterDays ? REPORT_RULES.youngReporterFactor : 1;
  return unit(reporter.trust * youth);
}

export interface ReportSample {
  reporterId: number;
  reporterAgeDays: number;
  /** Le poids du signalement : la confiance de son auteur, réduite s'il est récent. */
  weight: number;
  note: string | null;
  createdAt: Date;
}

export interface CoordinationResult {
  coordinated: boolean;
  signals: string[];
}

/** Regarde les signalements récents sur une même cible et dit s'ils forment une vague. */
export function detectCoordinatedReporting(reports: readonly ReportSample[], now: Date): CoordinationResult {
  const since = now.getTime() - REPORT_RULES.brigadeWindowHours * 3_600_000;
  const recent = reports.filter((report) => report.createdAt.getTime() >= since);
  const byReporter = new Map<number, ReportSample>();
  for (const report of recent) {
    byReporter.set(report.reporterId, report);
  }
  const reporters = [...byReporter.values()];
  if (reporters.length < REPORT_RULES.brigadeMinReporters) {
    return { coordinated: false, signals: [] };
  }

  const signals: string[] = [];
  const suspect = reporters.filter(
    (report) => report.reporterAgeDays < REPORT_RULES.youngReporterDays || report.weight < REPORT_RULES.lowTrust,
  );
  if (suspect.length / reporters.length >= REPORT_RULES.brigadeSuspectShare) {
    signals.push('young_or_low_trust_reporters');
  }

  const notes = new Map<string, number>();
  for (const report of reporters) {
    const folded = report.note === null ? '' : normalizeText(report.note).folded;
    if (folded.length >= REPORT_RULES.brigadeNoteMinLength) {
      notes.set(folded, (notes.get(folded) ?? 0) + 1);
    }
  }
  if ([...notes.values()].some((count) => count >= REPORT_RULES.brigadeSameNote)) {
    signals.push('identical_notes');
  }

  return { coordinated: signals.length > 0, signals };
}

/**
 * Le poids crédible des signalements sur une cible : chaque personne compte
 * une fois, pour son poids le plus fort, sans dépasser 1.
 */
export function credibleWeight(reports: readonly Pick<ReportSample, 'reporterId' | 'weight'>[]): number {
  const best = new Map<number, number>();
  for (const report of reports) {
    best.set(report.reporterId, Math.max(best.get(report.reporterId) ?? 0, Math.min(1, report.weight)));
  }
  return Math.round([...best.values()].reduce((sum, weight) => sum + weight, 0) * 1000) / 1000;
}

/** Priorité d'un dossier ouvert par des signalements seuls, selon leur motif et leur poids. */
export function reportsOnlyPriority(reasons: readonly ReportReason[], weight: number, coordinated: boolean): Priority {
  let priority: Priority = reasons.includes('harassment') ? 3 : reasons.includes('inappropriate') ? 3 : 4;
  if (weight < REPORT_RULES.minWeightForReview) {
    priority = 4;
  }
  if (weight >= REPORT_RULES.heavyWeight && priority > 2) {
    priority = (priority - 1) as Priority;
  }
  // Une campagne coordonnée se regarde vite : soit elle vise quelqu'un à
  // tort, soit elle signale un vrai problème que beaucoup ont vu.
  if (coordinated && priority > 2) {
    priority = 2;
  }
  return priority;
}

/**
 * Ce que la note d'un signalement dit de l'urgence. La note n'accuse
 * personne : elle décrit. Elle ne sert qu'à faire monter le dossier dans la
 * file, jamais à sanctionner.
 */
export function notePriority(note: string | null): Priority | null {
  if (note === null || note.trim() === '') {
    return null;
  }
  const { normalized, detections } = detectWithRules(note, 'report_note');
  const text = normalized.words;
  if (
    detections.some((detection) => detection.category === 'minor_safety') ||
    /\b(mineur|mineure|mineurs|enfant|enfants|gamin|gamine|ado|ados|collegien|collegienne|pedo|pedophile)\b/.test(text)
  ) {
    return 0;
  }
  if (
    detections.some((detection) => detection.category === 'threat' || detection.category === 'self_harm') ||
    /\b(menace|menaces|menacer|menace de mort|tuer|frapper|suicide|suicidaire|se tuer|anorexie|harcele|harcelement|traque|suit partout)\b/.test(text)
  ) {
    return 1;
  }
  return null;
}
