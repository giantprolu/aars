import 'server-only';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { KITCHEN_PLUS_PRODUCT } from '@/lib/premium';
import { db, schema } from '../client';

/**
 * Lectures et écritures du tableau de bord (`apps/admin`, routes
 * `/api/admin/*`), les seules du serveur qui traversent les comptes.
 *
 * Elles ne lisent ni le journal (`entries`), ni les profils, ni les alias :
 * l'interdit de `CLAUDE.md` tient. Ce qui sort d'ici est agrégé (comptes,
 * usage) ou ne dit pas à qui il appartient (recettes, à qui l'on ajoute une
 * photo). Seule la modération nomme des comptes, par leur identifiant public.
 */

export interface AdminOverview {
  accounts: { total: number; new7: number; new30: number };
  active: { today: number; d7: number; d30: number };
  recipes: { total: number; fromCatalog: number; own: number; ownWithoutPhoto: number };
  plannedThisWeek: number;
  openReports: number;
  /** Dossiers de modération à traiter, et ceux en P0 ou P1. */
  openCases: number;
  urgentCases: number;
  subscriptions: { active: number; kitchenPlus: number };
}

async function count(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? 0;
}

/** Les chiffres de la vue d'ensemble. `today` et `weekStart` en Europe/Paris. */
export async function adminOverview(today: string, weekStart: string): Promise<AdminOverview> {
  const n = sql<number>`count(*)::int`;
  const activeSince = (days: number) =>
    count(
      db()
        .select({ n: sql<number>`count(distinct ${schema.usageDays.userId})::int` })
        .from(schema.usageDays)
        .where(
          and(
            eq(schema.usageDays.event, 'app_opened'),
            sql`${schema.usageDays.day} > ${today}::date - ${days}::int`,
          ),
        ),
    );

  const openCase = sql`${schema.moderationCases.status} in ('open', 'triaged', 'under_review', 'appealed')`;
  const [total, new7, new30, today1, d7, d30, recipes, fromCatalog, ownWithoutPhoto, planned, reports, subs, kitchen, cases, urgent] =
    await Promise.all([
      count(db().select({ n }).from(schema.users)),
      count(db().select({ n }).from(schema.users).where(sql`${schema.users.createdAt} > now() - interval '7 days'`)),
      count(db().select({ n }).from(schema.users).where(sql`${schema.users.createdAt} > now() - interval '30 days'`)),
      activeSince(1),
      activeSince(7),
      activeSince(30),
      count(db().select({ n }).from(schema.recipes)),
      count(db().select({ n }).from(schema.recipes).where(sql`${schema.recipes.catalogSlug} is not null`)),
      count(
        db()
          .select({ n })
          .from(schema.recipes)
          .where(and(isNull(schema.recipes.catalogSlug), isNull(schema.recipes.imageUrl))),
      ),
      count(
        db()
          .select({ n })
          .from(schema.mealPlanEntries)
          .where(
            and(
              sql`${schema.mealPlanEntries.planDate} >= ${weekStart}::date`,
              sql`${schema.mealPlanEntries.planDate} < ${weekStart}::date + 7`,
            ),
          ),
      ),
      count(db().select({ n }).from(schema.socialReports).where(isNull(schema.socialReports.resolvedAt))),
      // Même règle que `grantsPremium` (lib/premium.ts) : payé jusqu'à l'échéance.
      count(
        db()
          .select({ n: sql<number>`count(distinct ${schema.storeSubscriptions.userId})::int` })
          .from(schema.storeSubscriptions)
          .where(
            sql`${schema.storeSubscriptions.state} in ('active', 'in_grace_period', 'canceled')
              and ${schema.storeSubscriptions.expiresAt} > now()`,
          ),
      ),
      count(
        db()
          .select({ n: sql<number>`count(distinct ${schema.storePurchases.userId})::int` })
          .from(schema.storePurchases)
          .where(
            and(
              eq(schema.storePurchases.productId, KITCHEN_PLUS_PRODUCT),
              eq(schema.storePurchases.state, 'purchased'),
            ),
          ),
      ),
      count(db().select({ n }).from(schema.moderationCases).where(openCase)),
      count(db().select({ n }).from(schema.moderationCases).where(and(openCase, sql`${schema.moderationCases.priority} <= 1`))),
    ]);

  return {
    accounts: { total, new7, new30 },
    active: { today: today1, d7, d30 },
    recipes: { total: recipes, fromCatalog, own: recipes - fromCatalog, ownWithoutPhoto },
    plannedThisWeek: planned,
    openReports: reports,
    openCases: cases,
    urgentCases: urgent,
    subscriptions: { active: subs, kitchenPlus: kitchen },
  };
}

