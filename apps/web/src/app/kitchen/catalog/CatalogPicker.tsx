'use client';

import { ChevronRightIcon, ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { DishImage } from '@/components/DishImage';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { chooseMeals } from '@/lib/client/basket';
import { CATALOG_GOAL_LABELS, CATALOG_GOAL_NOTES } from '@/lib/meal-catalog';
import type { Goal } from '@/lib/energy';
import { MEALS, MEAL_SHORT_LABELS, isMeal, type Meal } from '@/lib/meal';
import { CatalogMealSheet } from './CatalogMealSheet';

/**
 * Un plat du catalogue tel que l'écran de choix le lit.
 *
 * Il porte tout le plat, étapes comprises, mais pour un seul objectif à la
 * fois : la page n'envoie que l'onglet ouvert, les autres arrivant par une
 * navigation. Descendre les soixante-douze plats d'un coup pour en afficher
 * vingt-quatre triplerait la charge utile sans rien montrer de plus.
 */
export interface CatalogCard {
  slug: string;
  name: string;
  slot: Meal;
  servings: number;
  prepMinutes: number;
  steps: readonly string[];
  ingredients: readonly {
    label: string;
    quantityG: number;
    unitName: string | null;
    unitGrams: number | null;
    /** Rendement de cuisson, pour lire le poids cru à acheter. */
    cookedYield: number | null;
  }[];
  imageUrl: string | null;
  /** Ordre de grandeur d'une part. Les valeurs justes viennent avec la recette. */
  kcal: number;
  proteinG: number;
  /** Vrai si le plat figure déjà au panier de cette semaine. */
  inBasket: boolean;
}

/**
 * Le choix des plats de la semaine.
 *
 * Chaque ligne ne porte que le nom, et se touche à deux endroits : la case
 * choisit, le reste ouvre le détail. Deux gestes distincts parce que ce sont
 * deux intentions — on parcourt une liste de trente plats pour reconnaître un
 * nom, et on ouvre le détail des deux ou trois dont on hésite. Empiler
 * ingrédients et durées sous chaque nom rendrait ce parcours impraticable.
 *
 * La sélection est locale tant qu'on n'a pas validé : cocher huit plats fait
 * huit écritures si chaque coche part au serveur, et l'écran devient
 * inutilisable sur une connexion moyenne. Un seul envoi à la fin, et un
 * compte-rendu de ce qui s'est réellement installé.
 *
 * Les plats déjà au panier sont montrés comme tels et ne se décochent pas
 * ici : les retirer se fait depuis le panier, où l'on voit ce qu'on enlève.
 */
export function CatalogPicker({
  weekStart,
  goal,
  meals,
  basketCount,
}: {
  weekStart: string;
  goal: Goal;
  meals: readonly CatalogCard[];
  basketCount: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slot, setSlot] = useState<Meal | 'all'>('all');
  const [detail, setDetail] = useState<CatalogCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shown = slot === 'all' ? meals : meals.filter((card) => card.slot === slot);

  function toggle(slug: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  async function confirm() {
    if (selected.size === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const outcome = await chooseMeals(weekStart, [...selected]);
    setBusy(false);

    if (outcome.kind !== 'chosen') {
      setError(
        outcome.kind === 'unauthorized'
          ? 'Session expirée.'
          : 'Ces plats n’ont pas pu être ajoutés.',
      );
      return;
    }

    const { report } = outcome;
    const parts = [
      report.chosen === 1 ? '1 plat au panier.' : `${report.chosen} plats au panier.`,
    ];
    // Ce qui n'a pas pu s'installer est dit, jamais tu : une recette amputée
    // d'un ingrédient donne un total trop bas, et c'est le genre d'erreur
    // qu'on ne remarque qu'après trois semaines de journal.
    if (report.failed.length > 0) {
      parts.push(`Sans fiche exploitable, donc écartés : ${report.failed.join(', ')}.`);
    }
    if (report.skippedIngredients.length > 0) {
      parts.push(
        `Ingrédients introuvables dans Ciqual et manquants : ${[
          ...new Set(report.skippedIngredients),
        ].join(', ')}.`,
      );
    }

    setSelected(new Set());
    setNotice(parts.join(' '));
    router.refresh();
  }

  return (
    <>
      <Tabs value={goal} className="mt-4">
        <TabsList aria-label="Objectif" className="w-full">
          {(['lose', 'maintain', 'gain'] as const).map((candidate) => (
            <TabsTrigger key={candidate} value={candidate} asChild>
              <Link
                href={`/kitchen/catalog?from=${weekStart}&goal=${candidate}`}
                aria-current={goal === candidate ? 'page' : undefined}
              >
                {CATALOG_GOAL_LABELS[candidate]}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{CATALOG_GOAL_NOTES[goal]}</p>

      <Tabs
        value={slot}
        onValueChange={(value) => setSlot(value === 'all' ? 'all' : isMeal(value) ? value : 'all')}
        className="mt-3.5"
      >
        <TabsList aria-label="Type de repas" className="w-full">
          <TabsTrigger value="all">Tout</TabsTrigger>
          {MEALS.map((candidate) => (
            <TabsTrigger key={candidate} value={candidate} className="px-1">
              {MEAL_SHORT_LABELS[candidate]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? <ErrorAlert className="mt-3">{error}</ErrorAlert> : null}
      {notice ? (
        <p role="status" className="mt-3 text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <ul className="mt-2">
        {shown.map((card) => {
          const picked = selected.has(card.slug);
          const id = `catalog-${card.slug}`;
          return (
            <li key={card.slug} className="flex items-center gap-1 border-b">
              {/*
                La case et le bouton de détail sont frères et non imbriqués : un
                contrôle dans un autre est un balisage invalide, que les lecteurs
                d'écran rendent de façon imprévisible. La case garde une cible de
                44 px, sans quoi elle se touche une fois sur deux.
              */}
              <label
                htmlFor={id}
                className="-ml-3 flex size-11 flex-none cursor-pointer items-center justify-center"
              >
                <Checkbox
                  id={id}
                  checked={picked || card.inBasket}
                  disabled={busy || card.inBasket}
                  onCheckedChange={() => toggle(card.slug)}
                  aria-label={`Choisir ${card.name}`}
                  className="size-[18px]"
                />
              </label>

              <button
                type="button"
                onClick={() => setDetail(card)}
                className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left transition-colors active:bg-accent"
                aria-haspopup="dialog"
              >
                <DishImage src={card.imageUrl} alt="" sizes="44px" className="size-11 flex-none rounded-md" />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[14.5px] font-medium tracking-tight',
                    card.inBasket && 'text-muted-foreground',
                  )}
                >
                  {card.name}
                </span>
                {card.inBasket ? <Badge variant="secondary">Au panier</Badge> : null}
                <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>

      {basketCount > 0 ? (
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link href={`/kitchen/shopping?from=${weekStart}`}>
            <ShoppingCartIcon />
            {basketCount === 1
              ? '1 plat au panier — passer aux courses'
              : `${basketCount} plats au panier — passer aux courses`}
          </Link>
        </Button>
      ) : null}

      {/*
        La validation vit dans la barre basse : on coche en parcourant, et le
        geste qui clôt la sélection doit rester sous le pouce, où qu'on soit
        arrivé dans la liste.
      */}
      <BottomBar>
        <Button
          type="button"
          onClick={() => void confirm()}
          disabled={busy || selected.size === 0}
          className="w-full"
        >
          {busy
            ? 'Ajout…'
            : selected.size === 0
              ? 'Choisis des plats'
              : selected.size === 1
                ? 'Ajouter 1 plat au panier'
                : `Ajouter ${selected.size} plats au panier`}
        </Button>
      </BottomBar>

      <CatalogMealSheet
        card={detail}
        picked={detail !== null && selected.has(detail.slug)}
        busy={busy}
        onClose={() => setDetail(null)}
        onToggle={(slug) => {
          toggle(slug);
          setDetail(null);
        }}
      />
    </>
  );
}
