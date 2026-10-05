import 'server-only';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '../client';
import { OPEN_CASE_STATUSES, type Detection, type Priority, type SanctionKind, type TargetKind } from '@/lib/moderation/types';
import type { StrikeRecord } from '@/lib/moderation/strikes';
import type { ReportSample } from '@/lib/moderation/reports';
import type { TrustFactors } from '@/lib/moderation/trust';
import type { ReportReason } from '@/lib/social';

/**
 * Accès de la modération.
 *
 * Les fonctions qui portent sur une personne la reçoivent en premier
 * argument. Celles qui croisent plusieurs comptes le font par nature — un
 * signalement relie deux personnes, une vague en relie davantage — et restent
 * bornées à une cible : la personne ou la séance visée. Rien ici ne lit le
 * journal, les pesées ni le profil : la modération ne regarde que la
 * Communauté.
 */

const RESTRICTING: readonly SanctionKind[] = ['restriction', 'suspension', 'ban'];
const EXCLUDING: readonly SanctionKind[] = ['suspension', 'ban'];

function kindsList(kinds: readonly SanctionKind[]): SQL {
  return sql.raw(kinds.map((kind) => `'${kind}'`).join(', '));
}

/**
 * Vrai si ce compte est suspendu ou banni de la Communauté en ce moment :
 * il n'apparaît plus dans la recherche ni dans le fil des autres.
 */
export function communityExcluded(user: AnyPgColumn | SQL): SQL {
  return sql`exists (
    select 1 from ${schema.moderationSanctions}
    where ${schema.moderationSanctions.userId} = ${user}
      and ${schema.moderationSanctions.kind} in (${kindsList(EXCLUDING)})
      and ${schema.moderationSanctions.liftedAt} is null
      and ${schema.moderationSanctions.startsAt} <= now()
      and (${schema.moderationSanctions.endsAt} is null or ${schema.moderationSanctions.endsAt} > now())
  )`;
}

export interface ActiveSanction {
  kind: SanctionKind;
  endsAt: Date | null;
}

/** Les restrictions, suspensions et bannissements en cours de ce compte. */
export async function activeSanctions(userId: number): Promise<ActiveSanction[]> {
  const rows = await db()
    .select({ kind: schema.moderationSanctions.kind, endsAt: schema.moderationSanctions.endsAt })
    .from(schema.moderationSanctions)
    .where(
      and(
        eq(schema.moderationSanctions.userId, userId),
        sql`${schema.moderationSanctions.kind} in (${kindsList(RESTRICTING)})`,
        isNull(schema.moderationSanctions.liftedAt),
        lte(schema.moderationSanctions.startsAt, sql`now()`),
        or(isNull(schema.moderationSanctions.endsAt), sql`${schema.moderationSanctions.endsAt} > now()`),
      ),
    );
  return rows.map((row) => ({ kind: row.kind as SanctionKind, endsAt: row.endsAt }));
}

/** Les strikes de ce compte, pour le total amorti. */
export async function strikeRecords(userId: number): Promise<StrikeRecord[]> {
  const rows = await db()
    .select({
      weight: schema.moderationSanctions.strikeWeight,
      at: schema.moderationSanctions.startsAt,
      voided: schema.moderationSanctions.voided,
    })
    .from(schema.moderationSanctions)
    .where(and(eq(schema.moderationSanctions.userId, userId), sql`${schema.moderationSanctions.strikeWeight} > 0`));
  return rows.map((row) => ({ weight: Number(row.weight), at: row.at, voided: row.voided }));
}