export interface UsagePoint {
  day: string;
  event: string;
  /** Comptes distincts ce jour-là. */
  users: number;
  /** Nombre total d'événements. */
  total: number;
}

/** Les compteurs d'usage des `days` derniers jours, tous comptes confondus. */
export async function adminUsage(today: string, days: number): Promise<UsagePoint[]> {
  const rows = await db()
    .select({
      day: sql<string>`${schema.usageDays.day}::text`,
      event: schema.usageDays.event,
      users: sql<number>`count(distinct ${schema.usageDays.userId})::int`,
      total: sql<number>`sum(${schema.usageDays.count})::int`,
    })
    .from(schema.usageDays)
    .where(sql`${schema.usageDays.day} > ${today}::date - ${days}::int`)
    .groupBy(schema.usageDays.day, schema.usageDays.event)
    .orderBy(asc(schema.usageDays.day), asc(schema.usageDays.event));
  return rows;
}

export interface AdminRecipe {
  id: number;
  name: string;
  servings: number;
  createdAt: string;
  imageUrl: string | null;
  /** Le repas choisi pour la recette, `null` sinon : il oriente le prompt photo. */
  meal: string | null;
  ingredients: string[];
}

/**
 * Les recettes écrites ou importées (pas celles du catalogue, qui ont la photo
 * de leur plat), sans photo d'abord. Rien ne dit à qui elles sont.
 */
export async function adminOwnRecipes(): Promise<AdminRecipe[]> {
  const rows = await db()
    .select({
      id: schema.recipes.id,
      name: schema.recipes.name,
      servings: schema.recipes.servings,
      createdAt: sql<string>`${schema.recipes.createdAt}::text`,
      imageUrl: schema.recipes.imageUrl,
      meal: schema.recipes.meal,
      // Noms qualifiés à la main : dans une sous-requête, drizzle écrit les
      // colonnes sans leur table, et « id » y désignerait celui de l'ingrédient.
      ingredients: sql<string[]>`coalesce(
        (select array_agg(ri.label order by ri.position)
           from recipe_ingredients ri
          where ri.recipe_id = "recipes"."id"),
        '{}')`,
    })
    .from(schema.recipes)
    .where(isNull(schema.recipes.catalogSlug))
    .orderBy(sql`${schema.recipes.imageUrl} is not null`, desc(schema.recipes.createdAt));
  return rows.map((row) => ({ ...row, servings: Number(row.servings) }));
}

/** Pose la photo d'une recette ; rend l'ancienne (à effacer), `undefined` si la recette n'existe pas. */
export async function setRecipePhoto(id: number, url: string | null): Promise<string | null | undefined> {
  const [before] = await db()
    .select({ imageUrl: schema.recipes.imageUrl })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1);
  if (!before) {
    return undefined;
  }
  await db().update(schema.recipes).set({ imageUrl: url }).where(eq(schema.recipes.id, id));
  return before.imageUrl;
}

export interface AdminCatalogMeal {
  slug: string;
  goal: string;
  slot: string;
  position: number;
  name: string;
  imageUrl: string | null;
  estimateKcal: number;
  /** Les ingrédients tels que le plat les nomme, pour le prompt photo. */
  ingredients: string[];
}

