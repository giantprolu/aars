import 'server-only';
import { POLICY_VERSION, RISK_MODIFIERS, SNAPSHOT_MAX } from '@/lib/moderation/config';
import { rejectedNameMessage } from '@/lib/moderation/messages';
import { decide, type PolicyContext, type PolicyDecision } from '@/lib/moderation/policy';
import { mergeDetections, type TextField } from '@/lib/moderation/rules';
import { computeRisk, type RiskBreakdown } from '@/lib/moderation/score';
import { cappedStep, isAutomatable, ladderStep, stepFor, strikeTotal, type StrikeRecord } from '@/lib/moderation/strikes';
import { actionRank, type CaseFlag, type Detection, type ModerationAction, type TargetKind } from '@/lib/moderation/types';
import {
  accountFacts,
  caseHasStrike,
  insertAudit,
  insertSanction,
  insertSignals,
  recentCaseCount,
  recommendOnCase,
  similarExcludedHandles,
  strikeRecords,
  upsertCase,
  type AuditEntry,
  type AuditValue,
} from '../db/queries/moderation';
import { logModeration } from './log';
import { RULES_VERSION, TEXT_PROVIDERS } from './providers';

/**
 * Le pipeline : un texte public, ou des signalements, entrent ; une décision
 * tracée sort. Chaque étape est une fonction pure de `lib/moderation`, ce
 * module ne fait que les enchaîner et écrire ce qui doit l'être.
 *
 * Rien n'est écrit pour un texte où rien n'a été vu : ni dossier, ni audit,
 * ni journal du texte. On ne garde pas trace de ce qui ne pose pas problème.
 */

/** Toutes les détections des fournisseurs sur un texte, fusionnées par catégorie. */
export async function detect(text: string, field: TextField): Promise<Detection[]> {
  const outcomes = await Promise.all(TEXT_PROVIDERS.map((provider) => provider.classify({ text, field })));
  return mergeDetections(outcomes.flatMap((outcome) => outcome.detections));
}

/** La catégorie qui porte le score de contenu, avant tout historique. */
export function dominantCategory(detections: readonly Detection[]): string | null {
  return (
    computeRisk({
      detections,
      reportWeight: 0,
      coordinated: false,
      strikeTotal: 0,
      recentSameCategory: 0,
      accountAgeDays: Number.POSITIVE_INFINITY,
      botSignals: 0,
    }).dominant?.category ?? null
  );
}

export interface History {
  strikes: StrikeRecord[];
  strikeTotal: number;
  accountAgeDays: number;
  recentSameCategory: number;
}

/** Ce que l'historique de l'auteur apporte au score. */
export async function historyOf(userId: number, category: string | null): Promise<History> {
  const since = new Date(Date.now() - RISK_MODIFIERS.patternWindowHours * 3_600_000);
  const [strikes, facts, recent] = await Promise.all([
    strikeRecords(userId),
    accountFacts(userId),
    category === null ? Promise.resolve(0) : recentCaseCount(userId, category, since),
  ]);
  return {
    strikes,
    strikeTotal: strikeTotal(strikes, new Date()),
    accountAgeDays: facts?.ageDays ?? 0,
    recentSameCategory: recent,
  };
}

/** La justification interne d'une décision (jamais montrée telle quelle à la personne). */
function explanationOf(decision: PolicyDecision, risk: RiskBreakdown, detections: readonly Detection[]): Record<string, unknown> {
  return {
    category: decision.category,
    severity: decision.severity,
    confidence: decision.confidence,
    level: decision.level,
    score: decision.score,
    signals: decision.signals,
    policy: decision.policy,
    policyVersion: decision.policyVersion,
    action: decision.action,
    priority: decision.priority,
    flags: decision.flags,
    breakdown: {
      content: risk.content,
      recidivism: risk.recidivism,
      pattern: risk.pattern,
      evasion: risk.evasion,
      newAccount: risk.newAccount,
      bot: risk.bot,
      reports: risk.reports,
    },
    detections: detections.map((detection) => ({
      source: detection.source,
      category: detection.category,
      severity: detection.severity,
      confidence: detection.confidence,
      signals: detection.signals,
    })),
  };
}

