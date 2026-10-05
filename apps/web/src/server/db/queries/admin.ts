import 'server-only';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { KITCHEN_PLUS_PRODUCT } from '@/lib/premium';
import { db, schema } from '../client';
import { insertAudit } from './moderation';

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

  const [total, new7, new30, today1, d7, d30, recipes, fromCatalog, ownWithoutPhoto, planned, reports, subs, kitchen] =
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
    ]);

  return {
    accounts: { total, new7, new30 },
    active: { today: today1, d7, d30 },
    recipes: { total: recipes, fromCatalog, own: recipes - fromCatalog, ownWithoutPhoto },
    plannedThisWeek: planned,
    openReports: reports,
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

export interface AdminReport {
  id: number;
  reason: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reportedId: number;
  reportedHandle: string | null;
  reporterHandle: string | null;
  sessionId: number | null;
  sessionName: string | null;
  sessionVisibility: string | null;
  openOnPerson: number;
}

/** Les signalements ouverts (les plus anciens d'abord), ou les 100 derniers clos. */
export async function adminReports(status: 'open' | 'resolved'): Promise<AdminReport[]> {
  const rows = await db().execute<{
    id: number;
    reason: string;
    note: string | null;
    created_at: string;
    resolved_at: string | null;
    reported_id: number;
    reported_handle: string | null;
    reporter_handle: string | null;
    session_id: number | null;
    session_name: string | null;
    session_visibility: string | null;
    open_on_person: number;
  }>(sql`
    select r.id::int as id, r.reason, r.note, r.created_at::text as created_at, r.resolved_at::text as resolved_at,
           reported.id::int as reported_id, reported.handle as reported_handle,
           reporter.handle as reporter_handle,
           r.session_id::int as session_id, t.name as session_name, s.visibility as session_visibility,
           (select count(*)::int from social_reports o
             where o.reported_user_id = r.reported_user_id and o.resolved_at is null) as open_on_person
    from social_reports r
    join users reported on reported.id = r.reported_user_id
    join users reporter on reporter.id = r.reporter_id
    left join workout_sessions s on s.id = r.session_id
    left join workout_templates t on t.id = s.template_id
    where ${status === 'open' ? sql`r.resolved_at is null` : sql`r.resolved_at is not null`}
    order by ${status === 'open' ? sql`r.created_at asc` : sql`r.resolved_at desc`}
    limit 100`);
  return rows.rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    reportedId: row.reported_id,
    reportedHandle: row.reported_handle,
    reporterHandle: row.reporter_handle,
    sessionId: row.session_id,
    sessionName: row.session_name,
    sessionVisibility: row.session_visibility,
    openOnPerson: row.open_on_person,
  }));
}

/**
 * Clôt un signalement. Le geste est tracé dans l'audit de la modération,
 * au nom du tableau de bord (son identité précise viendra avec les écrans
 * de modération).
 */
export async function resolveReport(id: number): Promise<boolean> {
  const rows = await db()
    .update(schema.socialReports)
    .set({ resolvedAt: new Date(), status: 'resolved' })
    .where(and(eq(schema.socialReports.id, id), isNull(schema.socialReports.resolvedAt)))
    .returning({ id: schema.socialReports.id, caseId: schema.socialReports.caseId, userId: schema.socialReports.reportedUserId });
  const [row] = rows;
  if (row) {
    await insertAudit([
      { actor: 'admin', event: 'REPORT_RESOLVED', caseId: row.caseId, userId: row.userId, details: { reportId: id } },
    ]);
  }
  return rows.length > 0;
}

/** Rend privée la séance d'un signalement : plus personne d'autre ne la voit. */
export async function hideReportedSession(reportId: number): Promise<boolean> {
  const [report] = await db()
    .select({ sessionId: schema.socialReports.sessionId, caseId: schema.socialReports.caseId })
    .from(schema.socialReports)
    .where(eq(schema.socialReports.id, reportId))
    .limit(1);
  if (!report || report.sessionId === null) {
    return false;
  }
  const rows = await db()
    .update(schema.workoutSessions)
    .set({ visibility: 'private' })
    .where(eq(schema.workoutSessions.id, report.sessionId))
    .returning({ id: schema.workoutSessions.id, userId: schema.workoutSessions.userId });
  const [row] = rows;
  if (row) {
    await insertAudit([
      {
        actor: 'admin',
        event: 'CONTENT_HIDDEN',
        caseId: report.caseId,
        userId: row.userId,
        details: { targetKind: 'session', targetId: row.id, reportId },
      },
    ]);
  }
  return rows.length > 0;
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
