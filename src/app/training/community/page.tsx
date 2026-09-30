import { UserPlusIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { DomainHeader } from '@/components/DomainHeader';
import { requireUserId } from '@/server/guard';
import { feedFor, identityFor, relationsFor, weekBoard } from '@/server/services/social';
import { sessionHistory } from '@/server/services/workouts';
import { shiftDate, startOfWeek, todayInParis } from '@/lib/date';
import { avatarTone, initialsOf, personLabel } from '@/lib/social';
import { cn } from '@/lib/utils';
import { Feed } from './Feed';
import { IdentityForm } from './IdentityForm';

export const dynamic = 'force-dynamic';

/** Avatars montrés en tête : ce qui tient sur une ligne de téléphone. */
const AVATARS_SHOWN = 5;

/**
 * La Communauté (maquette 5a, écran 5) : ceux que je suis, le classement de
 * la semaine, puis le fil des séances partagées.
 *
 * Composant serveur, aucun import client (AD-10). Tant qu'on ne s'est pas
 * présenté, l'écran commence par là : sans identifiant, personne ne peut
 * vous trouver, et vous ne pouvez suivre personne.
 */
export default async function CommunityPage() {
  const userId = await requireUserId();
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
  const me = {
    id: userId,
    handle: identity.handle ?? 'moi',
    displayName: identity.displayName,
  };
  const board = following.length === 0 ? [] : await weekBoard(userId, weekStart, me, myWeek);
  const best = Math.max(1, ...board.map((row) => row.sessions));

  // Un anneau autour de ceux qui ont partagé une séance ces deux derniers jours.
  const recent = new Set(
    feed.sessions
      .filter((session) => !session.mine && session.sessionDate >= shiftDate(today, -1))
      .map((session) => session.author.id),
  );
  const pending = relations.requests.length;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <DomainHeader
        title="Communauté"
        kicker={
          <>
            {following.length} suivi{following.length > 1 ? 's' : ''}
            {pending > 0 ? (
              <>
                {' · '}
                <Link href="/training/community/people" className="font-semibold text-social-ink">
                  {pending} demande{pending > 1 ? 's' : ''}
                </Link>
              </>
            ) : null}
          </>
        }
        icon={UsersIcon}
        tone="social"
        initials={initialsOf(identity.displayName ?? identity.handle)}
      />

      {identity.handle === null ? (
        <section className="rounded-xl border bg-card p-4">
          <p className="text-[15px] font-semibold tracking-tight">Présente-toi</p>
          <p className="mt-1 mb-4 text-[13px] text-muted-foreground">
            Choisis un identifiant pour qu’on puisse te trouver et que tu puisses suivre d’autres
            personnes. Tes séances restent privées tant que tu ne les partages pas, une par une.
          </p>
          <IdentityForm initialHandle={null} initialDisplayName={null} submitLabel="Continuer" />
        </section>
      ) : (
        <ul className="flex gap-3 overflow-x-auto px-1 pt-1 pb-0.5 [scrollbar-width:none]">
          <li className="flex-none">
            <Link
              href="/training/community/people"
              className="flex w-[54px] flex-col items-center gap-1"
            >
              <span className="flex size-[50px] items-center justify-center rounded-full border-[1.5px] border-dashed border-social-mid">
                <UserPlusIcon aria-hidden className="size-[18px] text-social-ink" />
              </span>
              <span className="text-[11px] font-semibold text-social-ink">Inviter</span>
            </Link>
          </li>
          {following.slice(0, AVATARS_SHOWN).map((person) => (
            <li key={person.id} className="flex w-[54px] flex-none flex-col items-center gap-1">
              <span
                className={cn(
                  'flex size-[50px] items-center justify-center rounded-full text-[13px] font-semibold',
                  avatarTone(person.id),
                  recent.has(person.id) &&
                    'shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--social-mid)]',
                )}
              >
                {initialsOf(person.displayName ?? person.handle)}
              </span>
              <span
                className={cn(
                  'w-full truncate text-center text-[11px]',
                  !recent.has(person.id) && 'text-muted-foreground',
                )}
              >
                {(person.displayName ?? person.handle).split(' ')[0]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {board.length > 1 ? (
        <section aria-label="Cette semaine" className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
          <h2 className="text-[13px] font-semibold">Cette semaine</h2>
          <ul className="flex flex-col gap-2 text-[13px]">
            {board.map((row) => (
              <li key={row.person.id} className="flex items-center gap-2.5">
                <span
                  className={cn('w-[60px] truncate', row.mine && 'font-bold text-social-ink')}
                >
                  {row.mine ? 'Toi' : personLabel(row.person).split(' ')[0]}
                </span>
                <div className="h-2 flex-1 rounded-full bg-social-soft">
                  <div
                    className="h-full rounded-full bg-social"
                    style={{ width: `${(row.sessions / best) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'w-10 text-right font-semibold',
                    row.mine && 'font-bold text-social-ink',
                  )}
                >
                  {row.sessions}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-muted-foreground">
            Séances terminées depuis lundi, partagées par ceux que tu suis
          </p>
        </section>
      ) : null}

      <Feed initial={feed.sessions} initialNext={feed.next} />
    </div>
  );
}