export interface DecisionRecord {
  subjectUserId: number;
  targetKind: TargetKind;
  targetId: number;
  decision: PolicyDecision;
  risk: RiskBreakdown;
  detections: readonly Detection[];
  history: History;
  /** Le texte en cause, gardé dans le dossier pour la revue. `null` s'il n'y en a pas. */
  snapshot: string | null;
  /** Drapeaux ajoutés hors politique (ressemblance avec un compte banni…). */
  extraFlags: readonly CaseFlag[];
  scan: boolean;
}

export interface Applied {
  caseId: number;
  /** La sanction posée par l'automatique, ou `null`. */
  sanction: ModerationAction | null;
  /** La sanction proposée à un humain, au-delà du plafond de l'automatique. */
  recommended: ModerationAction | null;
}

/**
 * Écrit une décision : le dossier, ses détections, l'audit, et le strike
 * avec la sanction qu'il entraîne. Un dossier ne vaut qu'un strike, quel que
 * soit le nombre de fois où son contenu est revu.
 */
export async function applyDecision(record: DecisionRecord): Promise<Applied> {
  const { decision, risk } = record;
  const flags = [...new Set([...decision.flags, ...record.extraFlags])];
  const priority = decision.priority ?? (record.extraFlags.length > 0 ? 2 : 4);
  const stored = await upsertCase({
    subjectUserId: record.subjectUserId,
    targetKind: record.targetKind,
    targetId: record.targetId,
    category: decision.category,
    severity: decision.severity,
    riskScore: decision.score,
    level: decision.level,
    priority,
    flags,
    explanation: explanationOf(decision, risk, record.detections),
    recommendedAction: null,
    contentSnapshot: record.snapshot === null ? null : record.snapshot.slice(0, SNAPSHOT_MAX),
    policyVersion: POLICY_VERSION,
    status: decision.hide ? 'triaged' : 'open',
  });
  await insertSignals(stored.id, record.detections, RULES_VERSION);

  const audit: AuditEntry[] = [];
  const event = (name: string, details: Record<string, AuditValue>) =>
    audit.push({ actor: 'system', event: name, caseId: stored.id, userId: record.subjectUserId, details });

  if (stored.created) {
    event('CASE_OPENED', { targetKind: record.targetKind, targetId: record.targetId, priority });
  }
  if (record.detections.length > 0) {
    event('MODERATION_DETECTED', {
      sources: [...new Set(record.detections.map((detection) => detection.source))],
      categories: record.detections.map((detection) => detection.category),
      signals: [...new Set(record.detections.flatMap((detection) => detection.signals))],
      rulesVersion: RULES_VERSION,
    });
  }
  event('MODERATION_CLASSIFIED', {
    policy: decision.policy,
    policyVersion: decision.policyVersion,
    category: decision.category,
    severity: decision.severity,
    confidence: decision.confidence,
    score: decision.score,
    level: decision.level,
    action: decision.action,
    priority,
    flags,
  });
  if (decision.hide) {
    event(decision.action === 'content_removed' ? 'CONTENT_REMOVED' : 'CONTENT_HIDDEN', {
      targetKind: record.targetKind,
      targetId: record.targetId,
    });
  }

  let sanction: ModerationAction | null = null;
  let recommended: ModerationAction | null = null;
  if (!record.scan && decision.strikeWeight > 0 && !(await caseHasStrike(stored.id))) {
    const now = new Date();
    const total = strikeTotal([...record.history.strikes, { weight: decision.strikeWeight, at: now, voided: false }], now);
    const step = ladderStep(total);
    const floor = decision.sanctionFloor === null ? null : stepFor(decision.sanctionFloor);
    // Le plancher de la catégorie l'emporte sur l'échelle quand il est plus lourd.
    const target = floor !== null && (step === null || actionRank(floor.action) > actionRank(step.action)) ? floor : step;

    await insertSanction(record.subjectUserId, {
      caseId: stored.id,
      kind: 'strike',
      action: decision.action,
      category: decision.category,
      severity: decision.severity,
      strikeWeight: decision.strikeWeight,
      endsAt: null,
      decidedBy: 'system',
      policyVersion: POLICY_VERSION,
    });
    event('STRIKE_RECORDED', { weight: decision.strikeWeight, total });

    if (target !== null) {
      const capped = cappedStep(target);
      if (!isAutomatable(target.action)) {
        recommended = target.action;
      }
      if (capped !== null) {
        const endsAt = capped.hours === null ? null : new Date(now.getTime() + capped.hours * 3_600_000);
        await insertSanction(record.subjectUserId, {
          caseId: stored.id,
          kind: capped.kind,
          action: capped.action,
          category: decision.category,
          severity: decision.severity,
          strikeWeight: 0,
          endsAt,
          decidedBy: 'system',
          policyVersion: POLICY_VERSION,
        });
        sanction = capped.action;
        event(capped.kind === 'warning' ? 'WARNING_ISSUED' : 'USER_RESTRICTED', {
          action: capped.action,
          endsAt: endsAt === null ? null : endsAt.toISOString(),
        });
      }
    }
    if (recommended !== null) {
      await recommendOnCase(stored.id, recommended);
      event('SANCTION_RECOMMENDED', { action: recommended, total });
    }
  }

  await insertAudit(audit);
  logModeration('decision', {
    caseId: stored.id,
    targetKind: record.targetKind,
    policy: decision.policy,
    level: decision.level,
    action: decision.action,
    priority,
    sanction,
    recommended,
    flags,
  });
  return { caseId: stored.id, sanction, recommended };
}

