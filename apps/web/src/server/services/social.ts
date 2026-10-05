import 'server-only';
import { sessionVolume } from '@/lib/workout';
import { env } from '../env';
import { sendMail } from '../clients/mail';
import { RATE_LIMITS } from '@/lib/moderation/config';
import { checkContent } from '../moderation/pipeline';
import { communityRefusal } from '../moderation/standing';
import { withinLimit } from '../moderation/rate-limit';
import { intakeReport, reportAllowed } from '../moderation/reports';
import { markTemplateName, templateOfSession } from '../db/queries/moderation';
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

export type SaveIdentityResult =
  | { kind: 'saved' }
  | { kind: 'invalid' }
  | { kind: 'taken' }
  | { kind: 'rejected'; message: string }
  | { kind: 'rate_limited' };

/**
 * Choisit son identifiant et son nom.
 *
 * Ils sont vus de tous les comptes, par la recherche : ils passent par la
 * modération avant d'être enregistrés, et un nom refusé n'est pas écrit. Un
 * compte restreint peut toujours changer de nom — c'est souvent ce qu'on
 * attend de lui.
 */
export async function saveIdentity(
  userId: number,
  rawHandle: string,
  rawDisplayName: string | null,
): Promise<SaveIdentityResult> {
  const handle = normalizeHandle(rawHandle);
  if (!isValidHandle(handle)) {
    return { kind: 'invalid' };
  }
  const displayName = cleanDisplayName(rawDisplayName);
  const current = await findIdentity(userId);
  if (current.handle === handle && current.displayName === displayName) {
    return { kind: 'saved' };
  }
  if (!(await withinLimit(`identity:u:${userId}`, RATE_LIMITS.identityPerUser))) {
    return { kind: 'rate_limited' };
  }
  const verdict = await checkContent({
    subjectUserId: userId,
    targetKind: 'user',
    targetId: userId,
    text: `${handle} ${displayName ?? ''}`.trim(),
    field: 'identity',
    preExposure: true,
    handle,
  });
  if (!verdict.allowed) {
    return { kind: 'rejected', message: verdict.message ?? 'Ce nom ne respecte pas les règles de la Communauté.' };
  }
  const outcome = await updateIdentity(userId, handle, displayName);
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

export type FollowResult =
  | { kind: 'requested' }
  | { kind: 'no_identity' }
  | { kind: 'unavailable' }
  | { kind: 'restricted'; message: string }
  | { kind: 'rate_limited' };

/**
 * Demande à suivre. Refusé tant que le demandeur ne s'est pas présenté : une
 * demande venue d'un compte sans nom ne dirait pas qui la fait. Un compte
 * absent, un blocage ou un compte écarté de la Communauté répondent pareil :
 * `unavailable`, sans plus de détail.
 *
 * Refuser une demande l'efface, ce qui permettrait de la renvoyer sans fin :
 * la limite par personne visée borne cette insistance.
 */
export async function follow(viewerId: number, followeeId: number): Promise<FollowResult> {
  const me = await findIdentity(viewerId);
  if (me.handle === null) {
    return { kind: 'no_identity' };
  }
  const refusal = await communityRefusal(viewerId);
  if (refusal !== null) {
    return { kind: 'restricted', message: refusal };
  }
  const [perUser, perTarget] = await Promise.all([
    withinLimit(`follow:u:${viewerId}`, RATE_LIMITS.followsPerUser),
    withinLimit(`follow:p:${viewerId}:${followeeId}`, RATE_LIMITS.followsPerTarget),
  ]);
  if (!perUser || !perTarget) {
    return { kind: 'rate_limited' };
  }
  return (await insertFollowRequest(viewerId, followeeId)) ? { kind: 'requested' } : { kind: 'unavailable' };
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
export type ReportResult = 'created' | 'not_found' | 'rate_limited';

/**
 * Signale une personne, ou une de ses séances, à l'équipe qui modère.
 *
 * Le signalement est d'abord écrit en base, la seule trace qui compte, puis
 * remis à la modération, qui le pèse et le range dans le dossier de sa cible
 * (`server/moderation/reports.ts`). Le courriel à l'adresse de contact n'est
 * qu'une alerte, envoyée si le service d'envoi est configuré, et son échec
 * n'annule rien. Il ne contient que des identifiants publics, jamais une
 * adresse.
 */
export async function report(
  viewerId: number,
  input: { userId: number; sessionId: number | null; reason: ReportReason; note: string | null },
): Promise<ReportResult> {
  if (viewerId === input.userId) {
    return 'not_found';
  }
  if (!(await reportAllowed(viewerId, input.userId))) {
    return 'rate_limited';
  }
  const note = cleanReportNote(input.note);
  const context = await insertReport(viewerId, {
    reportedUserId: input.userId,
    sessionId: input.sessionId,
    reason: input.reason,
    note,
  });
  if (context === null) {
    return 'not_found';
  }
  // Rejoué alors qu'il est encore ouvert : déjà pesé et rangé, rien à refaire.
  if (!context.fresh) {
    return 'created';
  }
  const intake = await intakeReport(
    context.id,
    viewerId,
    { userId: input.userId, sessionId: context.session === null ? null : context.session.id },
    note,
  );
  const contact = env.legalContactEmail;
  if (contact !== undefined) {
    const name = (who: { id: number; handle: string | null }) => `@${who.handle ?? '?'} (compte ${who.id})`;
    const urgent = intake.priority <= 1 ? '[URGENT] ' : '';
    await sendMail({
      to: contact,
      subject: `${urgent}Signalement n° ${context.id}, P${intake.priority} : ${name(context.reported)}`,
      text: [
        `Signalé : ${name(context.reported)}`,
        `Par : ${name(context.reporter)}`,
        `Motif : ${REPORT_REASON_LABELS[input.reason]}`,
        context.session === null
          ? 'Sur : la personne'
          : `Sur : la séance « ${context.session.name ?? 'Séance'} » (n° ${context.session.id})`,
        `Note : ${note ?? '—'}`,
        `Dossier : n° ${intake.caseId}, priorité P${intake.priority}${intake.coordinated ? ', vague de signalements coordonnée' : ''}`,
        '',
        'À traiter sous 24 h : npm run moderation -- cases',
      ].join('\n'),
    });
  }
  return 'created';
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

export type CommunityGesture = { kind: 'done' } | { kind: 'not_found' } | { kind: 'restricted'; message: string };

/**
 * Règle ce que mes abonnés voient d'une de mes séances.
 *
 * Rendre une séance privée est toujours possible. La partager demande d'être
 * en règle avec la Communauté, et c'est à ce moment que son nom, s'il a été
 * écrit à la main, passe par la modération : avant, personne ne le voyait.
 * Un nom refusé n'empêche pas le partage, il est remplacé par « Séance ».
 */
export async function shareSession(
  userId: number,
  sessionId: number,
  visibility: SessionVisibility,
): Promise<CommunityGesture> {
  if (visibility !== 'private') {
    const refusal = await communityRefusal(userId);
    if (refusal !== null) {
      return { kind: 'restricted', message: refusal };
    }
    const template = await templateOfSession(userId, sessionId);
    if (template !== null && template.kind !== 'program' && template.reviewedAt === null) {
      const verdict = await checkContent({
        subjectUserId: userId,
        targetKind: 'template_name',
        targetId: template.id,
        text: template.name,
        field: 'template_name',
        preExposure: true,
      });
      await markTemplateName(userId, template.id, !verdict.allowed);
    }
  }
  return (await updateSessionVisibility(userId, sessionId, visibility)) ? { kind: 'done' } : { kind: 'not_found' };
}

/** Un bravo se donne si l'on est en règle avec la Communauté ; il se retire toujours. */
export async function giveKudos(viewerId: number, sessionId: number, given: boolean): Promise<CommunityGesture> {
  if (given) {
    const refusal = await communityRefusal(viewerId);
    if (refusal !== null) {
      return { kind: 'restricted', message: refusal };
    }
  }
  return (await setKudos(viewerId, sessionId, given)) ? { kind: 'done' } : { kind: 'not_found' };
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
