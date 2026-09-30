'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CookingPotIcon, PlusIcon, XIcon } from 'lucide-react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { journalMeal, planMeal, reopenMeal, unplanMeal } from '@/lib/client/plan';
import { MEAL_LABELS, mealForHour, type Meal } from '@/lib/meal';
import { formatDayMonth, formatWeekday, hourInParis, shiftDate } from '@/lib/date';
import { macrosPerServing, type Recipe } from '@/lib/recipe';
import { formatKcal, scaleMacros } from '@/lib/nutrition';
import type { PlannedMeal } from '@/server/db/queries/meal-plan';
import { PlanMealSheet } from './PlanMealSheet';

/**
 * Le plan de la semaine.
 *
 * Sept jours empilés plutôt qu'une grille de sept colonnes : sur la largeur
 * d'un téléphone, une colonne par jour donne des cases de cinquante pixels où
 * aucun nom de plat ne tient. La semaine se parcourt du pouce, pas d'un regard.
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

  async function reopen(id: number) {
    setBusy(true);
    setError(null);
    await reopenMeal(id);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <nav className="mt-4 flex items-center justify-between" aria-label="Semaine">
        <Button asChild variant="ghost" size="icon" className="-ml-2.5">
          <Link href={`/kitchen?from=${shiftDate(startDate, -7)}`} aria-label="Semaine précédente">
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
        <span className="text-[13px] font-semibold tracking-tight">Le plan</span>
        <Button asChild variant="ghost" size="icon" className="-mr-2.5">
          <Link href={`/kitchen?from=${shiftDate(startDate, 7)}`} aria-label="Semaine suivante">
            <ChevronRightIcon className="size-5" />
          </Link>
        </Button>
      </nav>

      {error ? <ErrorAlert className="mt-2">{error}</ErrorAlert> : null}
      {notice ? (
        <p role="status" className="mt-2 text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {days.map((day) => {
        const meals = planned.filter((entry) => entry.planDate === day);
        const isToday = day === today;

        return (
          <section key={day} aria-label={`${formatWeekday(day)} ${formatDayMonth(day)}`}>
            <div className="flex items-center justify-between pt-[18px] pb-2">
              <h2 className="text-[13px] font-semibold tracking-tight first-letter:uppercase">
                {formatWeekday(day)} {formatDayMonth(day)}
              </h2>
              {isToday ? <Badge variant="outline">Aujourd’hui</Badge> : null}
            </div>

            <ul className="flex flex-col gap-2">
              {meals.map((entry) => {
                const recipe = byRecipe.get(entry.recipeId);
                const eaten =
                  recipe === undefined
                    ? null
                    : scaleMacros(macrosPerServing(recipe).macros, entry.servings * 100);
                const done = entry.journaledAt !== null;

                return (
                  <li key={entry.id}>
                    <Card className="flex-row items-center gap-3 px-3.5 py-3">
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-8 flex-none items-center justify-center rounded-lg bg-muted',
                          done && 'opacity-60',
                        )}
                      >
                        <CookingPotIcon className="size-4" />
                      </span>
                      <div className={cn('min-w-0 flex-1', done && 'opacity-60')}>
                        <Link
                          href={`/kitchen/recipes/${entry.recipeId}`}
                          className={cn(
                            'block truncate text-[14.5px] font-medium tracking-tight',
                            done && 'line-through',
                          )}
                        >
                          {entry.recipeName}
                        </Link>
                        <p className="tabular mt-px text-[12.5px] text-muted-foreground">
                          {MEAL_LABELS[entry.meal]}
                          {' · '}
                          {entry.servings === 1 ? '1 part' : `${entry.servings} parts`}
                          {eaten === null ? '' : ` · ${formatKcal(eaten.kcal)} kcal`}
                        </p>
                      </div>

                      {done ? (
                        <Badge asChild variant="secondary" className="h-9 px-3">
                          <button
                            type="button"
                            onClick={() => void reopen(entry.id)}
                            disabled={busy}
                            aria-label={`Retirer ${entry.recipeName} du journal`}
                          >
                            Au journal
                          </button>
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void eat(entry.id)}
                          disabled={busy}
                        >
                          Manger
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void remove(entry.id)}
                        disabled={busy}
                        aria-label={`Retirer ${entry.recipeName} du plan`}
                        className="-mr-1.5 text-muted-foreground"
                      >
                        <XIcon />
                      </Button>
                    </Card>
                  </li>
                );
              })}
              <li>
                <Card asChild className="min-h-[52px] w-full flex-row items-center justify-center gap-2 border-dashed py-0 text-[13.5px] text-muted-foreground transition-colors active:bg-accent">
                  <button
                    type="button"
                    onClick={() =>
                      setTarget({
                        planDate: day,
                        // Le repas proposé suit l'heure pour aujourd'hui, et le dîner
                        // pour les autres jours : c'est le repas qu'on planifie.
                        meal: isToday ? mealForHour(hourInParis()) : 'dinner',
                      })
                    }
                  >
                    <PlusIcon className="size-4" />
                    Un plat de la semaine
                  </button>
                </Card>
              </li>
            </ul>
          </section>
        );
      })}

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
