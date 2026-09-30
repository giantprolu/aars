import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MEALS, MEAL_SHORT_LABELS, isMeal, type Meal } from '@/lib/meal';
import { formatWeekday, formatDayMonth } from '@/lib/date';
import { macrosPerServing, type Recipe } from '@/lib/recipe';
import { formatKcal, scaleMacros } from '@/lib/nutrition';
import { MAX_PLANNED_SERVINGS } from '@/lib/basket';
import { parseDecimal } from '@/lib/utils';

/**
 * Feuille d'ajout d'un plat au plan.
 *
 * Elle ne propose que les plats du panier de la semaine, et rien d'autre. Le
 * plan ne sert qu'à dire lequel des plats achetés est passé à table : offrir
 * le carnet entier revenait à prévoir des repas dont on n'a pas les
 * ingrédients, sur le même rang que ceux dont on a payé les courses. Les deux
 * listes se ressemblaient à l'écran et pas du tout dans le frigo.
 *
 * Conséquence assumée : un panier vide n'offre rien à prévoir, et la feuille
 * renvoie au choix des repas. C'est l'ordre du parcours — on choisit, on
 * achète, on met à table — dont le plan est la dernière étape et jamais la
 * première.
 *
 * L'ordre des questions suit celui de la décision réelle. On sait quel jour on
 * remplit — c'est le bouton qu'on vient de toucher — et on cherche quoi y
 * mettre ; le repas et les parts se règlent avant, et tombent juste le plus
 * souvent sans qu'on y touche.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis
 * WeekPlanner, qui la porte déjà.
 */

/** Ce qu'on mange d'un plat, par défaut. Une part : on cuisine pour plusieurs jours. */
const DEFAULT_SERVINGS = 1;

export function PlanMealSheet({
  open,
  planDate,
  weekStart,
  meal: initialMeal,
  recipes,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  planDate: string;
  /** Lundi de la semaine, pour renvoyer au bon panier quand il est vide. */
  weekStart: string;
  meal: Meal;
  /** Les plats du panier de la semaine, et eux seuls. */
  recipes: readonly Recipe[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (recipeId: number, meal: Meal, servings: number) => void;
}) {
  const [meal, setMeal] = useState<Meal>(initialMeal);
  // La saisie reste du texte : « 1, » doit survivre le temps de taper le 5.
  const [servingsText, setServingsText] = useState(String(DEFAULT_SERVINGS));
  const servings = parseDecimal(servingsText);

  // Le repas suit le bouton touché : ouvrir la feuille depuis le dîner de
  // jeudi ne doit pas proposer le déjeuner.
  useEffect(() => {
    setMeal(initialMeal);
    setServingsText(String(DEFAULT_SERVINGS));
  }, [initialMeal, planDate, open]);

  // Le champ se vide en le corrigeant, et vide se lit `NaN`. Sans ce
  // contrôle, choisir un plat à cet instant partait au serveur pour revenir en
  // « Ce plat n'a pas pu être prévu », qui n'explique rien.
  const validServings =
    Number.isFinite(servings) && servings > 0 && servings <= MAX_PLANNED_SERVINGS;

  function renderRecipe(recipe: Recipe) {
    const per = macrosPerServing(recipe);
    // Ce qui compte est ce qu'on va manger, pas ce que la recette produit :
    // une part de plus double le chiffre affiché.
    const eaten = scaleMacros(per.macros, servings * 100);
    return (
      <li key={recipe.id}>
        <button
          type="button"
          disabled={busy || !validServings}
          onClick={() => onConfirm(recipe.id, meal, servings)}
          className="flex w-full items-center gap-3 border-b py-2.5 text-left transition-colors active:bg-accent disabled:opacity-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-medium tracking-tight">
              {recipe.name}
            </span>
            <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
              {recipe.ingredients.length === 1
                ? '1 ingrédient'
                : `${recipe.ingredients.length} ingrédients`}
              {recipe.prepMinutes === null ? '' : ` · ${recipe.prepMinutes} min`}
            </span>
          </span>
          <span className="tabular flex-none font-medium">
            {per.unresolvedCount > 0 ? '≈ ' : ''}
            {formatKcal(eaten.kcal)} kcal
          </span>
        </button>
      </li>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="text-[17px]">Mes repas de la semaine</SheetTitle>
          <SheetDescription className="first-letter:uppercase">
            {formatWeekday(planDate)} {formatDayMonth(planDate)}
          </SheetDescription>
        </SheetHeader>

        {/*
          Rien à régler quand il n'y a rien à choisir : le repas et les parts
          d'un plat qu'on ne peut pas désigner ne servent à rien, et les laisser
          au-dessus d'une impasse donne un écran qui fait mine de marcher.
        */}
        {recipes.length === 0 ? (
          <div className="py-6 text-center">
            <p className="mx-auto max-w-[32ch] text-muted-foreground">
              Rien au panier pour cette semaine. Le plan dit lequel des plats achetés est passé à
              table : il commence donc par le choix des repas.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href={`/kitchen/catalog?from=${weekStart}`}>Choisir mes repas</Link>
            </Button>
          </div>
        ) : null}

        {recipes.length === 0 ? null : (
          <>
            <Tabs
              value={meal}
              onValueChange={(value) => isMeal(value) && setMeal(value)}
              className="mt-4"
            >
              <TabsList aria-label="Repas" className="w-full">
                {MEALS.map((candidate) => (
                  <TabsTrigger key={candidate} value={candidate}>
                    {MEAL_SHORT_LABELS[candidate]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="mt-3.5 flex items-center gap-3">
              <Label htmlFor="plan-servings" className="flex-1">
                Parts mangées
              </Label>
              <Input
                id="plan-servings"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={servingsText}
                onChange={(event) => setServingsText(event.target.value)}
                aria-invalid={!validServings}
                aria-describedby={validServings ? undefined : 'plan-servings-error'}
                className="tabular w-[92px] text-right"
              />
            </div>
            {validServings ? null : (
              <p
                id="plan-servings-error"
                role="alert"
                className="mt-1.5 text-right text-destructive"
              >
                Entre une demi-part et {MAX_PLANNED_SERVINGS} parts.
              </p>
            )}

            <Separator className="mt-4" />

            <ul className="pt-1">{recipes.map(renderRecipe)}</ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
