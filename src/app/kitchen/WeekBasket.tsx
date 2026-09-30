'use client';

import { MinusIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { removeFromBasket, setBasketServings } from '@/lib/client/basket';
import { MAX_BASKET_SERVINGS } from '@/lib/basket';
import { formatServings } from '@/lib/recipe';
import type { BasketItem } from '@/server/db/queries/basket';

/**
 * Le panier de la semaine, en tête de la Cuisine.
 *
 * Il répond à une question que le plan ne posait pas : qu'est-ce que j'ai
 * acheté, et qu'en reste-t-il à manger ? Un plat prévu pour quatre parts dont
 * deux sont déjà au plan le dit ici, et nulle part ailleurs — le plan, lui,
 * montre des jours, pas des restes.
 *
 * Régler des parts ici décide de ce qu'il faut acheter, et la liste de courses
 * ouverte de la semaine suit : monter un plat de deux à quatre parts double ce
 * que ses ingrédients réclament. Ce qui est déjà coché ou écrit à la main n'y
 * bouge pas, et une liste close ne bouge plus du tout — le détail de ce qui
 * survit vit dans `syncListToBasket`, côté serveur.
 *
 * Retirer un plat ne touche pas à la recette, qui reste au carnet.
 *
 * Le compte de parts suit le doigt et l'écriture suit derrière : chaque demi-
 * part réécrit la liste de courses côté serveur, et attendre cette réponse
 * avant d'afficher le nouveau compte rendait le réglage poussif, alors qu'on
 * le fait par petits coups répétés. Les écritures d'une même ligne sont mises
 * à la queue plutôt qu'envoyées en vrac : deux appels concurrents pourraient
 * arriver dans le désordre, et c'est le dernier parti qui doit gagner, pas le
 * dernier arrivé.
 */

/** Pas d'un réglage de parts. Un demi-plat se mange, un quart ne se cuisine pas. */
const STEP = 0.5;

export function WeekBasket({
  weekStart,
  basket,
}: {
  weekStart: string;
  basket: readonly BasketItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Les parts affichées d'avance, en attendant que le serveur les confirme. */
  const [posted, setPosted] = useState<ReadonlyMap<number, number>>(new Map());
  const [refreshing, startRefresh] = useTransition();
  /** Une file par ligne, pour que les écritures gardent l'ordre des gestes. */
  const queues = useRef(new Map<number, Promise<unknown>>());
  /** Le plat dont la feuille de réglage est ouverte. */
  const [openId, setOpenId] = useState<number | null>(null);

  // Le panier rendu par le serveur porte ces parts : les avances ont fait leur
  // office, et les garder ferait tenir une valeur périmée.
  useEffect(() => setPosted(new Map()), [basket]);

  function servingsOf(item: BasketItem): number {
    return posted.get(item.id) ?? item.servings;
  }

  function adjust(item: BasketItem, delta: number): void {
    const current = servingsOf(item);
    const next = Math.round((current + delta) * 10) / 10;
    if (next <= 0 || next > MAX_BASKET_SERVINGS) {
      return;
    }

    setPosted((previous) => new Map(previous).set(item.id, next));
    setError(null);

    const previous = queues.current.get(item.id) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        const outcome = await setBasketServings(item.id, next);
        if (outcome.kind !== 'ok') {
          setPosted((current) => {
            const rolled = new Map(current);
            rolled.delete(item.id);
            return rolled;
          });
          setError('Modification impossible.');
          return;
        }
        // Les parts à placer et la liste de courses se recalculent au serveur.
        startRefresh(() => router.refresh());
      });

    queues.current.set(item.id, write);
  }

  async function drop(item: BasketItem) {
    setBusy(true);
    setError(null);
    const outcome = await removeFromBasket(item.id);
    setBusy(false);

    if (outcome.kind === 'ok') {
      setOpenId(null);
      startRefresh(() => router.refresh());
      return;
    }
    setError('Suppression impossible.');
  }

  const selected = basket.find((item) => item.id === openId) ?? null;

  return (
    <section
      aria-label="À cuisiner"
      className="flex flex-col gap-2 rounded-xl border bg-card px-3.5 py-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">À cuisiner</h2>
        <Link
          href={`/kitchen/catalog?from=${weekStart}`}
          className="text-[12.5px] font-bold text-cook-ink"
        >
          Choisir des plats
        </Link>
      </div>

      {error ? <ErrorAlert className="mt-0">{error}</ErrorAlert> : null}

      {basket.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Rien de choisi pour cette semaine. On choisit des plats, on achète de quoi les faire,
          et on décide du jour au dernier moment.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 text-[12.5px]">
          {basket.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className="rounded-[10px] bg-cook-soft px-2.5 py-1.5 text-left"
              >
                {item.recipeName}{' '}
                <b className="font-bold text-cook-ink">
                  {formatServingCount(item.plannedServings)}/{formatServingCount(servingsOf(item))}
                </b>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={selected !== null} onOpenChange={(next) => (next ? undefined : setOpenId(null))}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg gap-4 px-5 pt-5 pb-[calc(2rem+var(--safe-bottom))]"
        >
          {selected === null ? null : (
            <BasketItemPanel
              item={selected}
              servings={servingsOf(selected)}
              weekStart={weekStart}
              busy={busy || refreshing}
              onAdjust={(delta) => adjust(selected, delta)}
              onDrop={() => void drop(selected)}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function formatServingCount(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

/**
 * Le réglage d'un plat du panier : ses parts, ce qu'il en reste à placer, sa
 * fiche, et le retrait. La recette elle-même reste au carnet.
 */
function BasketItemPanel({
  item,
  servings,
  weekStart,
  busy,
  onAdjust,
  onDrop,
}: {
  item: BasketItem;
  servings: number;
  weekStart: string;
  busy: boolean;
  onAdjust: (delta: number) => void;
  onDrop: () => void;
}) {
  // Négatif quand on a prévu plus de parts qu'on n'en a acheté : c'est dit,
  // pas ramené à zéro.
  const remaining = Math.round((servings - item.plannedServings) * 10) / 10;
  return (
    <>
      <SheetHeader className="p-0 pr-10">
        <SheetTitle className="text-[19px] tracking-[-0.02em]">{item.recipeName}</SheetTitle>
        <SheetDescription>
          {formatServings(servings)} prévues ·{' '}
          {remaining <= 0 ? 'tout est au plan' : `${formatServings(remaining)} à placer`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex items-center justify-center gap-5">
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="bg-cook-soft text-cook-ink"
          onClick={() => onAdjust(-STEP)}
          disabled={busy || servings <= STEP}
          aria-label="Retirer une demi-part"
        >
          <MinusIcon />
        </Button>
        <p className="min-w-24 text-center">
          <span className="block text-4xl font-bold tracking-[-0.03em] text-cook-ink">
            {formatServingCount(servings)}
          </span>
          <span className="text-[13px] text-muted-foreground">parts à acheter</span>
        </p>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="bg-cook-soft text-cook-ink"
          onClick={() => onAdjust(STEP)}
          disabled={busy || servings >= MAX_BASKET_SERVINGS}
          aria-label="Ajouter une demi-part"
        >
          <PlusIcon />
        </Button>
      </div>
      <p className="text-center text-[12.5px] text-muted-foreground">
        La liste de courses suit ces parts, sauf ce qui y est déjà coché.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link href={`/kitchen/recipes/${item.recipeId}?from=${weekStart}`}>Voir la fiche</Link>
        </Button>
        <Button type="button" variant="ghost" className="flex-1 text-destructive" onClick={onDrop} disabled={busy}>
          Retirer du panier
        </Button>
      </div>
    </>
  );
}
