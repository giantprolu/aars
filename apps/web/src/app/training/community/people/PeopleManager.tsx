'use client';

import { SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  changeRelation,
  searchPeople,
  type RelationAction,
} from '@/lib/client/social';
import { personLabel, type FollowState, type PublicPerson } from '@/lib/social';

/** Délai avant de chercher, le temps de finir de taper un identifiant. */
const SEARCH_DEBOUNCE_MS = 300;

function PersonRow({
  person,
  children,
}: {
  person: PublicPerson;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium tracking-tight">
          {personLabel(person)}
        </span>
        {person.displayName !== null ? (
          <span className="block truncate text-[12.5px] text-muted-foreground">
            @{person.handle}
          </span>
        ) : null}
      </span>
      <span className="flex flex-none gap-1.5">{children}</span>
    </li>
  );
}

/**
 * Chercher des personnes, répondre aux demandes, gérer qui on suit et qui
 * nous suit.
 *
 * Chaque geste part au serveur puis rafraîchit l'écran : les listes sont
 * courtes, et les relire est plus sûr que de deviner leur nouvel état.
 */
export function PeopleManager({
  requests,
  following,
  followers,
}: {
  requests: readonly PublicPerson[];
  following: readonly (PublicPerson & { state: FollowState })[];
  followers: readonly PublicPerson[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(PublicPerson & { state: FollowState })[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().replace(/^@+/, '').length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchPeople(query, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setSearching(false);
      setResults(found ?? []);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function act(action: RelationAction, person: PublicPerson) {
    setBusy(person.id);
    setError(null);
    const outcome = await changeRelation(action, person.id);
    setBusy(null);
    if (outcome.kind === 'error') {
      setError(outcome.message ?? 'Le geste n’a pas pu être enregistré.');
      return;
    }
    if (results !== null && (action === 'follow' || action === 'unfollow')) {
      setResults((current) =>
        (current ?? []).map((entry) =>
          entry.id === person.id
            ? { ...entry, state: action === 'follow' ? 'requested' : 'none' }
            : entry,
        ),
      );
    }
    router.refresh();
  }

  function followButton(person: PublicPerson & { state: FollowState }) {
    const pending = busy === person.id;
    if (person.state === 'none') {
      return (
        <Button type="button" size="sm" disabled={pending} onClick={() => void act('follow', person)}>
          Suivre
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => void act('unfollow', person)}
      >
        {person.state === 'requested' ? 'Annuler la demande' : 'Ne plus suivre'}
      </Button>
    );
  }

  return (
    <>
      <div className="relative mt-5">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          aria-label="Chercher une personne"
          placeholder="Chercher par @identifiant ou nom"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>

      {error ? <ErrorAlert className="mt-3">{error}</ErrorAlert> : null}

      {searching ? <Skeleton aria-label="Recherche…" className="mt-3 h-12" /> : null}
      {results !== null && !searching ? (
        results.length === 0 ? (
          <p className="mt-3 text-muted-foreground">Personne ne correspond.</p>
        ) : (
          <ul className="mt-2">
            {results.map((person) => (
              <PersonRow key={person.id} person={person}>
                {followButton(person)}
              </PersonRow>
            ))}
          </ul>
        )
      ) : null}

      {requests.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-1 text-[12.5px] text-muted-foreground">
            Demandes reçues · {requests.length}
          </h2>
          <ul>
            {requests.map((person) => (
              <PersonRow key={person.id} person={person}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === person.id}
                  onClick={() => void act('decline', person)}
                >
                  Refuser
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === person.id}
                  onClick={() => void act('accept', person)}
                >
                  Accepter
                </Button>
              </PersonRow>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-1 text-[12.5px] text-muted-foreground">
          Tu suis · {following.filter((person) => person.state === 'following').length}
        </h2>
        {following.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            Personne encore. Cherche un identifiant ci-dessus.
          </p>
        ) : (
          <ul>
            {following.map((person) => (
              <PersonRow key={person.id} person={person}>
                {followButton(person)}
              </PersonRow>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-[12.5px] text-muted-foreground">
          Te suivent · {followers.length}
        </h2>
        {followers.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            Personne encore. Ils voient seulement les séances que tu partages.
          </p>
        ) : (
          <ul>
            {followers.map((person) => (
              <PersonRow key={person.id} person={person}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === person.id}
                  onClick={() => void act('remove', person)}
                >
                  Retirer
                </Button>
              </PersonRow>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
