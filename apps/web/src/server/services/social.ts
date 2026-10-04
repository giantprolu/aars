import 'server-only';
import { sessionVolume } from '@/lib/workout';
import { env } from '../env';
import { sendMail } from '../clients/mail';
import {
  REPORT_REASON_LABELS,
  cleanDisplayName,
  cleanReportNote,
  isValidHandle,
  normalizeHandle,
  type FeedSession,
  type FollowState,
  type PublicPerson,
  type ReportReason,
  type SessionVisibility,
  type SharedExercise,
  type WeekBoardRow,
} from '@/lib/social';
import {
  answerFollowRequest,
  countIncomingRequests,
  deleteBlock,
  deleteFollow,
  deleteFollower,
  findIdentity,
  insertBlock,
  insertFollowRequest,
  insertReport,
  kudosFor,
  listBlocked,
  listFeed,
  listFollowers,
  listFollowing,
  listIncomingRequests,
  searchPeople,
  setKudos,
  setsForSessions,
  updateIdentity,
  updateSessionVisibility,
} from '../db/queries/social';

/**
 * Service du partage : ce qu'on montre de soi, qui on suit, et le fil.
 *
 * Le fil est composé ici plutôt qu'en base : la visibilité est tranchée par
 * la requête, et ce qui reste — additionner un volume, grouper des séries —
 * est de la mise en forme, qui n'a pas à alourdir le SQL.
 */

export const FEED_PAGE = 20;
export const SEARCH_LIMIT = 20;

export function identityFor(
  userId: number,
): Promise<{ handle: string | null; displayName: string | null }> {
  return findIdentity(userId);
}

export type SaveIdentityResult = { kind: 'saved' } | { kind: 'invalid' } | { kind: 'taken' };

/** Choisit son identifiant et son nom. */
export async function saveIdentity(
  userId: number,
  rawHandle: string,
  rawDisplayName: string | null,
): Promise<SaveIdentityResult> {
  const handle = normalizeHandle(rawHandle);
  if (!isValidHandle(handle)) {
    return { kind: 'invalid' };
  }
  const outcome = await updateIdentity(userId, handle, cleanDisplayName(rawDisplayName));
  return outcome === 'saved' ? { kind: 'saved' } : { kind: 'taken' };
}

export async function findPeople(
  viewerId: number,
  rawQuery: string,
): Promise<(PublicPerson & { state: FollowState })[]> {
  const query = normalizeHandle(rawQuery);
  if (query.length < 2) {
    return [];
  }
  return searchPeople(viewerId, query, SEARCH_LIMIT);
}

export type FollowResult = 'requested' | 'no_identity' | 'unavailable';

/**
 * Demande à suivre. Refusé tant que le demandeur ne s'est pas présenté : une
 * demande venue d'un compte sans nom ne dirait pas qui la fait. Un compte
 * absent et un blocage répondent pareil : `unavailable`, sans plus de détail.
 */
export async function follow(viewerId: number, followeeId: number): Promise<FollowResult> {
  const me = await findIdentity(viewerId);
  if (me.handle === null) {
    return 'no_identity';
  }
  return (await insertFollowRequest(viewerId, followeeId)) ? 'requested' : 'unavailable';
}

/** Bloque un compte : voir `user_blocks` dans le schéma pour ce que cela coupe. */
export function block(viewerId: number, blockedId: number): Promise<boolean> {
  return insertBlock(viewerId, blockedId);
}

export function unblock(viewerId: number, blockedId: number): Promise<void> {
  return deleteBlock(viewerId, blockedId);
}

export function blockedBy(viewerId: number): Promise<PublicPerson[]> {
  return listBlocked(viewerId);
}

/**
 * Signale une personne, ou une de ses séances, à l'équipe qui modère.
 *
 * Le signalement est d'abord écrit en base, la seule trace qui compte ; le
 * courriel à l'adresse de contact n'est qu'une alerte, envoyée si le service
 * d'envoi est configuré, et son échec n'annule rien. Il ne contient que des
 * identifiants publics, jamais une adresse.
 */
export async function report(
  viewerId: number,
  input: { userId: number; sessionId: number | null; reason: ReportReason; note: string | null },
): Promise<boolean> {
  const context = await insertReport(viewerId, {
    reportedUserId: input.userId,
    sessionId: input.sessionId,
    reason: input.reason,
    note: cleanReportNote(input.note),
  });
  if (context === null) {
    return false;
  }
  const contact = env.legalContactEmail;
  if (contact !== undefined) {
    const name = (who: { id: number; handle: string | null }) => `@${who.handle ?? '?'} (compte ${who.id})`;
    await sendMail({
      to: contact,
      subject: `Signalement n° ${context.id} : ${name(context.reported)}`,
      text: [
        `Signalé : ${name(context.reported)}`,
        `Par : ${name(context.reporter)}`,
        `Motif : ${REPORT_REASON_LABELS[input.reason]}`,
        context.session === null
          ? 'Sur : la personne'
          : `Sur : la séance « ${context.session.name ?? 'Séance'} » (n° ${context.session.id})`,
        `Note : ${cleanReportNote(input.note) ?? '—'}`,
        '',
        'À traiter sous 24 h : npm run moderation -- list',
      ].join('\n'),
    });
  }
  return true;
}

