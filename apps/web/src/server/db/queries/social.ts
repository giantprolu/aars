import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import type { FollowState, PublicPerson, SessionVisibility } from '@/lib/social';

/**
 * Accès au partage des séances.
 *
 * Chaque fonction reçoit en premier argument le compte qui regarde, et c'est
 * lui qui borne la lecture : on ne lit la séance d'un autre qu'à travers une
 * relation acceptée, vérifiée dans la même requête. L'adresse d'un compte
 * n'est jamais sélectionnée ici — elle n'a rien à faire hors de ce compte.
 */

const person = {
  id: schema.users.id,
  handle: schema.users.handle,
  displayName: schema.users.displayName,
};

function toPerson(row: { id: number; handle: string | null; displayName: string | null }): PublicPerson | null {
  return row.handle === null ? null : { id: row.id, handle: row.handle, displayName: row.displayName };
}

function people(
  rows: readonly { id: number; handle: string | null; displayName: string | null }[],
): PublicPerson[] {
  return rows.map(toPerson).filter((value): value is PublicPerson => value !== null);
}

/** Mon identité publique, telle que je l'ai choisie, ou `null`. */
export async function findIdentity(
  userId: number,
): Promise<{ handle: string | null; displayName: string | null }> {
  const [row] = await db()
    .select({ handle: schema.users.handle, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row ?? { handle: null, displayName: null };
}

/**
 * Pose mon identifiant et mon nom. L'unicité est tranchée par la base : une
 * lecture préalable laisserait passer deux inscriptions simultanées.
 */
export async function updateIdentity(
  userId: number,
  handle: string,
  displayName: string | null,
): Promise<'saved' | 'taken'> {
  try {
    await db()
      .update(schema.users)
      .set({ handle, displayName })
      .where(eq(schema.users.id, userId));
    return 'saved';
  } catch (error) {
    // 23505 : violation d'unicité. Toute autre erreur remonte telle quelle.
    if (isUniqueViolation(error)) {
      return 'taken';
    }
    throw error;
  }
}

/** L'erreur Postgres d'unicité, nue ou enveloppée par Drizzle dans `cause`. */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; typeof current === 'object' && current !== null; ) {
    if ('code' in current && current.code === '23505') {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

/** Mes relations avec ces comptes, vues de mon côté. */
async function followStates(
  viewerId: number,
  otherIds: readonly number[],
): Promise<Map<number, FollowState>> {
  const states = new Map<number, FollowState>();
  if (otherIds.length === 0) {
    return states;
  }
  const rows = await db()
    .select({ followeeId: schema.follows.followeeId, status: schema.follows.status })
    .from(schema.follows)
    .where(
      and(
        eq(schema.follows.followerId, viewerId),
        inArray(schema.follows.followeeId, [...otherIds]),
      ),
    );
  for (const row of rows) {
    states.set(row.followeeId, row.status === 'accepted' ? 'following' : 'requested');
  }
  return states;
}

/**
 * Cherche des comptes par identifiant ou par nom.
 *
 * Seuls les comptes présentés — un identifiant choisi — sont trouvables : ne
 * pas en choisir, c'est rester invisible. Le compte qui cherche est exclu.
 */
export async function searchPeople(
  viewerId: number,
  query: string,
  limit: number,
): Promise<(PublicPerson & { state: FollowState })[]> {
  const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);
  const rows = await db()
    .select(person)
    .from(schema.users)
    .where(
      and(
        ne(schema.users.id, viewerId),
        isNotNull(schema.users.handle),
        or(
          ilike(schema.users.handle, `${escaped}%`),
          ilike(schema.users.displayName, `%${escaped}%`),
        ),
      ),
    )
    .orderBy(asc(schema.users.handle))
    .limit(limit);

  const found = people(rows);
  const states = await followStates(
    viewerId,
    found.map((entry) => entry.id),
  );
  return found.map((entry) => ({ ...entry, state: states.get(entry.id) ?? 'none' }));
}

/**
 * Demande à suivre un compte présenté. Rejouable : une demande déjà faite, ou
 * acceptée, n'est ni dédoublée ni ramenée en attente.
 */
export async function insertFollowRequest(viewerId: number, followeeId: number): Promise<boolean> {
  if (viewerId === followeeId) {
    return false;
  }
  const [target] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, followeeId), isNotNull(schema.users.handle)))
    .limit(1);
  if (!target) {
    return false;
  }
  await db()
    .insert(schema.follows)
    .values({ followerId: viewerId, followeeId })
    .onConflictDoNothing();
  return true;
}

/** Cesse de suivre, ou retire une demande restée sans réponse. */
export async function deleteFollow(viewerId: number, followeeId: number): Promise<void> {
  await db()
    .delete(schema.follows)
    .where(and(eq(schema.follows.followerId, viewerId), eq(schema.follows.followeeId, followeeId)));
}

