'use client';

import { CameraIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { QuantityPad } from '@/components/QuantityPad';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { buildQuantityShortcuts, type QuantityShortcut } from '@/lib/shortcuts';
import { createEntry, fetchRecentQuantities } from '@/lib/client/entries';
import { prepareImage } from '@/lib/client/image';
import { recognizePhoto } from '@/lib/client/recognize';
import { MIN_QUERY_LENGTH, SEARCH_DEBOUNCE_MS, searchFoods } from '@/lib/client/search';
import { fetchCandidates, rememberAlias, type CandidatesForName } from '@/lib/client/aliases';
import { formatKcal } from '@/lib/nutrition';
import type { Meal } from '@/lib/meal';
import type { Candidate, SearchHit } from '@/lib/types';

/**
 * Reconnaissance d'aliments par photo (FR-17 à FR-19, UJ-3).
 *
 * Ce parcours est volontairement plus long que le scan et la recherche. C'est
 * le chemin de dernier recours et il n'a pas à être optimisé : le modèle nomme,
 * l'utilisateur tranche, et le choix est mémorisé pour la fois suivante.
 *
 * Règle de conception de cet écran : l'utilisateur n'est jamais laissé sans
 * recours. Le modèle se trompe de nom, ne voit rien, ou n'est pas joignable —
 * dans les trois cas la photo reste affichée et la recherche manuelle est à
 * portée de doigt, sur place.
 */

type Step =
  | { name: 'capture' }
  | { name: 'working'; preview: string; label: string }
  | { name: 'failed'; preview: string; message: string; retryable: boolean }
  | { name: 'resolving'; preview: string; pending: CandidatesForName[]; done: number }
  | {
      name: 'quantity';
      preview: string;
      pending: CandidatesForName[];
      done: number;
      recognizedName: string;
      candidate: Candidate;
      /** La fiche telle qu'elle était, pour revenir sur le choix sans la reconstruire. */
      origin: CandidatesForName;
      shortcuts: QuantityShortcut[];
    };

const SOURCE_LABEL: Record<Candidate['kind'], string> = {
  ciqual: 'CIQUAL',
  product: 'Scanné',
};

/**
 * Le modèle nomme parfois deux fois le même ingrédient, vu à deux endroits de
 * l'assiette. Sans cette déduplication, deux fiches identiques s'affichaient et
 * en traiter une retirait les deux, le filtrage se faisant sur le nom.
 */
function distinct(names: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (key !== '' && !seen.has(key)) {
      seen.set(key, name.trim());
    }
  }
  return [...seen.values()];
}

function CandidateRow({
  name,
  kcal,
  badge,
  onPick,
}: {
  name: string;
  kcal: number;
  badge?: string;
  onPick: () => void;
}) {
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 py-2.5 text-left transition-colors active:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium tracking-tight">{name}</span>
          <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
            {formatKcal(kcal)} kcal / 100 g
          </span>
        </span>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
      </button>
    </li>
  );
}

/**
 * Une fiche par nom reconnu : les candidats du modèle, et un champ de recherche
 * pour reprendre la main quand aucun ne convient.
 *
 * Le champ est replié tant qu'il y a des candidats, et déplié d'emblée quand il
 * n'y en a aucun : dans ce cas l'utilisateur n'a rien d'autre à faire, et lui
 * demander un geste de plus pour découvrir son seul recours serait gratuit.
 */