export interface ContentCheck {
  subjectUserId: number;
  targetKind: Extract<TargetKind, 'user' | 'template_name' | 'exercise_name'>;
  targetId: number;
  text: string;
  field: TextField;
  /** Vérifié avant d'être montré. */
  preExposure: boolean;
  /** Passe de rattrapage : dossier seulement, rien de masqué ni de sanctionné. */
  scan?: boolean;
  /** Pour un pseudo : chercher la ressemblance avec un compte banni. */
  handle?: string | null;
}

export interface ContentVerdict {
  /** Le texte peut être montré aux autres. */
  allowed: boolean;
  /** Le message à la personne si le texte est refusé. */
  message: string | null;
  caseId: number | null;
  decision: PolicyDecision;
}

/** Vérifie un texte public et applique la décision. */
export async function checkContent(check: ContentCheck): Promise<ContentVerdict> {
  const started = Date.now();
  const detections = await detect(check.text, check.field);
  const lookalikes =
    check.handle === undefined || check.handle === null ? [] : await similarExcludedHandles(check.subjectUserId, check.handle);
  const extraFlags: CaseFlag[] = lookalikes.length > 0 ? ['BAN_EVASION_SUSPECTED'] : [];

  if (detections.length === 0 && extraFlags.length === 0) {
    logModeration('checked', { targetKind: check.targetKind, ms: Date.now() - started, detected: false });
    return { allowed: true, message: null, caseId: null, decision: emptyDecision() };
  }

  const history = await historyOf(check.subjectUserId, dominantCategory(detections));
  const risk = computeRisk({
    detections,
    reportWeight: 0,
    coordinated: false,
    strikeTotal: history.strikeTotal,
    recentSameCategory: history.recentSameCategory,
    accountAgeDays: history.accountAgeDays,
    botSignals: 0,
  });
  const context: PolicyContext = {
    targetKind: check.targetKind,
    preExposure: check.preExposure,
    scan: check.scan === true,
    reportReasons: [],
    reportWeight: 0,
    coordinated: false,
    notePriority: null,
  };
  const decision = decide(risk, context);

  if (!decision.review && !decision.hide && extraFlags.length === 0) {
    logModeration('checked', { targetKind: check.targetKind, ms: Date.now() - started, detected: true, policy: decision.policy });
    return { allowed: true, message: null, caseId: null, decision };
  }

  const applied = await applyDecision({
    subjectUserId: check.subjectUserId,
    targetKind: check.targetKind,
    targetId: check.targetId,
    decision,
    risk,
    detections,
    history,
    snapshot: check.text,
    extraFlags,
    scan: check.scan === true,
  });
  return {
    allowed: !decision.hide,
    message: decision.hide ? rejectedNameMessage(decision.category) : null,
    caseId: applied.caseId,
    decision,
  };
}

function emptyDecision(): PolicyDecision {
  return {
    policy: 'NONE',
    policyVersion: POLICY_VERSION,
    category: null,
    severity: null,
    confidence: 0,
    score: 0,
    level: 'safe',
    action: 'no_action',
    hide: false,
    review: false,
    priority: null,
    strikeWeight: 0,
    sanctionFloor: null,
    flags: [],
    signals: [],
  };
}
