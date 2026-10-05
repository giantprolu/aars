import 'server-only';
import { RATE_LIMITS, REPORT_RULES } from '@/lib/moderation/config';
import { decide } from '@/lib/moderation/policy';
import { credibleWeight, detectCoordinatedReporting, notePriority, reportWeight } from '@/lib/moderation/reports';
import { computeRisk } from '@/lib/moderation/score';
import { strikeTotal } from '@/lib/moderation/strikes';
import { trustScore } from '@/lib/moderation/trust';
import type { Detection, Priority } from '@/lib/moderation/types';
import type { ReportReason } from '@/lib/social';
import {
  attachReport,
  insertAudit,
  openReportsOn,
  publicIdentity,
  setReportWeight,
  strikeRecords,
  templateOfSession,
  trustFactors,
  markTemplateName,
} from '../db/queries/moderation';
import { applyDecision, detect, dominantCategory, historyOf } from './pipeline';
import { withinLimit } from './rate-limit';

/**
 * La réception d'un signalement par la modération, une fois écrit en base.
 *
 * Le signalement reçoit un poids (la confiance accordée à son auteur), se
 * range dans le dossier de sa cible, et fait revoir le contenu visé avec ce
 * que l'on sait désormais : les autres signalements, leur éventuelle
 * coordination, l'historique de la personne visée. Il ne sanctionne jamais à
 * lui seul (voir `score.ts`).
 */

/** Le compte du signalement : refusé avant d'être écrit si la limite est atteinte. */
export async function reportAllowed(reporterId: number, targetUserId: number): Promise<boolean> {
  const [perUser, perTarget] = await Promise.all([
    withinLimit(`report:u:${reporterId}`, RATE_LIMITS.reportsPerUser),
    withinLimit(`report:t:${reporterId}:${targetUserId}`, RATE_LIMITS.reportsPerTarget),
  ]);
  if (!perUser || !perTarget) {
    await insertAudit([
      {
        actor: 'system',
        event: 'REPORT_RATE_LIMITED',
        caseId: null,
        userId: reporterId,
        details: { scope: perUser ? 'target' : 'user' },
      },
    ]);
  }
  return perUser && perTarget;
}

/** Ce qu'un signalement pèse, selon qui le fait. */
async function weightOf(reporterId: number): Promise<number> {
  const [factors, strikes] = await Promise.all([trustFactors(reporterId), strikeRecords(reporterId)]);
  if (factors === null) {
    return 0;
  }
  const trust = trustScore({ ...factors, strikeTotal: strikeTotal(strikes, new Date()) });
  return reportWeight({ trust: trust.score, accountAgeDays: factors.accountAgeDays });
}

export interface ReportIntake {
  caseId: number;
  priority: Priority;
  coordinated: boolean;
}

/** Range un signalement déjà écrit dans son dossier, et fait revoir sa cible. */
export async function intakeReport(
  reportId: number,
  reporterId: number,
  target: { userId: number; sessionId: number | null },
  note: string | null,
): Promise<ReportIntake> {
  const weight = await weightOf(reporterId);
  await setReportWeight(reportId, weight);

  const now = new Date();
  const open = await openReportsOn(target, null);
  const windowStart = now.getTime() - REPORT_RULES.brigadeWindowHours * 3_600_000;
  const coordination = detectCoordinatedReporting(
    open.filter((report) => report.createdAt.getTime() >= windowStart),
    now,
  );
  const credible = credibleWeight(open);
  const reasons = [...new Set(open.map((report) => report.reason))] as ReportReason[];

  // Le contenu visé, revu : le nom de la séance, ou le pseudo et le nom affiché.
  let detections: Detection[] = [];
  let snapshot: string | null = null;
  let template: Awaited<ReturnType<typeof templateOfSession>> = null;
  if (target.sessionId !== null) {
    template = await templateOfSession(target.userId, target.sessionId);
    if (template !== null && template.kind !== 'program' && template.hiddenAt === null) {
      snapshot = template.name;
      detections = await detect(template.name, 'template_name');
    }
  } else {
    const identity = await publicIdentity(target.userId);
    if (identity !== null && identity.handle !== null) {
      snapshot = `@${identity.handle}${identity.displayName === null ? '' : ` · ${identity.displayName}`}`;
      detections = await detect(`${identity.handle} ${identity.displayName ?? ''}`, 'identity');
    }
  }

  const history = await historyOf(target.userId, dominantCategory(detections));
  const risk = computeRisk({
    detections,
    reportWeight: credible,
    coordinated: coordination.coordinated,
    strikeTotal: history.strikeTotal,
    recentSameCategory: history.recentSameCategory,
    accountAgeDays: history.accountAgeDays,
    botSignals: 0,
  });
  const decided = decide(risk, {
    targetKind: target.sessionId === null ? 'user' : 'session',
    preExposure: false,
    scan: false,
    reportReasons: reasons,
    reportWeight: credible,
    coordinated: coordination.coordinated,
    notePriority: notePriority(note),
  });
  // Un pseudo déjà en ligne ne se réécrit pas automatiquement : on ne touche
  // pas à l'identité de quelqu'un sans qu'un humain l'ait regardée. Le
  // dossier part en revue avec sa priorité, sans masquage ni strike.
  const decision =
    target.sessionId === null && decided.hide
      ? { ...decided, hide: false, action: 'content_review' as const, strikeWeight: 0, sanctionFloor: null }
      : decided;

  const applied = await applyDecision({
    subjectUserId: target.userId,
    targetKind: target.sessionId === null ? 'user' : 'session',
    targetId: target.sessionId ?? target.userId,
    decision,
    risk,
    detections,
    history,
    snapshot,
    extraFlags: [],
    scan: false,
  });
  if (decision.hide && template !== null) {
    await markTemplateName(target.userId, template.id, true);
  }

  await attachReport(reportId, { caseId: applied.caseId, weight, status: 'triaged' });
  await insertAudit([
    {
      actor: 'system',
      event: 'REPORT_CREATED',
      caseId: applied.caseId,
      userId: target.userId,
      details: { reportId, weight, credibleWeight: credible, reporters: new Set(open.map((report) => report.reporterId)).size },
    },
    ...(coordination.coordinated
      ? [
          {
            actor: 'system',
            event: 'COORDINATED_REPORTING_FLAGGED',
            caseId: applied.caseId,
            userId: target.userId,
            details: { signals: coordination.signals },
          },
        ]
      : []),
  ]);
  return { caseId: applied.caseId, priority: decision.priority ?? 4, coordinated: coordination.coordinated };
}
