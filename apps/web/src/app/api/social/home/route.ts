import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { feedFor, identityFor, relationsFor, weekBoard } from '@/server/services/social';
import { sessionHistory } from '@/server/services/workouts';
import { shiftDate, startOfWeek, todayInParis } from '@/lib/date';

export const runtime = 'nodejs';

/**
 * L'en-tête de Communauté pour les apps natives : suivis, demandes en
 * attente, classement de la semaine. Mêmes lectures et mêmes règles que
 * `app/training/community/page.tsx`. Le fil se lit à part, par
 * `GET /api/social/feed`, qui se pagine.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const today = todayInParis();
  const weekStart = startOfWeek(today);
  const [identity, relations, feed, history] = await Promise.all([
    identityFor(userId),
    relationsFor(userId),
    feedFor(userId, null),
    sessionHistory(userId, 14),
  ]);

  const following = relations.following.filter((person) => person.state === 'following');
  const myWeek = history.filter(
    (session) => session.finishedAt !== null && session.sessionDate >= weekStart,
  ).length;
  const me = { id: userId, handle: identity.handle ?? 'moi', displayName: identity.displayName };
  const board = following.length === 0 ? [] : await weekBoard(userId, weekStart, me, myWeek);

  // Un anneau autour de ceux qui ont partagé une séance ces deux derniers jours.
  const recent = new Set(
    feed.sessions
      .filter((session) => !session.mine && session.sessionDate >= shiftDate(today, -1))
      .map((session) => session.author.id),
  );

  return Response.json({
    identity: { handle: identity.handle, displayName: identity.displayName },
    following: following.map((person) => ({
      id: person.id,
      handle: person.handle,
      displayName: person.displayName,
      recent: recent.has(person.id),
    })),
    pendingRequests: relations.requests.length,
    board: board.map((row) => ({
      id: row.person.id,
      handle: row.person.handle,
      displayName: row.person.displayName,
      sessions: row.sessions,
      mine: row.mine,
    })),
  });
}
