/**
 * Appels navigateur vers les routes du partage.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

import type { FeedSession, FollowState, PublicPerson, SessionVisibility } from '../social';

export type SocialOutcome = { kind: 'ok' } | { kind: 'error'; message: string | null };

async function send(url: string, method: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function outcomeOf(response: Response | null): Promise<SocialOutcome> {
  if (response === null) {
    return { kind: 'error', message: null };
  }
  if (response.ok) {
    return { kind: 'ok' };
  }
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return { kind: 'error', message: body.error?.message ?? null };
  } catch {
    return { kind: 'error', message: null };
  }
}

export type SaveIdentityOutcome =
  | { kind: 'saved' }
  | { kind: 'taken' }
  | { kind: 'error'; message: string | null };

/**
 * Le message d'erreur vient du serveur quand il en donne un : un nom refusé
 * par la modération dit pourquoi, ce qu'un message figé ici ne saurait pas.
 */
export async function saveIdentity(
  handle: string,
  displayName: string | null,
): Promise<SaveIdentityOutcome> {
  const response = await send('/api/social/identity', 'PUT', { handle, displayName });
  if (response === null) {
    return { kind: 'error', message: null };
  }
  if (response.status === 409) {
    return { kind: 'taken' };
  }
  if (response.ok) {
    return { kind: 'saved' };
  }
  const outcome = await outcomeOf(response);
  return { kind: 'error', message: outcome.kind === 'error' ? outcome.message : null };
}

export async function searchPeople(
  query: string,
  signal: AbortSignal,
): Promise<(PublicPerson & { state: FollowState })[] | null> {
  try {
    const response = await fetch(`/api/social/people?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { people: (PublicPerson & { state: FollowState })[] };
    return body.people;
  } catch {
    return null;
  }
}

export type RelationAction = 'follow' | 'unfollow' | 'accept' | 'decline' | 'remove';

export async function changeRelation(
  action: RelationAction,
  userId: number,
): Promise<SocialOutcome> {
  return outcomeOf(await send('/api/social/relations', 'POST', { action, userId }));
}

export async function setKudos(sessionId: number, given: boolean): Promise<SocialOutcome> {
  return outcomeOf(await send('/api/social/kudos', 'PUT', { sessionId, given }));
}

export async function loadFeed(
  before: number,
): Promise<{ sessions: FeedSession[]; next: number | null } | null> {
  try {
    const response = await fetch(`/api/social/feed?before=${before}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as { sessions: FeedSession[]; next: number | null };
  } catch {
    return null;
  }
}

export async function setSessionVisibility(
  sessionId: number,
  visibility: SessionVisibility,
): Promise<SocialOutcome> {
  return outcomeOf(
    await send(`/api/training/sessions/${sessionId}/visibility`, 'PATCH', { visibility }),
  );
}
