/**
 * Le moteur de politique : du score à l'action, sans rien d'aléatoire.
 *
 * Les mêmes détections, le même historique et la même version de politique
 * donnent toujours la même décision. Elle sort avec sa justification
 * structurée (`explanation`), qui reste interne : la personne concernée ne
 * reçoit qu'une explication générale (`messages.ts`), qui ne dit pas quel mot
 * a déclenché quoi, pour ne pas apprendre à passer à côté.
 */

import {
  CATEGORY_POLICIES,
  POLICY_VERSION,
  PRE_EXPOSURE_STRIKE_FACTOR,
  STRIKE_WEIGHT,
} from './config';
import { reportsOnlyPriority } from './reports';
import type { RiskBreakdown } from './score';
import {
  levelRank,
  type CaseFlag,
  type ModerationAction,
  type ModerationCategory,
  type Priority,
  type RiskLevel,
  type Severity,
  type TargetKind,
} from './types';
import type { ReportReason } from '../social';

export interface PolicyContext {
  targetKind: TargetKind;
  /** Vérifié avant d'être montré : le masquer revient à le refuser. */
  preExposure: boolean;
  /** Passe de rattrapage : on ouvre des dossiers, on ne masque ni ne sanctionne. */
  scan: boolean;
  reportReasons: readonly ReportReason[];
  reportWeight: number;
  coordinated: boolean;
  /** Urgence lue dans la note d'un signalement. */
  notePriority: Priority | null;
}

export type ContentAction = Extract<ModerationAction, 'no_action' | 'content_review' | 'content_hidden' | 'content_removed'>;

export interface PolicyDecision {
  policy: string;
  policyVersion: string;
  category: ModerationCategory | null;
  severity: Severity | null;
  confidence: number;
  score: number;
  level: RiskLevel;
  action: ContentAction;
  hide: boolean;
  review: boolean;
  /** `null` : pas de file humaine. */
  priority: Priority | null;
  /** Poids du strike que vaut ce contenu, 0 sans strike. */
  strikeWeight: number;
  /** Sanction minimale imposée par la catégorie, quel que soit l'historique. */
  sanctionFloor: ModerationAction | null;
  flags: CaseFlag[];
  signals: string[];
}

function minPriority(a: Priority | null, b: Priority | null): Priority | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return Math.min(a, b) as Priority;
}

export function decide(risk: RiskBreakdown, context: PolicyContext): PolicyDecision {
  const flags = new Set<CaseFlag>();
  if (context.coordinated) {
    flags.add('COORDINATED_REPORTING');
  }
  const reported = context.reportReasons.length > 0;
  const dominant = risk.dominant;

  const base = {
    policyVersion: POLICY_VERSION,
    score: risk.total,
    level: risk.level,
  };

  if (dominant === null) {
    if (!reported) {
      return {
        ...base,
        policy: 'NONE',
        category: null,
        severity: null,
        confidence: 0,
        action: 'no_action',
        hide: false,
        review: false,
        priority: null,
        strikeWeight: 0,
        sanctionFloor: null,
        flags: [...flags],
        signals: [],
      };
    }
    flags.add('REPORTS_ONLY');
    return {
      ...base,
      policy: 'REPORTS_ONLY',
      category: null,
      severity: null,
      confidence: 0,
      action: 'content_review',
      hide: false,
      review: true,
      priority: minPriority(
        reportsOnlyPriority(context.reportReasons, context.reportWeight, context.coordinated),
        context.notePriority,
      ),
      strikeWeight: 0,
      sanctionFloor: null,
      flags: [...flags],
      signals: [],
    };
  }

  const policy = CATEGORY_POLICIES[dominant.category];
  const level = risk.level;
  const critical = dominant.category === 'minor_safety';

  let review = critical || levelRank(level) >= levelRank(policy.reviewFrom);
  let hide =
    (critical || levelRank(level) >= levelRank(policy.hideFrom)) && dominant.confidence >= policy.minConfidenceToHide;
  const strikeConfidence = policy.minConfidenceToStrike ?? policy.minConfidenceToHide;
  let strikeWeight =
    hide && policy.strikes && dominant.confidence >= strikeConfidence
      ? STRIKE_WEIGHT[dominant.severity] * (context.preExposure ? PRE_EXPOSURE_STRIKE_FACTOR : 1)
      : 0;
  let sanctionFloor =
    hide && strikeWeight > 0 && policy.sanctionFloor !== undefined && levelRank(level) >= levelRank(policy.sanctionFloor.from)
      ? policy.sanctionFloor.action
      : null;

  if (context.scan) {
    // Le rattrapage regarde ce qui est déjà en ligne : il prévient l'équipe,
    // sans rien retirer ni sanctionner sous une règle que l'auteur ignorait.
    review = review || hide;
    hide = false;
    strikeWeight = 0;
    sanctionFloor = null;
  }

  if (critical) {
    flags.add('CRITICAL_SAFETY');
  }
  if (dominant.category === 'self_harm' && (review || hide)) {
    flags.add('SELF_HARM_SUPPORT');
  }
  if (dominant.signals.includes('evasion')) {
    flags.add('EVASION');
  }
  if (risk.pattern > 0 || risk.recidivism > 0) {
    flags.add('RECIDIVISM');
  }

  let priority: Priority | null = review ? (critical ? 0 : (policy.priority[level] ?? 4)) : null;
  if (reported) {
    // Des signalements sur un contenu que les règles jugent léger : on regarde quand même.
    review = true;
    priority = minPriority(priority, reportsOnlyPriority(context.reportReasons, context.reportWeight, context.coordinated));
  }
  if (review) {
    priority = minPriority(priority, context.notePriority);
  }

  const action: ContentAction = hide
    ? context.preExposure && context.targetKind === 'user'
      ? 'content_removed'
      : 'content_hidden'
    : review
      ? 'content_review'
      : 'no_action';

  return {
    ...base,
    policy: `${policy.id}_${level.toUpperCase()}`,
    category: dominant.category,
    severity: dominant.severity,
    confidence: dominant.confidence,
    action,
    hide,
    review,
    priority,
    strikeWeight,
    sanctionFloor,
    flags: [...flags],
    signals: dominant.signals,
  };
}