function NameCard({
  entry,
  onPick,
  onSkip,
}: {
  entry: CandidatesForName;
  onPick: (recognizedName: string, candidate: Candidate) => void;
  onSkip: () => void;
}) {
  const fieldId = useId();
  const empty = entry.candidates.length === 0;
  const [searching, setSearching] = useState(empty);
  const [term, setTerm] = useState(empty ? entry.name : '');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [pendingSearch, setPendingSearch] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    if (!searching || term.trim().length < MIN_QUERY_LENGTH) {
      setHits(null);
      setPendingSearch(false);
      return;
    }

    const controller = new AbortController();
    setPendingSearch(true);
    const timer = setTimeout(async () => {
      const outcome = await searchFoods(term, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setPendingSearch(false);
      setSearchError(outcome.kind === 'error');
      setHits(outcome.kind === 'hits' ? outcome.hits : []);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, searching]);

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>«&nbsp;{entry.name}&nbsp;»</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={onSkip} className="-mr-2">
            Ignorer
          </Button>
        </div>

        {empty ? (
          <CardDescription className="mt-1">
            Aucun aliment correspondant. Cherche-le sous un autre nom.
          </CardDescription>
        ) : (
          <ul className="mt-1">
            {entry.candidates.map((candidate) => (
              <CandidateRow
                key={`${candidate.kind}-${candidate.ref}`}
                name={candidate.name}
                kcal={candidate.per100g.kcal}
                {...(candidate.fromAlias ? { badge: 'Déjà choisi' } : {})}
                onPick={() => onPick(entry.name, candidate)}
              />
            ))}
          </ul>
        )}

        {searching ? (
          <div className="mt-3 grid gap-2">
            <Label htmlFor={fieldId}>Chercher un autre nom</Label>
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={fieldId}
                type="search"
                autoComplete="off"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Ex. : riz, poulet, pain complet"
                className="pl-9"
              />
            </div>

            {pendingSearch ? <Skeleton aria-label="Recherche…" className="h-12" /> : null}

            {searchError ? (
              <p role="alert" className="text-destructive">
                Recherche indisponible.
              </p>
            ) : null}

            {hits !== null && hits.length === 0 && !pendingSearch && !searchError ? (
              <p className="text-muted-foreground">Aucun aliment trouvé.</p>
            ) : null}

            {hits !== null && hits.length > 0 ? (
              <ul>
                {hits.map((hit) => (
                  <CandidateRow
                    key={`hit-${hit.kind}-${hit.ref}`}
                    name={hit.name}
                    kcal={hit.per100g.kcal}
                    onPick={() => onPick(entry.name, { ...hit, fromAlias: false })}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setSearching(true)}
            className="mt-3 w-full"
          >
            <SearchIcon />
            Aucun ne convient, chercher moi-même
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PhotoFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'capture' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(preview: string) {
    setStep({ name: 'working', preview, label: 'Reconnaissance…' });

    const outcome = await recognizePhoto(preview);
    if (outcome.kind !== 'names') {
      const message =
        outcome.kind === 'too_large'
          ? 'Image trop lourde.'
          : outcome.kind === 'bad_format'
            ? 'Réponse du modèle inexploitable.'
            : outcome.kind === 'quota_exceeded'
              ? 'Le quota du modèle est épuisé. Rien à réessayer tant que le compte n’a pas de crédit.'
              : 'Reconnaissance indisponible.';
      setStep({
        name: 'failed',
        preview,
        message,
        retryable: outcome.kind !== 'quota_exceeded' && outcome.kind !== 'too_large',
      });
      return;
    }

    const names = distinct(outcome.names);
    if (names.length === 0) {
      setStep({
        name: 'failed',
        preview,
        message: 'Aucun aliment identifié sur cette photo.',
        retryable: true,
      });
      return;
    }

    setStep({ name: 'working', preview, label: 'Recherche des correspondances…' });
    const results = await fetchCandidates(names);
    setStep({ name: 'resolving', preview, pending: results, done: 0 });
  }

  async function handleFile(file: File) {
    setError(null);
    const prepared = await prepareImage(file);
    if (prepared.kind === 'unreadable') {
      setStep({ name: 'capture' });
      setError('Image illisible.');
      return;
    }
    await analyze(prepared.dataUrl);
  }

  async function pick(recognizedName: string, candidate: Candidate) {
    if (step.name !== 'resolving') {
      return;
    }
    const origin = step.pending.find((item) => item.name === recognizedName);
    if (!origin) {
      return;
    }
    const recent = await fetchRecentQuantities(candidate.kind, candidate.ref, candidate.name);
    setStep({
      name: 'quantity',
      preview: step.preview,
      pending: step.pending.filter((item) => item.name !== recognizedName),
      done: step.done,
      recognizedName,
      candidate,
      origin,
      shortcuts: buildQuantityShortcuts({
        servingSizeG: candidate.servingSizeG,
        recentQuantities: recent,
      }),
    });
  }

  /** Ignorer un nom ne crée aucune entrée et passe au suivant (FR-18). */
  function skip(entry: CandidatesForName) {
    if (step.name !== 'resolving') {
      return;
    }
    finishOrContinue(
      step.pending.filter((item) => item.name !== entry.name),
      step.preview,
      step.done,
    );
  }

  /** Revenir au choix de l'aliment sans perdre les autres noms en attente. */
  function cancelQuantity() {
    if (step.name !== 'quantity') {
      return;
    }
    setError(null);
    // Le nom en cours reprend sa place, avec tous ses candidats : revenir sur un
    // choix sert précisément à en examiner un autre.
    setStep({
      name: 'resolving',
      preview: step.preview,
      pending: [step.origin, ...step.pending],
      done: step.done,
    });
  }

  function finishOrContinue(pending: CandidatesForName[], preview: string, done: number) {
    if (pending.length === 0) {
      // Tous les noms traités ou ignorés : retour au journal (UX-DR-7).
      router.replace('/');
      router.refresh();
      return;
    }
    setStep({ name: 'resolving', preview, pending, done });
  }

  async function save(quantityG: number, meal: Meal) {
    if (step.name !== 'quantity') {
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await createEntry({
      foodLabel: step.candidate.name,
      per100g: step.candidate.per100g,
      quantityG,
      sourceKind: step.candidate.kind,
      sourceRef: step.candidate.ref,
      meal,
    });

    if (result.kind !== 'created') {
      setSubmitting(false);
      setError(result.kind === 'unauthorized' ? 'Session expirée.' : 'Enregistrement impossible.');
      return;
    }

    // La mémorisation ne conditionne pas l'entrée : son échec est silencieux.
    await rememberAlias(step.recognizedName, step.candidate.kind, step.candidate.ref);

    setSubmitting(false);
    finishOrContinue(step.pending, step.preview, step.done + 1);
  }

  if (step.name === 'capture') {
    return (
      <>
        <NavHeader label="Ajouter" href="/add" />
        <div className="mb-5 flex items-start justify-between gap-3">
          <PageTitle
            title="Photo du repas"
            description="Le modèle nomme les aliments. Tu choisis et tu pèses."
          />
          <Badge variant="outline" className="mt-1.5">
            Bêta
          </Badge>
        </div>
        <Card
          asChild
          className="hatch h-44 cursor-pointer items-center justify-center gap-2.5 text-center"
        >
          <label htmlFor="photo">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CameraIcon aria-hidden className="size-5" />
            </span>
            <span className="font-medium">Prendre une photo</span>
          </label>
        </Card>
        <input
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </>
    );
  }

  if (step.name === 'quantity') {
    return (
      <>
        <NavHeader label="Photo" onDismiss={cancelQuantity} />
        <QuantityPad
          foodLabel={step.candidate.name}
          sourceLabel={SOURCE_LABEL[step.candidate.kind]}
          per100g={step.candidate.per100g}
          shortcuts={step.shortcuts}
          submitting={submitting}
          onSubmit={save}
        />
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </>
    );
  }

  const remaining = step.name === 'resolving' ? step.pending.length : 0;

  return (
    <>
      <NavHeader label="Ajouter" href="/add" />

      {/* La photo reste affichée pendant tout le parcours, y compris en échec. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={step.preview}
        alt="Photo du repas"
        className="h-[168px] w-full rounded-xl border object-cover"
      />

      {step.name === 'working' ? (
        <div className="mt-4">
          <p className="text-muted-foreground">{step.label}</p>
          <Skeleton className="mt-3 h-16" />
          <Skeleton className="mt-2.5 h-16" />
        </div>
      ) : null}

      {step.name === 'failed' ? (
        <div role="alert" className="mt-4">
          <p className="text-[15px] font-semibold tracking-tight">{step.message}</p>
          <div className="mt-4 flex flex-col gap-2.5">
            {step.retryable ? (
              <Button type="button" variant="outline" onClick={() => void analyze(step.preview)}>
                Réessayer
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/add/search">Chercher par nom</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {step.name === 'resolving' ? (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold tracking-tight">
                <span className="tabular">{remaining}</span>
                {remaining === 1 ? ' aliment à traiter' : ' aliments à traiter'}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {step.done > 0 ? (
                  <>
                    <span className="tabular">{step.done}</span>
                    {step.done === 1 ? ' déjà enregistré' : ' déjà enregistrés'}
                  </>
                ) : (
                  'Choisis la bonne fiche, ou ignore le nom.'
                )}
              </p>
            </div>
            <Badge variant="outline">Bêta</Badge>
          </div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {step.pending.map((entry) => (
              <NameCard
                key={entry.name}
                entry={entry}
                onPick={(name, candidate) => void pick(name, candidate)}
                onSkip={() => skip(entry)}
              />
            ))}
          </div>
        </>
      ) : null}

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
    </>
  );
}
