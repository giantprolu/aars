'use client';

import { BarcodeIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { AISLES, AISLE_LABELS, type Aisle } from '@/lib/aisle';
import { formatIngredientQuantity, shoppingUnitCount } from '@/lib/recipe';
import { checkItem, generateList, removeItem } from '@/lib/client/shopping';
import type { ShareableRecipe } from '@/lib/share-recipes';
import { cn } from '@/lib/utils';
import { ShareRecipes } from './ShareRecipes';
import type { ShoppingList as List, ShoppingItem } from '@/server/db/queries/shopping';

/**
 * Le scanner arrive au premier appui, pas avec l'écran.
 *
 * Il porte le décodeur de codes-barres, qui pesait à lui seul un quart du
 * script de cette page — chargé à chaque ouverture de la liste, y compris pour
 * cocher trois articles au doigt sans jamais scanner. Le viseur est un écran
 * plein, ouvert par un geste explicite : c'est exactement ce qui se charge à
 * la demande.
 */
const ScanToCheck = dynamic(() => import('./ScanToCheck').then((module) => module.ScanToCheck), {
  ssr: false,
  loading: () => (
    <div
      aria-busy
      aria-label="Ouverture du scanner"
      className="fixed inset-0 z-50 bg-[#0b0b0b]"
    />
  ),
});

/**
 * La liste de courses, rangée par rayon.
 *
 * Les articles cochés restent en place, grisés, plutôt que de descendre en bas
 * de liste ou de disparaître. Une liste qui se réordonne sous le pouce fait
 * perdre sa place au milieu d'un rayon, et c'est exactement le moment où l'on
 * ne peut pas y consacrer d'attention.
 *
 * Le scan est le geste central de cet écran, pas une commodité : il occupe la
 * barre basse. C'est lui qui relie les courses au journal, le produit scanné
 * devenant la fiche employée par les prochains repas construits sur cet
 * ingrédient.
 *
 * Cocher est immédiat, et l'écriture suit. C'est le geste le plus répété de
 * l'application, fait debout dans un rayon : attendre l'aller-retour avant de
 * noircir la case donnait une demi-seconde d'immobilité par article, et
 * interdisait d'en cocher deux à la suite. La case suit donc le doigt, et seul
 * un échec la rend à son état — auquel cas il est dit.
 */

/** Ce qu'une quantité demande d'acheter, en unités si l'ingrédient s'en compte. */
function purchaseLabel(item: ShoppingItem): string {
  const count = shoppingUnitCount(item.quantityG, item.unitName, item.unitGrams);
  if (count === null || item.unitName === null) {
    return formatIngredientQuantity(item);
  }
  const plural = count >= 2 && !/[sxz]$/i.test(item.unitName) ? `${item.unitName}s` : item.unitName;
  return `${count} ${plural} (${Math.round(item.quantityG).toLocaleString('fr-FR')} g)`;
}

export function ShoppingList({
  list,
  weekStart,
  recipes,
  weekLabel,
}: {
  list: List | null;
  weekStart: string;
  /** Les plats du panier de la semaine, pour les partager une fois les courses faites. */
  recipes: readonly ShareableRecipe[];
  weekLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Les coches posées d'avance, en attendant que le serveur les confirme. */
  const [posted, setPosted] = useState<ReadonlyMap<number, boolean>>(new Map());
  const [refreshing, startRefresh] = useTransition();

  // La liste rendue par le serveur porte désormais ces coches : les avances
  // n'ont plus lieu d'être, et les garder ferait tenir une valeur périmée si
  // l'article changeait ailleurs.
  useEffect(() => setPosted(new Map()), [list]);

  function isChecked(item: ShoppingItem): boolean {
    return posted.get(item.id) ?? item.checkedAt !== null;
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    const outcome = await generateList(weekStart);
    setBusy(false);

    if (outcome.kind === 'generated') {
      router.refresh();
      return;
    }
    setError(
      outcome.kind === 'empty'
        ? 'Aucun plat au panier pour cette semaine : commence par choisir tes repas.'
        : 'La liste n’a pas pu être engendrée.',
    );
  }

  /** Bascule l'article. Le scanner, lui, coche sans jamais décocher. */
  function toggle(item: ShoppingItem): void {
    void setChecked(item, !isChecked(item), null);
  }

  async function setChecked(
    item: ShoppingItem,
    checked: boolean,
    barcode: string | null,
  ): Promise<void> {
    setPosted((previous) => new Map(previous).set(item.id, checked));
    setError(null);

    const outcome = await checkItem({
      id: item.id,
      checked,
      barcode,
      refKind: item.refKind,
      refValue: item.refValue,
    });

    if (outcome.kind !== 'ok') {
      setPosted((previous) => {
        const next = new Map(previous);
        next.delete(item.id);
        return next;
      });
      setError('Modification impossible.');
      return;
    }

    // Les totaux, eux, viennent du serveur. La transition garde la page en
    // place pendant ce temps plutôt que de la remplacer par une silhouette.
    startRefresh(() => router.refresh());
  }

  async function drop(item: ShoppingItem) {
    setBusy(true);
    await removeItem(item.id);
    setBusy(false);
    router.refresh();
  }

  if (list === null) {
    return (
      <div className="py-8 text-center">
        <p className="mx-auto max-w-[26ch] text-lg font-semibold tracking-tight">
          La liste se déduit des plats choisis.
        </p>
        <p className="mx-auto mt-2 max-w-[32ch] text-muted-foreground">
          Les ingrédients du panier de cette semaine, additionnés à l&apos;échelle des parts
          prévues et rangés par rayon.
        </p>
        <div className="mx-auto mt-5 flex max-w-[260px] flex-col gap-2.5">
          <Button type="button" onClick={() => void regenerate()} disabled={busy}>
            {busy ? 'Calcul…' : 'Engendrer la liste'}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/kitchen/catalog?from=${weekStart}`}>Choisir mes repas</Link>
          </Button>
        </div>
        {error ? <ErrorAlert className="text-left">{error}</ErrorAlert> : null}
      </div>
    );
  }

  const total = list.items.length;
  const taken = list.items.filter((item) => isChecked(item)).length;
  const share = total === 0 ? 0 : Math.round((taken / total) * 100);

  return (
    <>
      <Card className="mt-4">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="tabular text-[14.5px] font-medium tracking-tight">
              {taken === total ? 'Tout est pris' : `${taken} sur ${total} pris`}
            </span>
            <span className="tabular text-muted-foreground">{share} %</span>
          </div>
          <Progress value={share} aria-label="Articles pris" className="mt-2.5" />
        </CardContent>
      </Card>

      {error ? <ErrorAlert className="mt-3">{error}</ErrorAlert> : null}

      {AISLES.map((aisle: Aisle) => {
        const items = list.items.filter((item) => item.aisle === aisle);
        if (items.length === 0) {
          return null;
        }

        return (
          <section key={aisle} aria-label={AISLE_LABELS[aisle]} className="mt-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-tight">{AISLE_LABELS[aisle]}</h2>
              <span className="tabular text-muted-foreground">{items.length}</span>
            </div>

            <Card className="gap-0 overflow-hidden py-0">
              <ul>
                {items.map((item) => {
                  const done = isChecked(item);
                  const id = `shopping-item-${item.id}`;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 border-b py-1 pr-1.5 pl-4 last:border-b-0"
                    >
                      <Checkbox
                        id={id}
                        checked={done}
                        onCheckedChange={() => toggle(item)}
                        className="size-[18px]"
                      />
                      <label
                        htmlFor={id}
                        className={cn('min-w-0 flex-1 cursor-pointer py-1.5', done && 'opacity-55')}
                      >
                        <span
                          className={cn(
                            'block truncate text-[14.5px] font-medium tracking-tight',
                            done && 'line-through',
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                          {purchaseLabel(item)}
                          {/*
                            Le code-barres scanné est rappelé : c'est lui qui
                            décide désormais des macros de cet ingrédient, et
                            rien d'autre ne le dirait.
                          */}
                          {item.checkedBarcode === null ? '' : ' · scanné'}
                        </span>
                      </label>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void drop(item)}
                        disabled={busy || refreshing}
                        aria-label={`Retirer ${item.label} de la liste`}
                        className="text-muted-foreground"
                      >
                        <XIcon />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}

      {/*
        Le partage vient après la liste, et non avant : on partage ses recettes
        une fois les articles cochés, pas en entrant dans le magasin. Le bouton
        prend de l'importance quand tout est pris — c'est alors le geste
        suivant — sans jamais disparaître avant, un article laissé de côté
        n'empêchant pas d'envoyer ce qu'on va cuisiner.
      */}
      <ShareRecipes
        recipes={recipes}
        weekLabel={weekLabel}
        complete={total > 0 && taken === total}
      />

      <Button
        type="button"
        variant="ghost"
        onClick={() => void regenerate()}
        disabled={busy}
        className="mt-5 w-full"
      >
        <RefreshCwIcon />
        Refaire la liste depuis le panier
      </Button>
      <p className="mt-1 text-center text-[12.5px] text-muted-foreground">
        Une nouvelle liste remplace celle-ci, coches comprises. Au quotidien, elle suit déjà
        les parts du panier toute seule.
      </p>

      <BottomBar>
        <Button
          type="button"
          variant="outline"
          onClick={() => setScanning(true)}
          aria-haspopup="dialog"
          className="w-full"
        >
          <BarcodeIcon />
          Scanner un article
        </Button>
      </BottomBar>

      {scanning ? (
        <ScanToCheck
          open
          items={list.items}
          onClose={() => setScanning(false)}
          onCheck={(item, barcode) => {
            setScanning(false);
            // Le scanner coche, il ne bascule pas : l'article est dans le chariot.
            void setChecked(item, true, barcode);
          }}
        />
      ) : null}
    </>
  );
}