export function unfollow(viewerId: number, followeeId: number): Promise<void> {
  return deleteFollow(viewerId, followeeId);
}

export function answerRequest(
  viewerId: number,
  followerId: number,
  accept: boolean,
): Promise<boolean> {
  return answerFollowRequest(viewerId, followerId, accept);
}

export function removeFollower(viewerId: number, followerId: number): Promise<void> {
  return deleteFollower(viewerId, followerId);
}

export async function relationsFor(viewerId: number): Promise<{
  requests: PublicPerson[];
  following: (PublicPerson & { state: FollowState })[];
  followers: PublicPerson[];
}> {
  const [requests, following, followers] = await Promise.all([
    listIncomingRequests(viewerId),
    listFollowing(viewerId),
    listFollowers(viewerId),
  ]);
  return { requests, following, followers };
}

export function pendingRequestCount(viewerId: number): Promise<number> {
  return countIncomingRequests(viewerId);
}

export function shareSession(
  userId: number,
  sessionId: number,
  visibility: SessionVisibility,
): Promise<boolean> {
  return updateSessionVisibility(userId, sessionId, visibility);
}

export function giveKudos(viewerId: number, sessionId: number, given: boolean): Promise<boolean> {
  return setKudos(viewerId, sessionId, given);
}

/**
 * Le fil : mes séances partagées et celles de ceux que je suis.
 *
 * Le détail d'une séance n'est descendu que si elle est partagée en détail.
 * Ses séries sont lues pour toutes, parce que le volume et le nombre de
 * séries du résumé en dépendent, mais seuls leurs totaux sortent d'ici pour
 * une séance partagée en résumé.
 */
export async function feedFor(
  viewerId: number,
  before: number | null,
): Promise<{ sessions: FeedSession[]; next: number | null }> {
  const rows = await listFeed(viewerId, FEED_PAGE, before);
  const ids = rows.map((row) => row.id);
  const [sets, kudos] = await Promise.all([setsForSessions(ids), kudosFor(viewerId, ids)]);

  const sessions = rows.map((row): FeedSession => {
    const mine = sets.filter((set) => set.sessionId === row.id);
    const exercises: SharedExercise[] = [];
    if (row.visibility === 'detailed') {
      const byPosition = new Map<number, SharedExercise>();
      for (const set of mine) {
        const entry = byPosition.get(set.position) ?? { name: set.exerciseName, sets: [] };
        entry.sets.push({ weightKg: set.weightKg, reps: set.reps, seconds: set.seconds });
        byPosition.set(set.position, entry);
      }
      exercises.push(...byPosition.values());
    }
    return {
      id: row.id,
      author: row.author,
      name: row.name ?? 'Séance',
      sessionDate: row.sessionDate,
      startedAt: row.startedAt.toISOString(),
      durationSeconds:
        row.finishedAt === null
          ? null
          : Math.round((row.finishedAt.getTime() - row.startedAt.getTime()) / 1000),
      volumeKg: sessionVolume(mine),
      setCount: mine.length,
      visibility: row.visibility === 'detailed' ? 'detailed' : 'summary',
      exercises,
      kudos: kudos.counts.get(row.id) ?? 0,
      kudoedByMe: kudos.mine.has(row.id),
      mine: row.mine,
    };
  });

  return {
    sessions,
    next: rows.length === FEED_PAGE ? (rows[rows.length - 1]?.id ?? null) : null,
  };
}

/** Séances du fil relues pour compter la semaine : largement plus qu'un groupe d'amis n'en fait. */
const BOARD_WINDOW = 200;

/**
 * Le classement de la semaine : les séances terminées depuis lundi, par
 * personne suivie, et les miennes.
 *
 * Chez les autres, seules comptent les séances qu'ils ont partagées : une
 * séance restée privée ne doit pas se deviner à un chiffre qui bouge. Les
 * miennes comptent toutes, puisque c'est moi qui regarde.
 */
export async function weekBoard(
  viewerId: number,
  weekStart: string,
  me: PublicPerson,
  myFinishedThisWeek: number,
): Promise<WeekBoardRow[]> {
  const [rows, following] = await Promise.all([
    listFeed(viewerId, BOARD_WINDOW, null),
    listFollowing(viewerId),
  ]);
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (!row.mine && row.finishedAt !== null && row.sessionDate >= weekStart) {
      counts.set(row.author.id, (counts.get(row.author.id) ?? 0) + 1);
    }
  }
  const board: WeekBoardRow[] = following
    .filter((person) => person.state === 'following')
    .map((person) => ({
      person: { id: person.id, handle: person.handle, displayName: person.displayName },
      sessions: counts.get(person.id) ?? 0,
      mine: false,
    }));
  board.push({ person: me, sessions: myFinishedThisWeek, mine: true });
  return board.sort((a, b) => b.sessions - a.sessions);
}
