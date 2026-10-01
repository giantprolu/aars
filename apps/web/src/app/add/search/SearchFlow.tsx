'use client';

import { ChevronRightIcon, SearchIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader } from '@/components/ScreenHeader';
import { QuantityPad } from '@/components/QuantityPad';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildQuantityShortcuts, type QuantityShortcut } from '@/lib/shortcuts';
import { cacheProduct } from '@/lib/client/products';
import { createEntry, fetchRecentQuantities } from '@/lib/client/entries';
import { MIN_QUERY_LENGTH, SEARCH_DEBOUNCE_MS, searchFoods } from '@/lib/client/search';
import { formatKcal } from '@/lib/nutrition';
import type { Meal } from '@/lib/meal';
import type { SearchHit } from '@/lib/types';

/**
 * Recherche textuelle d'un aliment (FR-7, UJ-2).
 *
 * Aucune suggestion, aucune correction orthographique en cas d'absence de
 * résultat : la similarité trigramme absorbe déjà les fautes de frappe
 * courantes, et une suggestion de plus serait du bruit (EXPERIENCE.md).
 */

type Step =
  | { name: 'search' }
  | { name: 'quantity'; hit: SearchHit; shortcuts: QuantityShortcut[] };

/**
 * D'où vient la fiche. Trois étiquettes et non deux : un produit déjà scanné
 * est une fiche vérifiée une fois par son propriétaire, un produit venu de la
 * recherche Open Food Facts est une fiche saisie par un inconnu. L'utilisateur
 * n'accorde pas le même crédit aux deux, encore faut-il les distinguer.
 */
const SOURCE_LABEL: Record<SearchHit['origin'], string> = {
  ciqual: 'CIQUAL',
  cache: 'Scanné',
  off: 'Open Food Facts',
};

/**
 * Filtre des résultats par provenance, sans nouvelle requête : les résultats
 * sont déjà là. Les produits scannés et ceux d'Open Food Facts vont ensemble :
 * ce sont des produits du commerce, face aux aliments génériques de CIQUAL.
 */
type Filter = 'all' | 'ciqual' | 'products';

function isFilter(value: string): value is Filter {
  return value === 'all' || value === 'ciqual' || value === 'products';
}

function matches(filter: Filter, hit: SearchHit): boolean {
  if (filter === 'all') {
    return true;
  }
  return filter === 'ciqual' ? hit.origin === 'ciqual' : hit.origin !== 'ciqual';
}

export function SearchFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'search' });
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Le champ reçoit le focus à l'ouverture (EXPERIENCE.md, motifs de composants).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (step.name !== 'search') {
      return;
    }
    if (term.trim().length < MIN_QUERY_LENGTH) {
      setHits(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const outcome = await searchFoods(term, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setSearching(false);
      setHits(outcome.kind === 'hits' ? outcome.hits : []);
      setError(outcome.kind === 'error' ? 'Recherche indisponible.' : null);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, step.name]);

  async function pick(hit: SearchHit) {
    const recent = await fetchRecentQuantities(hit.kind, hit.ref, hit.name);
    setStep({
      name: 'quantity',
      hit,
      shortcuts: buildQuantityShortcuts({
        servingSizeG: hit.servingSizeG,
        recentQuantities: recent,
      }),
    });
  }

  async function save(quantityG: number, meal: Meal) {
    if (step.name !== 'quantity') {
      return;
    }
    setSubmitting(true);
    setError(null);

    // Un produit venu de la recherche Open Food Facts n'est pas encore en base.
    // Sans cette mise en cache, l'entrée porterait une référence vers un produit
    // que rien ne connaît : les raccourcis de quantité (FR-9) et les alias
    // (FR-19) ne la retrouveraient plus. L'entrée, elle, porte ses propres
    // macros (AD-1) et reste juste même si cette écriture échoue.
    if (step.hit.origin === 'off') {
      await cacheProduct({
        barcode: step.hit.ref,
        name: step.hit.name,
        per100g: step.hit.per100g,
        servingSizeG: step.hit.servingSizeG,
        source: 'off',
      });
    }

    const result = await createEntry({
      foodLabel: step.hit.name,
      per100g: step.hit.per100g,
      quantityG,
      sourceKind: step.hit.kind,
      sourceRef: step.hit.ref,
      meal,
    });

    if (result.kind === 'created') {
      router.replace('/');
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.kind === 'unauthorized' ? 'Session expirée.' : 'Enregistrement impossible.');
  }

  if (step.name === 'quantity') {
    return (
      <>
        <NavHeader
          label="Rechercher"
          onDismiss={() => {
            setError(null);
            setStep({ name: 'search' });
          }}
        />
        <QuantityPad
          foodLabel={step.hit.name}
          sourceLabel={SOURCE_LABEL[step.hit.origin]}
          per100g={step.hit.per100g}
          shortcuts={step.shortcuts}
          submitting={submitting}
          onSubmit={save}
        />
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </>
    );
  }

  const shown = hits?.filter((hit) => matches(filter, hit)) ?? null;

  return (
    <>
      <NavHeader label="Ajouter" href="/add" />

      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          type="search"
          autoComplete="off"
          aria-label="Nom de l'aliment"
          placeholder="riz blanc"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="px-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {term === '' ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            aria-label="Effacer la recherche"
            className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
          >
            <XIcon className="size-[15px]" />
          </Button>
        )}
      </div>

      <Tabs
        value={filter}
        onValueChange={(value) => isFilter(value) && setFilter(value)}
        className="mt-3.5"
      >
        <TabsList className="w-full">
          <TabsTrigger value="all">Tout</TabsTrigger>
          <TabsTrigger value="ciqual">CIQUAL</TabsTrigger>
          <TabsTrigger value="products">Produits</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {searching ? (
        <div aria-label="Recherche…" className="mt-5 flex flex-col gap-2.5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : null}

      {shown !== null && shown.length === 0 && !searching ? (
        <p className="mt-5 text-muted-foreground">Aucun aliment trouvé.</p>
      ) : null}

      {shown !== null && shown.length > 0 && !searching ? (
        <>
          <p className="mt-5 text-[12.5px] text-muted-foreground">
            {shown.length === 1 ? '1 résultat' : `${shown.length} résultats`}
          </p>
          <ul>
            {shown.map((hit) => (
              <li key={`${hit.kind}-${hit.ref}`}>
                <button
                  type="button"
                  onClick={() => void pick(hit)}
                  className="flex w-full items-center gap-3 border-b py-2.5 text-left transition-colors active:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium tracking-tight">
                      {hit.name}
                    </span>
                    <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                      {formatKcal(hit.per100g.kcal)} kcal / 100 g
                    </span>
                  </span>
                  <Badge variant={hit.origin === 'ciqual' ? 'outline' : 'secondary'}>
                    {SOURCE_LABEL[hit.origin]}
                  </Badge>
                  <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {hits !== null && !searching ? (
        <p className="mt-6 text-center text-muted-foreground">
          Rien ne correspond ?{' '}
          <Link href="/add/manual" className="text-foreground underline underline-offset-4">
            Saisis les valeurs à la main
          </Link>
        </p>
      ) : null}
    </>
  );
}