export async function adminCatalog(): Promise<AdminCatalogMeal[]> {
  const rows = await db()
    .select({
      slug: schema.catalogMeals.slug,
      goal: schema.catalogMeals.goal,
      slot: schema.catalogMeals.slot,
      position: schema.catalogMeals.position,
      name: schema.catalogMeals.name,
      imageUrl: schema.catalogMeals.imageUrl,
      estimateKcal: schema.catalogMeals.estimateKcal,
      ingredients: schema.catalogMeals.ingredients,
    })
    .from(schema.catalogMeals)
    .orderBy(asc(schema.catalogMeals.goal), asc(schema.catalogMeals.position), asc(schema.catalogMeals.slug));
  return rows.map((row) => ({ ...row, ingredients: row.ingredients.map((ingredient) => ingredient.label) }));
}

/** Pose la photo d'un plat ; rend l'ancienne, `undefined` si le plat n'existe pas. */
export async function setCatalogPhoto(slug: string, url: string): Promise<string | null | undefined> {
  const [before] = await db()
    .select({ imageUrl: schema.catalogMeals.imageUrl })
    .from(schema.catalogMeals)
    .where(eq(schema.catalogMeals.slug, slug))
    .limit(1);
  if (!before) {
    return undefined;
  }
  await db().update(schema.catalogMeals).set({ imageUrl: url }).where(eq(schema.catalogMeals.slug, slug));
  return before.imageUrl;
}

// Modération : la file, les dossiers, les indicateurs, et les écritures des
// décisions humaines. Les décisions elles-mêmes (qui a le droit, dans quel
// ordre, quel audit) sont dans `server/moderation/decisions.ts`.

const OPEN_CASE = sql.raw(`('open', 'triaged', 'under_review', 'appealed')`);

export interface AdminCaseSummary {
  id: number;
  targetKind: string;
  targetId: number;
  category: string | null;
  severity: string | null;
  level: string;
  riskScore: number;
  priority: number;
  status: string;
  flags: string[];
  recommendedAction: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  subject: { id: number; handle: string | null; displayName: string | null };
  reports: number;
  /**
   * La version du dossier (son `updated_at`, à la microseconde) : une
   * décision la renvoie, et elle est refusée si le dossier a bougé depuis.
   */
  version: string;
}

type CaseRow = {
  id: number;
  target_kind: string;
  target_id: number;
  category: string | null;
  severity: string | null;
  level: string;
  risk_score: string;
  priority: number;
  status: string;
  flags: string[];
  recommended_action: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  subject_id: number;
  handle: string | null;
  display_name: string | null;
  reports: number;
  version: string;
};

function iso(value: string): string {
  return new Date(value).toISOString();
}

function toSummary(row: CaseRow): AdminCaseSummary {
  return {
    id: Number(row.id),
    targetKind: row.target_kind,
    targetId: Number(row.target_id),
    category: row.category,
    severity: row.severity,
    level: row.level,
    riskScore: Number(row.risk_score),
    priority: Number(row.priority),
    status: row.status,
    flags: row.flags,
    recommendedAction: row.recommended_action,
    assignedTo: row.assigned_to,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    resolvedAt: row.resolved_at === null ? null : iso(row.resolved_at),
    subject: { id: Number(row.subject_id), handle: row.handle, displayName: row.display_name },
    reports: Number(row.reports),
    version: row.version,
  };
}

const CASE_COLUMNS = sql`
  c.id::int as id, c.target_kind, c.target_id::int as target_id, c.category, c.severity, c.level,
  c.risk_score::text as risk_score, c.priority, c.status, c.flags, c.recommended_action, c.assigned_to,
  to_json(c.created_at) #>> '{}' as created_at, to_json(c.updated_at) #>> '{}' as updated_at,
  to_json(c.resolved_at) #>> '{}' as resolved_at, to_json(c.updated_at) #>> '{}' as version,
  u.id::int as subject_id, u.handle, u.display_name,
  (select count(*)::int from social_reports r where r.case_id = c.id) as reports`;

