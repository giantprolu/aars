import 'server-only';
import { POLICY_VERSION } from '@/lib/moderation/config';
import { can, type Permission } from '@/lib/moderation/rbac';
import { strikeTotal } from '@/lib/moderation/strikes';
import { OPEN_CASE_STATUSES } from '@/lib/moderation/types';
import type { AdminActor } from '../admin';
import {
  caseForDecision,
  closeCaseReports,
  liftSanction,
  moderationCase,
  resetIdentity,
  setTargetHidden,
  undoAutomaticSanctions,
  updateCaseIfUnchanged,
  type AdminCaseDetail,
} from '../db/queries/admin';
import { insertAudit, insertSanction, type AuditValue } from '../db/queries/moderation';
import { logModeration } from './log';

/**
 * Les décisions humaines sur un dossier.
 *
 * Chaque geste vérifie sa permission (`lib/moderation/rbac.ts`), puis
 * s'appuie sur la version du dossier lue par le modérateur : si le dossier a
 * bougé entre-temps — une autre décision, un nouveau signalement, un double
 * clic — le geste est refusé et rien n'est écrit. Tout est tracé au nom de
 * l'administrateur qui l'a fait.
 */

export type SanctionChoice = 'warning' | 'restriction' | 'suspension' | 'ban';

export type CaseDecision =
  | { action: 'take' }
  | { action: 'confirm'; note: string | null }
  | { action: 'dismiss'; note: string | null }
  | { action: 'hide' }
  | { action: 'restore' }
  | { action: 'reset_identity' }
  | { action: 'sanction'; sanction: SanctionChoice; days: number | null };

export type DecisionResult =
  | { kind: 'done' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'conflict' }
  | { kind: 'invalid'; message: string };

/** Durées admises, en jours. */
export const SANCTION_DAYS: Record<'restriction' | 'suspension', { min: number; max: number }> = {
  restriction: { min: 1, max: 90 },
  suspension: { min: 1, max: 365 },
};

function permissionFor(decision: CaseDecision): Permission {
  switch (decision.action) {
    case 'reset_identity':
      return 'sanction.suspend';
    case 'sanction':
      return decision.sanction === 'ban'
        ? 'sanction.ban'
        : decision.sanction === 'suspension'
          ? 'sanction.suspend'
          : 'sanction.restrict';
    default:
      return 'case.decide';
  }
}

const SANCTION_ACTION: Record<SanctionChoice, (days: number | null) => string> = {
  warning: () => 'soft_warning',
  restriction: (days) => (days !== null && days <= 1 ? 'temporary_restriction' : 'long_restriction'),
  suspension: () => 'account_suspension',
  ban: () => 'permanent_ban',
};

const SANCTION_EVENT: Record<SanctionChoice, string> = {
  warning: 'WARNING_ISSUED',
  restriction: 'USER_RESTRICTED',
  suspension: 'ACCOUNT_SUSPENDED',
  ban: 'ACCOUNT_BANNED',
};

function cleanNote(note: string | null): string | null {
  const cleaned = (note ?? '').trim().slice(0, 500);
  return cleaned === '' ? null : cleaned;
}

