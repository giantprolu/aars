import 'server-only';
import { standingMessage } from '@/lib/moderation/messages';
import { activeSanctions } from '../db/queries/moderation';

/**
 * Où en est un compte dans la Communauté.
 *
 * Une sanction ne ferme que la Communauté : le journal, les pesées, les
 * séances et l'export restent ouverts. Elle se lit en base au moment du
 * geste, puisque la session, signée et sans état, ne peut pas la porter —
 * et qu'on ne déconnecte personne (règles de mise en production).
 */
export type CommunityStanding =
  | { kind: 'good' }
  | { kind: 'restricted' | 'suspended' | 'banned'; until: Date | null };

const STRENGTH = { restriction: 1, suspension: 2, ban: 3 } as const;
const STANDING = { restriction: 'restricted', suspension: 'suspended', ban: 'banned' } as const;

export async function communityStanding(userId: number): Promise<CommunityStanding> {
  const active = (await activeSanctions(userId)).filter(
    (sanction): sanction is { kind: 'restriction' | 'suspension' | 'ban'; endsAt: Date | null } =>
      sanction.kind === 'restriction' || sanction.kind === 'suspension' || sanction.kind === 'ban',
  );
  if (active.length === 0) {
    return { kind: 'good' };
  }
  const strongest = active.reduce((worst, sanction) => (STRENGTH[sanction.kind] > STRENGTH[worst.kind] ? sanction : worst));
  const same = active.filter((sanction) => sanction.kind === strongest.kind);
  // Sans fin si l'une l'est ; sinon la plus lointaine.
  const until = same.some((sanction) => sanction.endsAt === null)
    ? null
    : new Date(Math.max(...same.map((sanction) => sanction.endsAt?.getTime() ?? 0)));
  return { kind: STANDING[strongest.kind], until };
}

/** Le message d'un geste refusé, ou `null` si le compte est en règle. */
export async function communityRefusal(userId: number): Promise<string | null> {
  const standing = await communityStanding(userId);
  return standing.kind === 'good' ? null : standingMessage(standing.kind, standing.until);
}