/** L'âge du compte, en jours, et s'il s'est présenté. */
export async function accountFacts(userId: number): Promise<{ ageDays: number; handle: string | null } | null> {
  const [row] = await db()
    .select({ createdAt: schema.users.createdAt, handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!row) {
    return null;
  }
  return { ageDays: (Date.now() - row.createdAt.getTime()) / 86_400_000, handle: row.handle };
}

/** Dossiers de cette catégorie ouverts contre ce compte depuis `since`. */
export async function recentCaseCount(userId: number, category: string, since: Date): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.moderationCases)
    .where(
      and(
        eq(schema.moderationCases.subjectUserId, userId),
        eq(schema.moderationCases.category, category),
        gte(schema.moderationCases.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/** Les facteurs du score de confiance de ce compte (voir `lib/moderation/trust.ts`), strikes exceptés. */
export async function trustFactors(userId: number): Promise<Omit<TrustFactors, 'strikeTotal'> | null> {
  const facts = await accountFacts(userId);
  if (facts === null) {
    return null;
  }
  const result = await db().execute<{
    followers: number;
    shared: number;
    confirmed: number;
    dismissed: number;
    coordinated: number;
  }>(sql`
    select
      (select count(*)::int from follows where followee_id = ${userId} and status = 'accepted') as followers,
      (select count(*)::int from workout_sessions
        where user_id = ${userId} and visibility <> 'private' and finished_at is not null) as shared,
      (select count(*)::int from social_reports where reporter_id = ${userId} and status = 'action_taken') as confirmed,
      (select count(*)::int from social_reports where reporter_id = ${userId} and status = 'dismissed') as dismissed,
      (select count(*)::int from social_reports r join moderation_cases c on c.id = r.case_id
        where r.reporter_id = ${userId} and 'COORDINATED_REPORTING' = any(c.flags)) as coordinated`);
  const row = result.rows[0];
  return {
    accountAgeDays: facts.ageDays,
    hasIdentity: facts.handle !== null,
    acceptedFollowers: row?.followers ?? 0,
    sharedFinishedSessions: row?.shared ?? 0,
    confirmedReports: row?.confirmed ?? 0,
    dismissedReports: row?.dismissed ?? 0,
    coordinatedReports: row?.coordinated ?? 0,
  };
}

/** Ce qu'un dossier reçoit à chaque décision. */
export interface CaseWrite {
  subjectUserId: number;
  targetKind: TargetKind;
  targetId: number;
  category: string | null;
  severity: string | null;
  riskScore: number;
  level: string;
  priority: Priority;
  flags: readonly string[];
  explanation: Record<string, unknown>;
  recommendedAction: string | null;
  contentSnapshot: string | null;
  policyVersion: string;
  status: 'open' | 'triaged';
}

/**
 * Ouvre le dossier d'une cible, ou complète celui qui est déjà ouvert.
 *
 * Un dossier ne s'adoucit pas : la priorité ne descend pas, le score ne
 * baisse pas, et la justification gardée est celle de la décision la plus
 * grave. Les drapeaux s'additionnent.
 */
export async function upsertCase(write: CaseWrite): Promise<{ id: number; created: boolean }> {
  const graver = sql`excluded.risk_score >= ${schema.moderationCases.riskScore}`;
  const [row] = await db()
    .insert(schema.moderationCases)
    .values({
      subjectUserId: write.subjectUserId,
      targetKind: write.targetKind,
      targetId: write.targetId,
      category: write.category,
      severity: write.severity,
      riskScore: write.riskScore.toFixed(3),
      level: write.level,
      priority: write.priority,
      status: write.status,
      flags: [...write.flags],
      explanation: write.explanation,
      recommendedAction: write.recommendedAction,
      contentSnapshot: write.contentSnapshot,
      policyVersion: write.policyVersion,
    })
    .onConflictDoUpdate({
      target: [schema.moderationCases.targetKind, schema.moderationCases.targetId],
      targetWhere: sql`status in (${sql.raw(OPEN_CASE_STATUSES.map((status) => `'${status}'`).join(', '))})`,
      set: {
        category: sql`case when ${graver} then excluded.category else ${schema.moderationCases.category} end`,
        severity: sql`case when ${graver} then excluded.severity else ${schema.moderationCases.severity} end`,
        level: sql`case when ${graver} then excluded.level else ${schema.moderationCases.level} end`,
        explanation: sql`case when ${graver} then excluded.explanation else ${schema.moderationCases.explanation} end`,
        policyVersion: sql`case when ${graver} then excluded.policy_version else ${schema.moderationCases.policyVersion} end`,
        recommendedAction: sql`coalesce(excluded.recommended_action, ${schema.moderationCases.recommendedAction})`,
        riskScore: sql`greatest(excluded.risk_score, ${schema.moderationCases.riskScore})`,
        priority: sql`least(excluded.priority, ${schema.moderationCases.priority})`,
        flags: sql`array(select distinct unnest(${schema.moderationCases.flags} || excluded.flags))`,
        contentSnapshot: sql`coalesce(excluded.content_snapshot, ${schema.moderationCases.contentSnapshot})`,
        // Un dossier encore ouvert passe « trié » quand l'automatique a agi ;
        // un dossier qu'un humain a déjà pris en main garde son statut.
        status: sql`case when ${schema.moderationCases.status} = 'open' then excluded.status else ${schema.moderationCases.status} end`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: schema.moderationCases.id, created: sql<boolean>`(xmax = 0)` });
  if (!row) {
    throw new Error("Le dossier n'a pas pu être écrit.");
  }
  return row;
}

export async function insertSignals(caseId: number, detections: readonly Detection[], version: string): Promise<void> {
  if (detections.length === 0) {
    return;
  }
  await db()
    .insert(schema.moderationSignals)
    .values(
      detections.map((detection) => ({
        caseId,
        source: detection.source,
        sourceVersion: version,
        category: detection.category,
        severity: detection.severity,
        confidence: detection.confidence.toFixed(3),
        signals: detection.signals,
      })),
    );
}

/** Propose une sanction qu'un humain doit confirmer, et fait monter le dossier en P1. */
export async function recommendOnCase(caseId: number, action: string): Promise<void> {
  await db()
    .update(schema.moderationCases)
    .set({ recommendedAction: action, priority: sql`least(${schema.moderationCases.priority}, 1)`, updatedAt: new Date() })
    .where(eq(schema.moderationCases.id, caseId));
}

/** Vrai si ce dossier a déjà valu un strike : un même contenu ne se paie qu'une fois. */
export async function caseHasStrike(caseId: number): Promise<boolean> {
  const [row] = await db()
    .select({ id: schema.moderationSanctions.id })
    .from(schema.moderationSanctions)
    .where(and(eq(schema.moderationSanctions.caseId, caseId), sql`${schema.moderationSanctions.strikeWeight} > 0`))
    .limit(1);
  return row !== undefined;
}

export interface SanctionWrite {
  caseId: number | null;
  kind: SanctionKind;
  action: string;
  category: string | null;
  severity: string | null;
  strikeWeight: number;
  endsAt: Date | null;
  decidedBy: string;
  policyVersion: string;
}

export async function insertSanction(userId: number, write: SanctionWrite): Promise<number> {
  const [row] = await db()
    .insert(schema.moderationSanctions)
    .values({
      userId,
      caseId: write.caseId,
      kind: write.kind,
      action: write.action,
      category: write.category,
      severity: write.severity,
      strikeWeight: write.strikeWeight.toFixed(2),
      endsAt: write.endsAt,
      decidedBy: write.decidedBy,
      policyVersion: write.policyVersion,
    })
    .returning({ id: schema.moderationSanctions.id });
  if (!row) {
    throw new Error("La sanction n'a pas pu être écrite.");
  }
  return row.id;
}

/** Une valeur admise dans le détail d'un événement d'audit : jamais de texte libre venu d'un utilisateur. */
export type AuditValue = string | number | boolean | null | readonly string[] | readonly number[];

export interface AuditEntry {
  actor: string;
  event: string;
  caseId: number | null;
  userId: number | null;
  details: Record<string, AuditValue>;
}

/**
 * Écrit des événements d'audit, dans l'ordre. Une seule instruction : le
 * déclencheur les chaîne l'un après l'autre, chaque ligne voyant la précédente.
 */
export async function insertAudit(entries: readonly AuditEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await db()
    .insert(schema.moderationAudit)
    .values(
      entries.map((entry) => ({
        actor: entry.actor,
        event: entry.event,
        caseId: entry.caseId,
        userId: entry.userId,
        details: entry.details,
      })),
    );
}

/**
 * Les lignes du journal d'audit dont l'empreinte ne correspond plus à leur
 * contenu ou à la ligne précédente. Vide si la chaîne est intacte. Le calcul
 * est celui du déclencheur de la migration 0026, à l'identique.
 */
export async function brokenAuditLinks(): Promise<number[]> {
  const result = await db().execute<{ id: number }>(sql`
    select id::int as id from (
      select id, hash, prev_hash,
             lag(hash) over (order by id) as expected_prev,
             row_number() over (order by id) as position,
             encode(sha256(convert_to(concat_ws('|',
               coalesce(prev_hash, ''), id::text,
               to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
               actor, event, coalesce(case_id::text, ''), coalesce(user_id::text, ''), details::text
             ), 'UTF8')), 'hex') as expected_hash
      from moderation_audit
    ) chain
    where hash <> expected_hash or (position > 1 and prev_hash is distinct from expected_prev)
    order by id`);
  return result.rows.map((row) => row.id);
}

/**
 * Compte un geste dans sa fenêtre et rend le total, ce geste compris.
 * Fenêtre fixe, alignée sur l'époque Unix : simple, et suffisant ici.
 */
export async function hitRateLimit(key: string, windowSeconds: number): Promise<number> {
  const result = await db().execute<{ count: number }>(sql`
    insert into rate_limit_hits (key, window_start, count, expires_at)
    values (
      ${key},
      to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}),
      1,
      to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds} + ${windowSeconds})
    )
    on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
    returning count`);
  return result.rows[0]?.count ?? 1;
}

/** Ce qu'un signalement fraîchement écrit reçoit de la modération. */
export async function attachReport(
  reportId: number,
  update: { caseId: number; weight: number; status: 'open' | 'triaged' },
): Promise<void> {
  await db()
    .update(schema.socialReports)
    .set({ caseId: update.caseId, weight: update.weight.toFixed(3), status: update.status })
    .where(eq(schema.socialReports.id, reportId));
}

/** Pose le poids d'un signalement, avant son dossier. */
export async function setReportWeight(reportId: number, weight: number): Promise<void> {
  await db()
    .update(schema.socialReports)
    .set({ weight: weight.toFixed(3), status: 'open' })
    .where(eq(schema.socialReports.id, reportId));
}

/**
 * Les signalements encore ouverts sur une cible : la personne seule, ou une
 * de ses séances. Ce qui fait une vague et ce qui fait un poids crédible.
 */
export async function openReportsOn(
  target: { userId: number; sessionId: number | null },
  since: Date | null,
): Promise<(ReportSample & { reason: ReportReason })[]> {
  const rows = await db()
    .select({
      reporterId: schema.socialReports.reporterId,
      reporterCreatedAt: schema.users.createdAt,
      weight: schema.socialReports.weight,
      note: schema.socialReports.note,
      reason: schema.socialReports.reason,
      createdAt: schema.socialReports.createdAt,
    })
    .from(schema.socialReports)
    .innerJoin(schema.users, eq(schema.users.id, schema.socialReports.reporterId))
    .where(
      and(
        eq(schema.socialReports.reportedUserId, target.userId),
        target.sessionId === null
          ? isNull(schema.socialReports.sessionId)
          : eq(schema.socialReports.sessionId, target.sessionId),
        isNull(schema.socialReports.resolvedAt),
        or(isNull(schema.socialReports.status), inArray(schema.socialReports.status, ['open', 'triaged', 'under_review'])),
        since === null ? undefined : gte(schema.socialReports.createdAt, since),
      ),
    )
    .orderBy(desc(schema.socialReports.createdAt))
    .limit(200);
  const now = Date.now();
  return rows.map((row) => ({
    reporterId: row.reporterId,
    reporterAgeDays: (now - row.reporterCreatedAt.getTime()) / 86_400_000,
    weight: row.weight === null ? 1 : Number(row.weight),
    note: row.note,
    reason: row.reason as ReportReason,
    createdAt: row.createdAt,
  }));
}

/** Le pseudo et le nom affiché d'une personne, tels que les autres les voient. */
export async function publicIdentity(userId: number): Promise<{ handle: string | null; displayName: string | null } | null> {
  const [row] = await db()
    .select({ handle: schema.users.handle, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Les comptes suspendus ou bannis dont le pseudo ressemble à celui-ci
 * (trigrammes, `pg_trgm`) : un banni qui revient sous un nom voisin.
 */
export async function similarExcludedHandles(userId: number, handle: string): Promise<number[]> {
  const result = await db().execute<{ id: number }>(sql`
    select u.id::int as id from users u
    where u.id <> ${userId} and u.handle is not null
      and similarity(u.handle, ${handle}) >= 0.5
      and ${communityExcluded(sql.raw('u.id'))}
    limit 5`);
  return result.rows.map((row) => row.id);
}

/** Le modèle d'une de mes séances, tel que la modération en a besoin au moment de la partager. */
export async function templateOfSession(
  userId: number,
  sessionId: number,
): Promise<{ id: number; name: string; kind: string; reviewedAt: Date | null; hiddenAt: Date | null } | null> {
  const [row] = await db()
    .select({
      id: schema.workoutTemplates.id,
      name: schema.workoutTemplates.name,
      kind: schema.workoutTemplates.kind,
      reviewedAt: schema.workoutTemplates.nameReviewedAt,
      hiddenAt: schema.workoutTemplates.nameHiddenAt,
    })
    .from(schema.workoutSessions)
    .innerJoin(schema.workoutTemplates, eq(schema.workoutTemplates.id, schema.workoutSessions.templateId))
    .where(and(eq(schema.workoutSessions.userId, userId), eq(schema.workoutSessions.id, sessionId)))
    .limit(1);
  return row ?? null;
}

/** Le nom d'un de mes modèles, et s'il est déjà vu des autres par une séance partagée. */
export async function templateExposure(
  userId: number,
  templateId: number,
): Promise<{ name: string; kind: string; shared: boolean } | null> {
  const [row] = await db()
    .select({
      name: schema.workoutTemplates.name,
      kind: schema.workoutTemplates.kind,
      shared: sql<boolean>`exists (
        select 1 from ${schema.workoutSessions}
        where ${schema.workoutSessions.templateId} = ${schema.workoutTemplates.id}
          and ${schema.workoutSessions.visibility} <> 'private'
      )`,
    })
    .from(schema.workoutTemplates)
    .where(and(eq(schema.workoutTemplates.userId, userId), eq(schema.workoutTemplates.id, templateId)))
    .limit(1);
  return row ?? null;
}

/** Retient le verdict sur le nom d'un de mes modèles. */
export async function markTemplateName(userId: number, templateId: number, hidden: boolean): Promise<void> {
  await db()
    .update(schema.workoutTemplates)
    .set({ nameReviewedAt: new Date(), nameHiddenAt: hidden ? new Date() : null })
    .where(and(eq(schema.workoutTemplates.userId, userId), eq(schema.workoutTemplates.id, templateId)));
}

/** Masque un exercice saisi à l'import : il quitte le catalogue commun. */
export async function hideExercise(exerciseId: number): Promise<void> {
  await db()
    .update(schema.exercises)
    .set({ hiddenAt: new Date() })
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.source, 'manual')));
}

/**
 * Applique les durées de conservation (`RETENTION_DAYS`). Rend le nombre de
 * lignes touchées par table, pour l'audit. La base refuse d'effacer une ligne
 * d'audit de moins d'un an, quoi qu'on lui demande.
 */
export async function purgeModerationData(days: {
  caseSnapshot: number;
  closedCase: number;
  endedSanction: number;
  closedReport: number;
  audit: number;
}): Promise<Record<string, number>> {
  const ago = (count: number) => sql`now() - make_interval(days => ${count})`;
  const closed = sql.raw(`('dismissed', 'resolved', 'action_taken')`);
  const snapshots = await db().execute(sql`
    update moderation_cases set content_snapshot = null
    where content_snapshot is not null and resolved_at is not null and resolved_at < ${ago(days.caseSnapshot)}`);
  const cases = await db().execute(sql`
    delete from moderation_cases
    where status in ${closed} and resolved_at is not null and resolved_at < ${ago(days.closedCase)}`);
  const sanctions = await db().execute(sql`
    delete from moderation_sanctions
    where coalesce(lifted_at, ends_at, starts_at) < ${ago(days.endedSanction)}
      and (kind in ('strike', 'warning') or lifted_at is not null or (ends_at is not null and ends_at < now()))`);
  const reports = await db().execute(sql`
    delete from social_reports where resolved_at is not null and resolved_at < ${ago(days.closedReport)}`);
  const audit = await db().execute(sql`delete from moderation_audit where at < ${ago(days.audit)}`);
  const limits = await db().execute(sql`delete from rate_limit_hits where expires_at < now()`);
  return {
    snapshots: snapshots.rowCount ?? 0,
    cases: cases.rowCount ?? 0,
    sanctions: sanctions.rowCount ?? 0,
    reports: reports.rowCount ?? 0,
    audit: audit.rowCount ?? 0,
    rateLimits: limits.rowCount ?? 0,
  };
}