/** La file : les dossiers à traiter par priorité puis ancienneté, ou les 100 derniers clos. */
export async function moderationQueue(status: 'open' | 'closed'): Promise<AdminCaseSummary[]> {
  const rows = await db().execute<CaseRow>(sql`
    select ${CASE_COLUMNS}
    from moderation_cases c join users u on u.id = c.subject_user_id
    where ${status === 'open' ? sql`c.status in ${OPEN_CASE}` : sql`c.status not in ${OPEN_CASE}`}
    order by ${status === 'open' ? sql`c.priority asc, c.created_at asc` : sql`c.resolved_at desc nulls last`}
    limit 100`);
  return rows.rows.map(toSummary);
}

export interface AdminCaseDetail extends AdminCaseSummary {
  explanation: Record<string, unknown>;
  contentSnapshot: string | null;
  resolution: string | null;
  policyVersion: string;
  subjectSince: string;
  /** Ce que la cible montre aujourd'hui. */
  target: { label: string | null; hidden: boolean; visibility: string | null };
  signals: { source: string; category: string | null; severity: string | null; confidence: number; signals: string[]; createdAt: string }[];
  reportList: {
    id: number;
    reason: string;
    note: string | null;
    weight: number | null;
    status: string | null;
    createdAt: string;
    reporterId: number;
    reporterHandle: string | null;
    reporterAgeDays: number;
  }[];
  sanctions: {
    id: number;
    caseId: number | null;
    kind: string;
    action: string;
    category: string | null;
    strikeWeight: number;
    startsAt: string;
    endsAt: string | null;
    liftedAt: string | null;
    liftedBy: string | null;
    voided: boolean;
    decidedBy: string;
    active: boolean;
  }[];
  audit: { id: number; at: string; actor: string; event: string; details: Record<string, unknown> }[];
}

