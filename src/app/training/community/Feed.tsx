'use client';

import { HandHeartIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { loadFeed, setKudos } from '@/lib/client/social';
import { formatRelativeJournalDate } from '@/lib/date';
import { personLabel, type FeedSession } from '@/lib/social';
import { cn } from '@/lib/utils';
import { formatClock, formatSet, bestSet } from '@/lib/workout';

function initials(session: FeedSession): string {
  const label = personLabel(session.author).replace(/^@/, '');
  return label.slice(0, 2).toUpperCase();
}

function formatVolume(kg: number): string {
  return kg >= 1000
    ? `${(Math.round(kg / 100) / 10).toLocaleString('fr-FR')} t`
    : `${kg.toLocaleString('fr-FR')} kg`;
}

/**
 * Le fil des séances partagées, les plus récentes d'abord.
 *
 * Une carte dit qui, quoi, quand, combien — et, pour une séance partagée en
 * détail, chaque exercice avec sa meilleure série. Le bravo est le seul geste
 * possible : pas de commentaire, pas de classement. Le but est de se donner
 * envie d'y aller, pas de se comparer.
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
      <p className="py-6 text-center text-muted-foreground">
        Rien dans le fil pour l’instant. Les séances que tu partages, et celles des personnes que tu
        suis, apparaîtront ici.
      </p>
    );
  }

  return (
    <>
      {error ? <ErrorAlert className="mb-3">{error}</ErrorAlert> : null}
      <ul className="flex flex-col gap-2.5">
        {sessions.map((session) => (
          <li key={session.id}>
            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="text-[12px] font-semibold">
                      {initials(session)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium tracking-tight">
                      {session.mine ? 'Toi' : personLabel(session.author)}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground first-letter:uppercase">
                      {formatRelativeJournalDate(session.sessionDate)}
                      {session.mine || session.author.displayName === null
                        ? ''
                        : ` · @${session.author.handle}`}
                    </p>
                  </div>
                  {session.mine ? (
                    <Button asChild variant="ghost" size="sm" className="-mr-2">
                      <Link href={`/training/session/${session.id}`}>Voir</Link>
                    </Button>
                  ) : null}
                </div>

                <p className="mt-3 text-[16px] font-semibold tracking-tight">{session.name}</p>
                <div className="tabular mt-1.5 flex gap-4 text-[12.5px] text-muted-foreground">
                  {session.durationSeconds !== null ? (
                    <span>
                      <span className="block text-[15px] font-semibold text-foreground">
                        {formatClock(session.durationSeconds)}
                      </span>
                      durée
                    </span>
                  ) : null}
                  <span>
                    <span className="block text-[15px] font-semibold text-foreground">
                      {formatVolume(session.volumeKg)}
                    </span>
                    soulevés
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-foreground">
                      {session.setCount}
                    </span>
                    séries
                  </span>
                </div>

                {session.exercises.length > 0 ? (
                  <>
                    <Separator className="mt-3 mb-1.5" />
                    <ul>
                      {session.exercises.map((exercise, index) => {
                        const best = bestSet(exercise.sets);
                        return (
                          <li
                            key={index}
                            className="flex items-baseline justify-between gap-3 py-1 text-[13.5px]"
                          >
                            <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                            <span className="tabular flex-none text-muted-foreground">
                              {exercise.sets.length} ×{' '}
                              {best === null ? formatSet(exercise.sets[0]!) : formatSet(best)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant={session.kudoedByMe ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={session.mine}
                    aria-pressed={session.kudoedByMe}
                    onClick={() => void toggleKudos(session)}
                    className={cn(session.kudoedByMe && 'text-primary')}
                  >
                    <HandHeartIcon />
                    Bravo
                  </Button>
                  {session.kudos > 0 ? (
                    <Badge variant="outline" className="tabular">
                      {session.kudos}
                    </Badge>
                  ) : null}
                  {session.mine ? (
                    <span className="ml-auto text-[12px] text-muted-foreground">
                      {session.visibility === 'detailed' ? 'Partagée en détail' : 'Partagée en résumé'}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {next !== null ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void more()}
          disabled={loading}
          className="mt-3 w-full"
        >
          {loading ? 'Chargement…' : 'Plus ancien'}
        </Button>
      ) : null}
    </>
  );
}
