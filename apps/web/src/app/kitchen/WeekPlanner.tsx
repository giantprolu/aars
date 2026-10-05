'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, WandSparklesIcon } from 'lucide-react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { fillWeek, journalMeal, planMeal, reopenMeal, unplanMeal } from '@/lib/client/plan';
import { MEALS, MEAL_LABELS, type Meal } from '@/lib/meal';
import { formatDayMonth, formatDayShort, formatWeekday, shiftDate } from '@/lib/date';
import { macrosPerServing, type Recipe } from '@/lib/recipe';
import { formatKcal, scaleMacros } from '@/lib/nutrition';
import type { PlannedMeal } from '@/server/db/queries/meal-plan';
import { PlanMealSheet } from './PlanMealSheet';

/**
 * Le plan de la semaine (maquette 5a, écran Cuisine).
 *
 * Sept lignes, deux colonnes : midi et soir. Les jours s'empilent plutôt que
 * de former sept colonnes, où aucun nom de plat ne tiendrait sur un
 * téléphone. Le petit-déjeuner rejoint la colonne du midi et la collation
 * celle du soir : on les planifie rarement, mais ce qui l'est reste visible.
 *
 * Une case vide propose d'y mettre un plat du panier. Une case pleine ouvre
 * ses gestes : manger, retirer, voir la fiche. Aujourd'hui est surligné, et
 * son plat encore à manger le dit.
 *
 * Un plat journalisé reste affiché, barré de son horodatage. Le faire
 * disparaître priverait du seul repère qui dit ce qui a déjà été mangé, et le
 * plan se relirait comme une semaine à moitié vide.
 *
 * On n'y met que les plats du panier. Le plan ne dit pas ce qu'on pourrait
 * cuisiner, il dit lequel des plats achetés est passé à table : le carnet
 * entier n'a rien à faire dans ce choix, et les recettes dont les ingrédients
 * ne sont pas au frigo encore moins.
 */

/** Jour vers lequel la feuille s'ouvre, et repas présélectionné. */
interface SheetTarget {
  planDate: string;
  meal: Meal;
}