/** Un dossier entier : ce qui est en cause, d'où vient la décision, ce qui a suivi. */
export async function moderationCase(id: number): Promise<AdminCaseDetail | null> {
  const found = await db().execute<
    CaseRow & { explanation: Record<string, unknown>; content_snapshot: string | null; resolution: string | null; policy_version: string; subject_since: string }
  >(sql`
    select ${CASE_COLUMNS}, c.explanation, c.content_snapshot, c.resolution, c.policy_version,
           to_json(u.created_at) #>> '{}' as subject_since
    from moderation_cases c join users u on u.id = c.subject_user_id
    where c.id = ${id}`);
  const row = found.rows[0];
  if (row === undefined) {
    return null;
  }
  const summary = toSummary(row);

  const target = await db().execute<{ label: string | null; hidden: boolean; visibility: string | null }>(
    summary.targetKind === 'template_name'
      ? sql`select name as label, name_hidden_at is not null as hidden, null as visibility from workout_templates where id = ${summary.targetId}`
      : summary.targetKind === 'exercise_name'
        ? sql`select name as label, hidden_at is not null as hidden, null as visibility from exercises where id = ${summary.targetId}`
        : summary.targetKind === 'session'
          ? sql`select t.name as label, t.name_hidden_at is not null as hidden, s.visibility
                from workout_sessions s left join workout_templates t on t.id = s.template_id where s.id = ${summary.targetId}`
          : sql`select coalesce(display_name, '') || ' @' || coalesce(handle, '?') as label, false as hidden, null as visibility
                from users where id = ${summary.targetId}`,
  );

  const [signals, reports, sanctions, audit] = await Promise.all([
    db().execute<{ source: string; category: string | null; severity: string | null; confidence: string; signals: string[]; created_at: string }>(sql`
      select source, category, severity, confidence::text as confidence, signals, to_json(created_at) #>> '{}' as created_at
      from moderation_signals where case_id = ${id} order by id`),
    db().execute<{
      id: number;
      reason: string;
      note: string | null;
      weight: string | null;
      status: string | null;
      created_at: string;
      reporter_id: number;
      reporter_handle: string | null;
      reporter_since: string;
    }>(sql`
      select r.id::int as id, r.reason, r.note, r.weight::text as weight, r.status, to_json(r.created_at) #>> '{}' as created_at,
             u.id::int as reporter_id, u.handle as reporter_handle, to_json(u.created_at) #>> '{}' as reporter_since
      from social_reports r join users u on u.id = r.reporter_id
      where r.case_id = ${id} order by r.created_at`),
    db().execute<{
      id: number;
      case_id: number | null;
      kind: string;
      action: string;
      category: string | null;
      strike_weight: string;
      starts_at: string;
      ends_at: string | null;
      lifted_at: string | null;
      lifted_by: string | null;
      voided: boolean;
      decided_by: string;
      active: boolean;
    }>(sql`
      select id::int as id, case_id::int as case_id, kind, action, category, strike_weight::text as strike_weight,
             to_json(starts_at) #>> '{}' as starts_at, to_json(ends_at) #>> '{}' as ends_at,
             to_json(lifted_at) #>> '{}' as lifted_at, lifted_by, voided, decided_by,
             (kind in ('restriction', 'suspension', 'ban') and lifted_at is null and starts_at <= now()
               and (ends_at is null or ends_at > now())) as active
      from moderation_sanctions where user_id = ${summary.subject.id} order by starts_at desc, id desc`),
    db().execute<{ id: number; at: string; actor: string; event: string; details: Record<string, unknown> }>(sql`
      select id::int as id, to_json(at) #>> '{}' as at, actor, event, details from moderation_audit where case_id = ${id} order by id`),
  ]);

  const now = Date.now();
  const targetRow = target.rows[0];
  return {
    ...summary,
    explanation: row.explanation,
    contentSnapshot: row.content_snapshot,
    resolution: row.resolution,
    policyVersion: row.policy_version,
    subjectSince: iso(row.subject_since),
    target: { label: targetRow?.label ?? null, hidden: targetRow?.hidden ?? false, visibility: targetRow?.visibility ?? null },
    signals: signals.rows.map((entry) => ({
      source: entry.source,
      category: entry.category,
      severity: entry.severity,
      confidence: Number(entry.confidence),
      signals: entry.signals,
      createdAt: iso(entry.created_at),
    })),
    reportList: reports.rows.map((entry) => ({
      id: Number(entry.id),
      reason: entry.reason,
      note: entry.note,
      weight: entry.weight === null ? null : Number(entry.weight),
      status: entry.status,
      createdAt: iso(entry.created_at),
      reporterId: Number(entry.reporter_id),
      reporterHandle: entry.reporter_handle,
      reporterAgeDays: Math.floor((now - new Date(entry.reporter_since).getTime()) / 86_400_000),
    })),
    sanctions: sanctions.rows.map((entry) => ({
      id: Number(entry.id),
      caseId: entry.case_id === null ? null : Number(entry.case_id),
      kind: entry.kind,
      action: entry.action,
      category: entry.category,
      strikeWeight: Number(entry.strike_weight),
      startsAt: iso(entry.starts_at),
      endsAt: entry.ends_at === null ? null : iso(entry.ends_at),
      liftedAt: entry.lifted_at === null ? null : iso(entry.lifted_at),
      liftedBy: entry.lifted_by,
      voided: entry.voided,
      decidedBy: entry.decided_by,
      active: entry.active,
    })),
    audit: audit.rows.map((entry) => ({
      id: Number(entry.id),
      at: iso(entry.at),
      actor: entry.actor,
      event: entry.event,
      details: entry.details,
    })),
  };
}