export async function decideCase(
  actor: AdminActor,
  caseId: number,
  version: string,
  decision: CaseDecision,
): Promise<DecisionResult> {
  if (!can(actor.role, permissionFor(decision))) {
    return { kind: 'forbidden' };
  }
  const found = await caseForDecision(caseId);
  if (found === null) {
    return { kind: 'not_found' };
  }
  if (!(OPEN_CASE_STATUSES as readonly string[]).includes(found.status)) {
    return { kind: 'invalid', message: 'Ce dossier est clos.' };
  }

  let days: number | null = null;
  if (decision.action === 'sanction' && (decision.sanction === 'restriction' || decision.sanction === 'suspension')) {
    const bounds = SANCTION_DAYS[decision.sanction];
    if (decision.days === null || !Number.isInteger(decision.days) || decision.days < bounds.min || decision.days > bounds.max) {
      return { kind: 'invalid', message: `Durée entre ${bounds.min} et ${bounds.max} jours.` };
    }
    days = decision.days;
  }
  if (decision.action === 'reset_identity' && found.targetKind !== 'user') {
    return { kind: 'invalid', message: 'Ce dossier ne vise pas une personne.' };
  }
  if ((decision.action === 'hide' || decision.action === 'restore') && found.targetKind === 'user') {
    return { kind: 'invalid', message: 'Pour un pseudo, réinitialiser l’identité.' };
  }

  // On prend la main sur le dossier, à la version lue : c'est ce qui bloque
  // les décisions croisées. Les effets ne viennent qu'ensuite.
  const closing = decision.action === 'confirm' || decision.action === 'dismiss';
  const claimed = await updateCaseIfUnchanged(caseId, version, {
    status: decision.action === 'confirm' ? 'resolved' : decision.action === 'dismiss' ? 'dismissed' : 'under_review',
    assignedTo: actor.name,
    ...(closing
      ? {
          resolution: `${decision.action === 'confirm' ? 'confirmé' : 'classé sans suite'}${
            cleanNote(decision.note) === null ? '' : ` — ${cleanNote(decision.note)}`
          }`,
          resolved: true,
        }
      : {}),
  });
  if (!claimed) {
    return { kind: 'conflict' };
  }

  const audit: { event: string; details: Record<string, AuditValue> }[] = [];
  switch (decision.action) {
    case 'take':
      audit.push({ event: 'CASE_TAKEN', details: {} });
      break;
    case 'confirm': {
      const reports = await closeCaseReports(caseId, 'action_taken');
      audit.push({ event: 'CASE_RESOLVED', details: { verdict: 'confirmed', reports } });
      break;
    }
    case 'dismiss': {
      const reports = await closeCaseReports(caseId, 'dismissed');
      const undone = await undoAutomaticSanctions(caseId, actor.name);
      const restored =
        found.targetKind === 'template_name' || found.targetKind === 'exercise_name'
          ? await setTargetHidden(found.targetKind, found.targetId, false)
          : false;
      audit.push({ event: 'CASE_DISMISSED', details: { reports, strikesVoided: undone.voided, sanctionsLifted: undone.lifted } });
      if (reports > 0) {
        audit.push({ event: 'REPORT_DISMISSED', details: { reports } });
      }
      if (restored) {
        audit.push({ event: 'CONTENT_RESTORED', details: { targetKind: found.targetKind, targetId: found.targetId } });
      }
      break;
    }
    case 'hide':
    case 'restore': {
      const changed = await setTargetHidden(found.targetKind, found.targetId, decision.action === 'hide');
      if (changed) {
        audit.push({
          event: decision.action === 'hide' ? 'CONTENT_HIDDEN' : 'CONTENT_RESTORED',
          details: { targetKind: found.targetKind, targetId: found.targetId },
        });
      }
      break;
    }
    case 'reset_identity': {
      const handle = await resetIdentity(found.subjectUserId);
      audit.push({ event: 'IDENTITY_RESET', details: { done: handle !== null } });
      break;
    }
    case 'sanction': {
      const endsAt = days === null ? null : new Date(Date.now() + days * 86_400_000);
      const sanctionId = await insertSanction(found.subjectUserId, {
        caseId,
        kind: decision.sanction,
        action: SANCTION_ACTION[decision.sanction](days),
        category: null,
        severity: null,
        strikeWeight: 0,
        endsAt,
        decidedBy: actor.name,
        policyVersion: POLICY_VERSION,
      });
      audit.push({
        event: SANCTION_EVENT[decision.sanction],
        details: { sanctionId, days, endsAt: endsAt === null ? null : endsAt.toISOString() },
      });
      break;
    }
  }

  await insertAudit(
    audit.map((entry) => ({ actor: actor.name, event: entry.event, caseId, userId: found.subjectUserId, details: entry.details })),
  );
  logModeration('human_decision', { caseId, action: decision.action, actor: actor.name });
  return { kind: 'done' };
}

/** Lève une sanction ; `voided` annule aussi le strike (une erreur reconnue). */
export async function liftSanctionAs(
  actor: AdminActor,
  sanctionId: number,
  reason: string | null,
  voided: boolean,
): Promise<DecisionResult> {
  if (!can(actor.role, 'sanction.lift')) {
    return { kind: 'forbidden' };
  }
  const lifted = await liftSanction(sanctionId, actor.name, cleanNote(reason), voided);
  if (lifted === null) {
    return { kind: 'not_found' };
  }
  await insertAudit([
    {
      actor: actor.name,
      event: 'SANCTION_LIFTED',
      caseId: lifted.caseId,
      userId: lifted.userId,
      details: { sanctionId, kind: lifted.kind, voided },
    },
  ]);
  logModeration('sanction_lifted', { sanctionId, kind: lifted.kind, actor: actor.name });
  return { kind: 'done' };
}

export interface CaseView extends AdminCaseDetail {
  /** Total amorti des strikes de la personne. */
  strikeTotal: number;
  /** Ce que ce rôle peut faire sur ce dossier : le tableau de bord n'affiche que ces gestes. */
  allowed: Permission[];
}

/** Un dossier tel que le tableau de bord le montre, avec les gestes permis au rôle qui le lit. */
export async function caseView(actor: AdminActor, caseId: number): Promise<CaseView | null> {
  const found = await moderationCase(caseId);
  if (found === null) {
    return null;
  }
  const strikes = found.sanctions
    .filter((sanction) => sanction.strikeWeight > 0)
    .map((sanction) => ({ weight: sanction.strikeWeight, at: new Date(sanction.startsAt), voided: sanction.voided }));
  const permissions: readonly Permission[] = [
    'case.content',
    'case.decide',
    'sanction.restrict',
    'sanction.suspend',
    'sanction.ban',
    'sanction.lift',
  ];
  return {
    ...found,
    // Le texte en cause n'est rendu qu'à un rôle qui peut le voir.
    contentSnapshot: can(actor.role, 'case.content') ? found.contentSnapshot : null,
    strikeTotal: strikeTotal(strikes, new Date()),
    allowed: permissions.filter((permission) => can(actor.role, permission)),
  };
}