export function WeekPlanner({
  startDate,
  days,
  planned,
  recipes,
  basketRecipeIds,
  today,
  targetKcal,
}: {
  startDate: string;
  days: readonly string[];
  planned: readonly PlannedMeal[];
  recipes: readonly Recipe[];
  /** Recettes du panier de la semaine : les seules qu'on puisse mettre au plan. */
  basketRecipeIds: ReadonlySet<number>;
  today: string;
  targetKcal: number | null;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<SheetTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Le plat dont les gestes sont ouverts. */
  const [actionId, setActionId] = useState<number | null>(null);

  // Toutes les recettes servent à lire le plan — un plat prévu puis retiré du
  // panier garde son nom et ses macros — mais seules celles du panier peuvent
  // y entrer.
  const byRecipe = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const choosable = recipes.filter((recipe) => basketRecipeIds.has(recipe.id));

  async function add(recipeId: number, meal: Meal, servings: number) {
    if (target === null) {
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await planMeal({ planDate: target.planDate, meal, recipeId, servings });
    setBusy(false);

    if (outcome.kind === 'planned') {
      setTarget(null);
      router.refresh();
      return;
    }
    setError(
      outcome.kind === 'unauthorized' ? 'Session expirée.' : 'Ce plat n’a pas pu être prévu.',
    );
  }

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    const outcome = await unplanMeal(id);
    setBusy(false);
    setActionId(null);
    if (outcome.kind === 'removed') {
      router.refresh();
      return;
    }
    setError('Suppression impossible.');
  }

  async function eat(id: number) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const outcome = await journalMeal(id);
    setBusy(false);
    setActionId(null);

    if (outcome.kind === 'journaled') {
      // Les ingrédients sans fiche sont dits, jamais tus : le total de la
      // journée est plus bas qu'il ne devrait, et rien d'autre ne le dirait.
      setNotice(
        outcome.skipped.length === 0
          ? `${outcome.created === 1 ? '1 ligne ajoutée' : `${outcome.created} lignes ajoutées`} au journal.`
          : `${outcome.created} lignes ajoutées. Sans fiche, donc non comptés : ${outcome.skipped.join(', ')}.`,
      );
      router.refresh();
      return;
    }
    setError(outcome.kind === 'refused' ? outcome.message : 'Enregistrement impossible.');
  }

  async function fill() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const outcome = await fillWeek(startDate, MEALS);
    setBusy(false);

    if (outcome.kind === 'filled') {
      setNotice(
        outcome.placed === 0
          ? 'Rien à remplir : chaque repas de la semaine a déjà son plat.'
          : `${outcome.placed === 1 ? '1 repas posé' : `${outcome.placed} repas posés`}${
              outcome.added.length === 0 ? '' : `, avec ${outcome.added.join(', ')} ajoutés au panier`
            }${outcome.empty === 0 ? '.' : `. ${outcome.empty} restent vides, faute de plat.`}`,
      );
      router.refresh();
      return;
    }
    setError(outcome.kind === 'refused' ? outcome.message : 'Remplissage impossible.');
  }

  async function reopen(id: number) {
    setBusy(true);
    setError(null);
    await reopenMeal(id);
    setBusy(false);
    setActionId(null);
    router.refresh();
  }

  const selected = planned.find((entry) => entry.id === actionId) ?? null;
  const selectedRecipe = selected === null ? undefined : byRecipe.get(selected.recipeId);
  const selectedKcal =
    selected === null || selectedRecipe === undefined
      ? null
      : scaleMacros(macrosPerServing(selectedRecipe).macros, selected.servings * 100).kcal;

  // Les quatre moments, chacun sa colonne (05/10/2026) : le matin et la
  // collation ne se cachent plus sous le midi et le soir.
  const columns: { meal: Meal; label: string }[] = [
    { meal: 'breakfast', label: 'Matin' },
    { meal: 'lunch', label: 'Midi' },
    { meal: 'dinner', label: 'Soir' },
    { meal: 'snack', label: 'Collation' },
  ];
  const grid = 'grid grid-cols-[40px_repeat(4,minmax(0,1fr))] gap-1';

  return (
    <>
      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      {notice ? (
        <p role="status" className="px-1 text-[12.5px] text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-11 border-cook-mid text-cook-ink"
        onClick={() => void fill()}
        disabled={busy}
      >
        <WandSparklesIcon aria-hidden />
        Remplir la semaine
      </Button>

      <section aria-label="Le plan de la semaine" className="overflow-hidden rounded-xl border bg-card">
        <div className={cn(grid, 'items-center border-b border-divider px-2 py-1.5 text-[11px] text-muted-foreground')}>
          <span className="-ml-1.5 flex">
            <Link
              href={`/kitchen?from=${shiftDate(startDate, -7)}`}
              aria-label="Semaine précédente"
              className="flex size-6 items-center justify-center rounded-full active:bg-muted"
            >
              <ChevronLeftIcon aria-hidden className="size-4" />
            </Link>
            <Link
              href={`/kitchen?from=${shiftDate(startDate, 7)}`}
              aria-label="Semaine suivante"
              className="flex size-6 items-center justify-center rounded-full active:bg-muted"
            >
              <ChevronRightIcon aria-hidden className="size-4" />
            </Link>
          </span>
          {columns.map((column) => (
            <span key={column.meal}>{column.label}</span>
          ))}
        </div>

        {days.map((day, index) => {
          const isToday = day === today;
          return (
            <div
              key={day}
              aria-label={`${formatWeekday(day)} ${formatDayMonth(day)}`}
              role="group"
              className={cn(
                grid,
                'items-start px-2 py-1.5',
                index > 0 && 'border-t border-divider',
                isToday && 'bg-cook-soft',
              )}
            >
              <span
                className={cn(
                  'pt-1.5 text-xs',
                  isToday ? 'font-bold text-cook-ink' : 'text-muted-foreground',
                )}
              >
                {formatDayShort(day)}
              </span>
              {columns.map((column) => {
                const meals = planned.filter(
                  (entry) => entry.planDate === day && entry.meal === column.meal,
                );
                const past = day < today;
                return (
                  <div key={column.meal} className="flex min-w-0 flex-col gap-1">
                    {meals.map((entry) => {
                      const done = entry.journaledAt !== null;
                      const now = isToday && !done;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setActionId(entry.id)}
                          className={cn(
                            'line-clamp-3 rounded-lg px-1.5 py-1 text-left text-[11px] leading-snug break-words',
                            done && 'bg-muted text-faint line-through',
                            now && 'bg-cook font-semibold text-cook-on',
                            !done && !now && 'bg-cook-soft',
                          )}
                        >
                          {entry.recipeName}
                          {now ? ' · manger' : ''}
                        </button>
                      );
                    })}
                    {meals.length === 0 ? (
                      past ? (
                        <span className="px-1.5 py-1 text-xs text-faint">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTarget({ planDate: day, meal: column.meal })}
                          aria-label={`Prévoir un plat, ${column.label.toLowerCase()}, ${formatWeekday(day)}`}
                          className="rounded-lg border border-dashed border-cook-mid px-1.5 py-1 text-left text-xs text-cook-ink"
                        >
                          +
                        </button>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      <Sheet open={selected !== null} onOpenChange={(next) => (next ? undefined : setActionId(null))}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg gap-3 px-5 pt-5 pb-[calc(2rem+var(--safe-bottom))]"
        >
          {selected === null ? null : (
            <>
              <SheetHeader className="p-0 pr-10">
                <SheetTitle className="text-[19px] tracking-[-0.02em]">{selected.recipeName}</SheetTitle>
                <SheetDescription className="first-letter:uppercase">
                  {formatWeekday(selected.planDate)} {formatDayMonth(selected.planDate)} ·{' '}
                  {MEAL_LABELS[selected.meal].toLowerCase()} ·{' '}
                  {selected.servings === 1 ? '1 part' : `${selected.servings} parts`}
                  {selectedKcal === null ? '' : ` · ${formatKcal(selectedKcal)} kcal`}
                </SheetDescription>
              </SheetHeader>
              {selected.journaledAt === null ? (
                <Button
                  type="button"
                  className="h-12 bg-cook text-cook-on hover:bg-cook/90"
                  onClick={() => void eat(selected.id)}
                  disabled={busy}
                >
                  Manger, et l’inscrire au journal
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12"
                  onClick={() => void reopen(selected.id)}
                  disabled={busy}
                >
                  Retirer du journal
                </Button>
              )}
              <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/kitchen/recipes/${selected.recipeId}`}>Voir la fiche</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 text-destructive"
                  onClick={() => void remove(selected.id)}
                  disabled={busy}
                >
                  Retirer du plan
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <PlanMealSheet
        open={target !== null}
        planDate={target?.planDate ?? startDate}
        weekStart={startDate}
        meal={target?.meal ?? 'dinner'}
        recipes={choosable}
        busy={busy}
        targetKcal={targetKcal}
        onClose={() => setTarget(null)}
        onConfirm={(recipeId, meal, servings) => void add(recipeId, meal, servings)}
      />
    </>
  );
}