/** L'état d'un dossier, pour décider : sa cible, son auteur, son statut. */
export async function caseForDecision(
  id: number,
): Promise<{ id: number; subjectUserId: number; targetKind: string; targetId: number; status: string } | null> {
  const [row] = await db()
    .select({
      id: schema.moderationCases.id,
      subjectUserId: schema.moderationCases.subjectUserId,
      targetKind: schema.moderationCases.targetKind,
      targetId: schema.moderationCases.targetId,
      status: schema.moderationCases.status,
    })
    .from(schema.moderationCases)
    .where(eq(schema.moderationCases.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Change l'état d'un dossier, seulement s'il n'a pas bougé depuis que le
 * modérateur l'a lu (`version`) : deux décisions croisées, ou un double
 * clic, ne s'écrasent pas. Rend faux si le dossier a changé entre-temps.
 */
export async function updateCaseIfUnchanged(
  id: number,
  version: string,
  change: { status?: string; assignedTo?: string; resolution?: string | null; resolved?: boolean },
): Promise<boolean> {
  const rows = await db()
    .update(schema.moderationCases)
    .set({
      ...(change.status === undefined ? {} : { status: change.status }),
      ...(change.assignedTo === undefined ? {} : { assignedTo: change.assignedTo }),
      ...(change.resolution === undefined ? {} : { resolution: change.resolution }),
      ...(change.resolved ? { resolvedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.moderationCases.id, id), sql`${schema.moderationCases.updatedAt} = ${version}::timestamptz`))
    .returning({ id: schema.moderationCases.id });
  return rows.length > 0;
}

/** Clôt les signalements d'un dossier avec le verdict : `action_taken` ou `dismissed`. */
export async function closeCaseReports(caseId: number, status: 'action_taken' | 'dismissed'): Promise<number> {
  const rows = await db()
    .update(schema.socialReports)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(schema.socialReports.caseId, caseId), isNull(schema.socialReports.resolvedAt)))
    .returning({ id: schema.socialReports.id });
  return rows.length;
}

/**
 * Annule ce que l'automatique a posé pour un dossier classé sans suite :
 * ses strikes ne comptent plus, ses restrictions sont levées.
 */
export async function undoAutomaticSanctions(caseId: number, actor: string): Promise<{ voided: number; lifted: number }> {
  const voided = await db()
    .update(schema.moderationSanctions)
    .set({ voided: true })
    .where(and(eq(schema.moderationSanctions.caseId, caseId), sql`${schema.moderationSanctions.strikeWeight} > 0`, eq(schema.moderationSanctions.voided, false)))
    .returning({ id: schema.moderationSanctions.id });
  const lifted = await db()
    .update(schema.moderationSanctions)
    .set({ liftedAt: new Date(), liftedBy: actor, liftReason: 'Dossier classé sans suite' })
    .where(
      and(
        eq(schema.moderationSanctions.caseId, caseId),
        eq(schema.moderationSanctions.decidedBy, 'system'),
        isNull(schema.moderationSanctions.liftedAt),
        sql`${schema.moderationSanctions.kind} in ('warning', 'restriction', 'suspension', 'ban')`,
      ),
    )
    .returning({ id: schema.moderationSanctions.id });
  return { voided: voided.length, lifted: lifted.length };
}

/** Lève une sanction encore en place ; `voided` annule aussi son strike. Rend son compte, ou `null`. */
export async function liftSanction(
  id: number,
  actor: string,
  reason: string | null,
  voided: boolean,
): Promise<{ userId: number; caseId: number | null; kind: string } | null> {
  const [row] = await db()
    .update(schema.moderationSanctions)
    .set({ liftedAt: new Date(), liftedBy: actor, liftReason: reason, ...(voided ? { voided: true } : {}) })
    .where(and(eq(schema.moderationSanctions.id, id), isNull(schema.moderationSanctions.liftedAt)))
    .returning({
      userId: schema.moderationSanctions.userId,
      caseId: schema.moderationSanctions.caseId,
      kind: schema.moderationSanctions.kind,
    });
  return row ?? null;
}

/** Masque ou rend visible ce qu'un dossier vise. Rend faux si rien ne s'y prête. */
export async function setTargetHidden(targetKind: string, targetId: number, hidden: boolean): Promise<boolean> {
  const when = hidden ? new Date() : null;
  if (targetKind === 'template_name') {
    const rows = await db()
      .update(schema.workoutTemplates)
      .set({ nameHiddenAt: when, nameReviewedAt: new Date() })
      .where(eq(schema.workoutTemplates.id, targetId))
      .returning({ id: schema.workoutTemplates.id });
    return rows.length > 0;
  }
  if (targetKind === 'exercise_name') {
    const rows = await db()
      .update(schema.exercises)
      .set({ hiddenAt: when })
      .where(and(eq(schema.exercises.id, targetId), eq(schema.exercises.source, 'manual')))
      .returning({ id: schema.exercises.id });
    return rows.length > 0;
  }
  if (targetKind === 'session' && hidden) {
    // Une séance n'a pas de « masqué » : elle redevient privée, et seule son
    // auteur peut la repartager.
    const rows = await db()
      .update(schema.workoutSessions)
      .set({ visibility: 'private' })
      .where(eq(schema.workoutSessions.id, targetId))
      .returning({ id: schema.workoutSessions.id });
    return rows.length > 0;
  }
  return false;
}

/**
 * Remplace le pseudo et le nom affiché d'une personne par un identifiant
 * neutre, `membre_<numéro>`. La personne peut en choisir un autre ensuite,
 * qui passera par la modération.
 */
export async function resetIdentity(userId: number): Promise<string | null> {
  for (const handle of [`membre_${userId}`, `membre_${userId}_x`]) {
    try {
      const rows = await db()
        .update(schema.users)
        .set({ handle, displayName: null })
        .where(eq(schema.users.id, userId))
        .returning({ id: schema.users.id });
      return rows.length > 0 ? handle : null;
    } catch {
      // Déjà pris (un compte s'est appelé ainsi) : on essaie la variante.
    }
  }
  return null;
}

export interface ModerationMetrics {
  days: number;
  openByPriority: { priority: number; count: number }[];
  openedByCategory: { category: string; count: number }[];
  opened: number;
  autoActions: number;
  confirmed: number;
  dismissed: number;
  /** Dossiers où l'automatique avait agi, puis classés sans suite : les faux positifs connus. */
  autoReversed: number;
  meanResolutionHours: number | null;
  /** Part des dossiers ouverts en P0 ou P1. */
  urgentShare: number | null;
  reports: { created: number; actionTaken: number; dismissed: number; coordinated: number; rateLimited: number };
  sanctions: { kind: string; system: number; human: number }[];
  active: { restriction: number; suspension: number; ban: number };
}

/** Les indicateurs de la modération sur une fenêtre de `days` jours. */
export async function moderationMetrics(days: number): Promise<ModerationMetrics> {
  const since = sql`now() - make_interval(days => ${days})`;
  const [byPriority, byCategory, figures, sanctions, active] = await Promise.all([
    db().execute<{ priority: number; count: number }>(sql`
      select priority, count(*)::int as count from moderation_cases where status in ${OPEN_CASE} group by priority order by priority`),
    db().execute<{ category: string; count: number }>(sql`
      select coalesce(category, 'signalements seuls') as category, count(*)::int as count
      from moderation_cases where created_at >= ${since} group by 1 order by 2 desc`),
    db().execute<{
      opened: number;
      urgent: number;
      auto_actions: number;
      confirmed: number;
      dismissed: number;
      auto_reversed: number;
      mean_hours: number | null;
      reports: number;
      reports_action: number;
      reports_dismissed: number;
      coordinated: number;
      rate_limited: number;
    }>(sql`
      select
        (select count(*)::int from moderation_cases where created_at >= ${since}) as opened,
        (select count(*)::int from moderation_cases where created_at >= ${since} and priority <= 1) as urgent,
        (select count(distinct case_id)::int from moderation_audit
          where at >= ${since} and actor = 'system' and event in ('CONTENT_HIDDEN', 'CONTENT_REMOVED')) as auto_actions,
        (select count(*)::int from moderation_cases where resolved_at >= ${since} and status = 'resolved') as confirmed,
        (select count(*)::int from moderation_cases where resolved_at >= ${since} and status = 'dismissed') as dismissed,
        (select count(*)::int from moderation_cases c where c.resolved_at >= ${since} and c.status = 'dismissed'
          and exists (select 1 from moderation_audit a where a.case_id = c.id and a.actor = 'system'
                      and a.event in ('CONTENT_HIDDEN', 'CONTENT_REMOVED'))) as auto_reversed,
        (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric, 1)::float
          from moderation_cases where resolved_at >= ${since}) as mean_hours,
        (select count(*)::int from social_reports where created_at >= ${since}) as reports,
        (select count(*)::int from social_reports where created_at >= ${since} and status = 'action_taken') as reports_action,
        (select count(*)::int from social_reports where created_at >= ${since} and status = 'dismissed') as reports_dismissed,
        (select count(distinct case_id)::int from moderation_audit
          where at >= ${since} and event = 'COORDINATED_REPORTING_FLAGGED') as coordinated,
        (select count(*)::int from moderation_audit where at >= ${since} and event = 'REPORT_RATE_LIMITED') as rate_limited`),
    db().execute<{ kind: string; system: number; human: number }>(sql`
      select kind, count(*) filter (where decided_by = 'system')::int as system,
             count(*) filter (where decided_by <> 'system')::int as human
      from moderation_sanctions where created_at >= ${since} and kind <> 'strike' group by kind order by kind`),
    db().execute<{ kind: string; count: number }>(sql`
      select kind, count(distinct user_id)::int as count from moderation_sanctions
      where kind in ('restriction', 'suspension', 'ban') and lifted_at is null and starts_at <= now()
        and (ends_at is null or ends_at > now())
      group by kind`),
  ]);
  const figure = figures.rows[0];
  const activeCount = (kind: string) => active.rows.find((row) => row.kind === kind)?.count ?? 0;
  const opened = figure?.opened ?? 0;
  return {
    days,
    openByPriority: byPriority.rows.map((row) => ({ priority: Number(row.priority), count: row.count })),
    openedByCategory: byCategory.rows,
    opened,
    autoActions: figure?.auto_actions ?? 0,
    confirmed: figure?.confirmed ?? 0,
    dismissed: figure?.dismissed ?? 0,
    autoReversed: figure?.auto_reversed ?? 0,
    meanResolutionHours: figure?.mean_hours ?? null,
    urgentShare: opened === 0 ? null : Math.round(((figure?.urgent ?? 0) / opened) * 100) / 100,
    reports: {
      created: figure?.reports ?? 0,
      actionTaken: figure?.reports_action ?? 0,
      dismissed: figure?.reports_dismissed ?? 0,
      coordinated: figure?.coordinated ?? 0,
      rateLimited: figure?.rate_limited ?? 0,
    },
    sanctions: sanctions.rows,
    active: { restriction: activeCount('restriction'), suspension: activeCount('suspension'), ban: activeCount('ban') },
  };
}

// Passkeys du tableau de bord.

export function adminPasskeys() {
  return db().select().from(schema.adminPasskeys).orderBy(asc(schema.adminPasskeys.createdAt));
}

export async function insertAdminPasskey(passkey: {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  name: string;
}): Promise<boolean> {
  const rows = await db()
    .insert(schema.adminPasskeys)
    .values(passkey)
    .onConflictDoNothing()
    .returning({ id: schema.adminPasskeys.id });
  return rows.length > 0;
}

export async function touchAdminPasskey(id: string, counter: number): Promise<boolean> {
  const rows = await db()
    .update(schema.adminPasskeys)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(schema.adminPasskeys.id, id))
    .returning({ id: schema.adminPasskeys.id });
  return rows.length > 0;
}

export async function deleteAdminPasskey(id: string): Promise<boolean> {
  const rows = await db()
    .delete(schema.adminPasskeys)
    .where(eq(schema.adminPasskeys.id, id))
    .returning({ id: schema.adminPasskeys.id });
  return rows.length > 0;
}
