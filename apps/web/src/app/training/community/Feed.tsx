'use client';

import { HeartIcon, TrendingUpIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Button } from '@/components/ui/button';
import { loadFeed, setKudos } from '@/lib/client/social';
import { formatRecentDay } from '@/lib/date';
import { avatarTone, initialsOf, personLabel, type FeedSession } from '@/lib/social';
import { cn } from '@/lib/utils';
import { bestSet, formatSet } from '@/lib/workout';
import { formatTonnage } from '@/lib/workout-progress';

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  minute: '2-digit',
});

/** « Hier, 18 h 40 », « jeudi, 7 h 05 ». */
function formatWhen(session: FeedSession): string {
  const time = timeFormatter.format(new Date(session.startedAt)).replace(':', ' h ');
  return `${formatRecentDay(session.sessionDate)}, ${time}`;
}

/** La meilleure série de la séance, charge la plus lourde en tête : « Squat 80 kg × 5 ». */
function strongest(session: FeedSession): string | null {
  let pick: { name: string; weight: number; label: string } | null = null;
  for (const exercise of session.exercises) {
    const best = bestSet(exercise.sets);
    if (best === null || best.weightKg === null) {
      continue;
    }
    if (pick === null || best.weightKg > pick.weight) {
      pick = { name: exercise.name, weight: best.weightKg, label: formatSet(best) };
    }
  }
  return pick === null ? null : `${pick.name} ${pick.label}`;
}

/**
 * Le fil des séances partagées, les plus récentes d'abord.
 *
 * Une carte dit qui, quoi, quand, combien (maquette 5a, écran 5). Partagée en
 * détail, la séance montre ses trois chiffres sur un bandeau et sa série la
 * plus lourde ; partagée en résumé, elle tient sur une ligne. Le bravo est le
 * seul geste possible, pas de commentaire : le but est de se donner envie d'y
 * aller.
 */
export function Feed({
  initial,
  initialNext,
}: {
  initial: readonly FeedSession[];
  initialNext: number | null;
}) {
  const [sessions, setSessions] = useState<FeedSession[]>([...initial]);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (next === null) {
      return;
    }
    setLoading(true);
    const page = await loadFeed(next);
    setLoading(false);
    if (page === null) {
      setError('La suite du fil n’a pas pu être chargée.');
      return;
    }
    setSessions((current) => [...current, ...page.sessions]);
    setNext(page.next);
  }

  async function toggleKudos(session: FeedSession) {
    const given = !session.kudoedByMe;
    // Affiché d'abord, défait si le serveur refuse : un bravo qui attend la
    // réponse du réseau pour s'allumer ne se donne pas deux fois.
    const apply = (value: boolean) =>
      setSessions((current) =>
        current.map((entry) =>
          entry.id === session.id
            ? { ...entry, kudoedByMe: value, kudos: entry.kudos + (value ? 1 : -1) }
            : entry,
        ),
      );
    apply(given);
    setError(null);
    const outcome = await setKudos(session.id, given);
    if (outcome.kind === 'error') {
      apply(!given);
      setError('Le bravo n’a pas pu être enregistré.');
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-4 text-center text-[13px] text-muted-foreground">
        Rien dans le fil pour l’instant. Les séances que tu partages, et celles des personnes que tu
        suis, apparaîtront ici.
      </p>
    );
  }

  return (
    <>
      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      <ul className="flex flex-col gap-3">
        {sessions.map((session) => {
          const who = session.mine ? 'Toi' : personLabel(session.author);
          const kudos = (
            <button
              type="button"
              disabled={session.mine}
              aria-pressed={session.kudoedByMe}
              aria-label={session.kudoedByMe ? 'Retirer le bravo' : 'Dire bravo'}
              onClick={() => void toggleKudos(session)}
              className={cn(
                'flex items-center gap-1.5 font-bold disabled:opacity-100',
                session.kudoedByMe || session.mine ? 'text-social-ink' : 'text-faint',
              )}
            >
              <HeartIcon
                aria-hidden
                className={cn('size-4', session.kudoedByMe && 'fill-current')}
              />
              {session.kudos > 0 ? session.kudos : null}
            </button>
          );
          const headline = (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {who} · <span className="font-semibold text-sport-ink">{session.name}</span>
              </p>
              <p className="text-xs text-muted-foreground first-letter:uppercase">
                {formatWhen(session)}
                {session.visibility === 'summary'
                  ? ` · ${formatTonnage(session.volumeKg)}${session.durationSeconds === null ? '' : ` · ${Math.round(session.durationSeconds / 60)} min`}`
                  : ''}
              </p>
            </div>
          );
          const avatar = (
            <span
              aria-hidden
              className={cn(
                'flex size-8 flex-none items-center justify-center rounded-full text-[11.5px] font-semibold',
                avatarTone(session.author.id),
              )}
            >
              {initialsOf(personLabel(session.author))}
            </span>
          );

          if (session.visibility === 'summary') {
            return (
              <li key={session.id} className="flex items-center gap-2.5 rounded-xl border bg-card p-3.5">
                {avatar}
                {session.mine ? (
                  <Link href={`/training/session/${session.id}`} className="min-w-0 flex-1">
                    {headline}
                  </Link>
                ) : (
                  headline
                )}
                {kudos}
              </li>
            );
          }

          const top = strongest(session);
          return (
            <li key={session.id} className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
              <div className="flex items-center gap-2.5">
                {avatar}
                {session.mine ? (
                  <Link href={`/training/session/${session.id}`} className="min-w-0 flex-1">
                    {headline}
                  </Link>
                ) : (
                  headline
                )}
              </div>
              <div className="grid grid-cols-3 rounded-[12px] bg-sport-soft py-2 text-center">
                <div>
                  <p className="text-[15px] font-semibold">{session.exercises.length}</p>
                  <p className="text-[11px] text-muted-foreground">exercices</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">{formatTonnage(session.volumeKg)}</p>
                  <p className="text-[11px] text-muted-foreground">volume</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">
                    {session.durationSeconds === null ? '—' : `${Math.round(session.durationSeconds / 60)} min`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">durée</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[13px]">
                {top === null ? (
                  <span />
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-cook-soft px-2.5 py-[3px] font-semibold text-cook-ink">
                    <TrendingUpIcon aria-hidden className="size-[13px] flex-none" />
                    <span className="truncate">{top}</span>
                  </span>
                )}
                {kudos}
              </div>
            </li>
          );
        })}
      </ul>

      {next !== null ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void more()}
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Chargement…' : 'Plus ancien'}
        </Button>
      ) : null}
    </>
  );
}