/**
 * Répond à une demande qu'on m'a faite. Refuser supprime la demande : rien ne
 * dit au demandeur qu'elle a été refusée plutôt qu'ignorée.
 */
export async function answerFollowRequest(
  viewerId: number,
  followerId: number,
  accept: boolean,
): Promise<boolean> {
  const mine = and(
    eq(schema.follows.followeeId, viewerId),
    eq(schema.follows.followerId, followerId),
    eq(schema.follows.status, 'pending'),
  );
  const rows = accept
    ? await db()
        .update(schema.follows)
        .set({ status: 'accepted' })
        .where(mine)
        .returning({ id: schema.follows.followerId })
    : await db().delete(schema.follows).where(mine).returning({ id: schema.follows.followerId });
  return rows.length > 0;
}

/** Retire un abonné : il ne voit plus rien de mes séances. */
export async function deleteFollower(viewerId: number, followerId: number): Promise<void> {
  await db()
    .delete(schema.follows)
    .where(and(eq(schema.follows.followeeId, viewerId), eq(schema.follows.followerId, followerId)));
}

/** Les demandes qu'on m'a faites et auxquelles je n'ai pas répondu. */
export async function listIncomingRequests(viewerId: number): Promise<PublicPerson[]> {
  const rows = await db()
    .select(person)
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.users.id, schema.follows.followerId))
    .where(and(eq(schema.follows.followeeId, viewerId), eq(schema.follows.status, 'pending')))
    .orderBy(desc(schema.follows.createdAt));
  return people(rows);
}

/** Ceux que je suis, ou que j'ai demandé à suivre. */
export async function listFollowing(
  viewerId: number,
): Promise<(PublicPerson & { state: FollowState })[]> {
  const rows = await db()
    .select({ ...person, status: schema.follows.status })
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.users.id, schema.follows.followeeId))
    .where(eq(schema.follows.followerId, viewerId))
    .orderBy(asc(schema.users.handle));
  return rows.flatMap((row) => {
    const found = toPerson(row);
    return found === null
      ? []
      : [{ ...found, state: row.status === 'accepted' ? ('following' as const) : ('requested' as const) }];
  });
}

/** Ceux qui me suivent. */
export async function listFollowers(viewerId: number): Promise<PublicPerson[]> {
  const rows = await db()
    .select(person)
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.users.id, schema.follows.followerId))
    .where(and(eq(schema.follows.followeeId, viewerId), eq(schema.follows.status, 'accepted')))
    .orderBy(asc(schema.users.handle));
  return people(rows);
}

/** Règle ce que mes abonnés voient d'une de mes séances. */
export async function updateSessionVisibility(
  userId: number,
  sessionId: number,
  visibility: SessionVisibility,
): Promise<boolean> {
  const rows = await db()
    .update(schema.workoutSessions)
    .set({ visibility })
    .where(and(eq(schema.workoutSessions.userId, userId), eq(schema.workoutSessions.id, sessionId)))
    .returning({ id: schema.workoutSessions.id });
  return rows.length > 0;
}

/**
 * La condition qui rend une séance visible à ce compte : partagée, terminée,
 * et à moi ou à quelqu'un que je suis avec son accord.
 */
function visibleTo(viewerId: number) {
  return and(
    ne(schema.workoutSessions.visibility, 'private'),
    isNotNull(schema.workoutSessions.finishedAt),
    or(
      eq(schema.workoutSessions.userId, viewerId),
      sql`exists (
        select 1 from ${schema.follows}
        where ${schema.follows.followerId} = ${viewerId}
          and ${schema.follows.followeeId} = ${schema.workoutSessions.userId}
          and ${schema.follows.status} = 'accepted'
      )`,
    ),
  );
}

export interface FeedRow {
  id: number;
  author: PublicPerson;
  name: string | null;
  sessionDate: string;
  startedAt: Date;
  finishedAt: Date | null;
  visibility: SessionVisibility;
  mine: boolean;
}

/**
 * Les séances partagées que ce compte peut voir, les plus récentes d'abord.
 *
 * `before` pagine sur l'identifiant : une séance ajoutée pendant qu'on fait
 * défiler ne doit pas faire revoir la précédente en bas de page.
 */
export async function listFeed(
  viewerId: number,
  limit: number,
  before: number | null,
): Promise<FeedRow[]> {
  const rows = await db()
    .select({
      id: schema.workoutSessions.id,
      userId: schema.workoutSessions.userId,
      handle: schema.users.handle,
      displayName: schema.users.displayName,
      name: schema.workoutTemplates.name,
      sessionDate: schema.workoutSessions.sessionDate,
      startedAt: schema.workoutSessions.startedAt,
      finishedAt: schema.workoutSessions.finishedAt,
      visibility: schema.workoutSessions.visibility,
    })
    .from(schema.workoutSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.workoutSessions.userId))
    .leftJoin(
      schema.workoutTemplates,
      eq(schema.workoutTemplates.id, schema.workoutSessions.templateId),
    )
    .where(
      and(
        visibleTo(viewerId),
        before === null ? undefined : lt(schema.workoutSessions.id, before),
      ),
    )
    // Trié sur l'identifiant seul, celui sur lequel on pagine : trier sur la
    // date ferait sauter ou revoir une séance saisie après coup.
    .orderBy(desc(schema.workoutSessions.id))
    .limit(limit);

  return rows.flatMap((row) => {
    const mine = row.userId === viewerId;
    // Un compte sans identifiant n'a personne pour le suivre ; ses propres
    // séances figurent quand même dans son fil, sous un nom provisoire.
    const author: PublicPerson | null =
      row.handle === null
        ? mine
          ? { id: row.userId, handle: 'moi', displayName: 'Moi' }
          : null
        : { id: row.userId, handle: row.handle, displayName: row.displayName };
    if (author === null) {
      return [];
    }
    return [
      {
        id: row.id,
        author,
        name: row.name,
        sessionDate: String(row.sessionDate).slice(0, 10),
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        visibility: row.visibility === 'detailed' ? ('detailed' as const) : ('summary' as const),
        mine,
      },
    ];
  });
}

/** Les séries de séances déjà reconnues visibles, avec le nom de l'exercice. */
export async function setsForSessions(sessionIds: readonly number[]): Promise<
  {
    sessionId: number;
    position: number;
    setIndex: number;
    exerciseName: string;
    weightKg: number | null;
    reps: number | null;
    seconds: number | null;
  }[]
> {
  if (sessionIds.length === 0) {
    return [];
  }
  const rows = await db()
    .select({
      sessionId: schema.workoutSets.sessionId,
      position: schema.workoutSets.position,
      setIndex: schema.workoutSets.setIndex,
      exerciseName: schema.exercises.name,
      weightKg: schema.workoutSets.weightKg,
      reps: schema.workoutSets.reps,
      seconds: schema.workoutSets.seconds,
    })
    .from(schema.workoutSets)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutSets.exerciseId))
    .where(inArray(schema.workoutSets.sessionId, [...sessionIds]))
    .orderBy(
      asc(schema.workoutSets.sessionId),
      asc(schema.workoutSets.position),
      asc(schema.workoutSets.setIndex),
    );
  return rows.map((row) => ({
    ...row,
    weightKg: row.weightKg === null ? null : Number(row.weightKg),
  }));
}

/** Le nombre de bravos de chaque séance, et ceux que j'ai laissés. */
export async function kudosFor(
  viewerId: number,
  sessionIds: readonly number[],
): Promise<{ counts: Map<number, number>; mine: Set<number> }> {
  const counts = new Map<number, number>();
  const mine = new Set<number>();
  if (sessionIds.length === 0) {
    return { counts, mine };
  }
  const rows = await db()
    .select({ sessionId: schema.sessionKudos.sessionId, userId: schema.sessionKudos.userId })
    .from(schema.sessionKudos)
    .where(inArray(schema.sessionKudos.sessionId, [...sessionIds]));
  for (const row of rows) {
    counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
    if (row.userId === viewerId) {
      mine.add(row.sessionId);
    }
  }
  return { counts, mine };
}

/**
 * Laisse ou retire un bravo, sur une séance que ce compte peut voir. La
 * visibilité est vérifiée dans la requête : un identifiant de séance venu du
 * client ne dit rien de ce qu'on a le droit d'en faire.
 */
export async function setKudos(
  viewerId: number,
  sessionId: number,
  given: boolean,
): Promise<boolean> {
  const [visible] = await db()
    .select({ id: schema.workoutSessions.id })
    .from(schema.workoutSessions)
    .where(and(eq(schema.workoutSessions.id, sessionId), visibleTo(viewerId)))
    .limit(1);
  if (!visible) {
    return false;
  }
  if (given) {
    await db()
      .insert(schema.sessionKudos)
      .values({ sessionId, userId: viewerId })
      .onConflictDoNothing();
  } else {
    await db()
      .delete(schema.sessionKudos)
      .where(
        and(eq(schema.sessionKudos.sessionId, sessionId), eq(schema.sessionKudos.userId, viewerId)),
      );
  }
  return true;
}

/** Le nombre de demandes en attente, pour la pastille de l'accueil. */
export async function countIncomingRequests(viewerId: number): Promise<number> {
  const [row] = await db()
    .select({ count: sql<string>`count(*)` })
    .from(schema.follows)
    .where(and(eq(schema.follows.followeeId, viewerId), eq(schema.follows.status, 'pending')));
  return Number(row?.count ?? 0);
}
