'use client';

import { MinusIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  MAX_SERVINGS,
  formatIngredientQuantity,
  formatServings,
  ingredientsForServings,
  recipeMacros,
  type RecipeIngredient,
} from '@/lib/recipe';
import { formatKcal, scaleMacros } from '@/lib/nutrition';

/**
 * Les ingrédients d'une fiche, pour le nombre de parts qu'on va cuisiner.
 *
 * Les parts se règlent ici, au doigt : la fiche répondait jusqu'ici pour le
 * nombre écrit dans la recette ou dans le panier, et rien ne permettait de
 * lire les quantités pour quatre quand la recette en faisait deux. La mise à
 * l'échelle est celle de la liste de courses, `ingredientsForServings`.
 *
 * Le réglage n'écrit rien : c'est une lecture. Changer les parts du panier se
 * fait au panier, qui fait acheter en conséquence.
 */
export function RecipeIngredients({
  ingredients,
  recipeServings,
  initialServings,
  basketServings,
}: {
  /** Les ingrédients tels qu'écrits, pour `recipeServings` parts. */
  ingredients: readonly RecipeIngredient[];
  recipeServings: number;
  initialServings: number;
  /** Les parts du panier de la semaine, ou `null` hors panier. */
  basketServings: number | null;
}) {
  const [servings, setServings] = useState(initialServings);
  const scaled = ingredientsForServings(ingredients, recipeServings, servings);
  const batch = recipeMacros(scaled);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">Quantités pour</span>
        <div role="group" aria-label="Nombre de parts" className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setServings((current) => Math.max(1, Math.ceil(current) - 1))}
            disabled={servings <= 1}
            aria-label="Une part de moins"
          >
            <MinusIcon />
          </Button>
          <span aria-live="polite" className="tabular min-w-[64px] text-center font-semibold">
            {formatServings(servings)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setServings((current) => Math.min(MAX_SERVINGS, Math.floor(current) + 1))}
            disabled={servings >= MAX_SERVINGS}
            aria-label="Une part de plus"
          >
            <PlusIcon />
          </Button>
        </div>
      </div>

      {/*
        Dit dès qu'il y a un écart, et seulement alors : une quantité qui
        n'est pas celle de la recette doit s'expliquer sur-le-champ, sinon
        c'est la fiche qu'on soupçonne d'avoir tort.
      */}
      {servings !== recipeServings ? (
        <p className="mb-2.5 text-[12.5px] text-muted-foreground">
          {basketServings !== null && servings === basketServings
            ? `Les ${formatServings(servings)} du panier de la semaine, celles-là mêmes que la liste de courses a fait acheter. `
            : ''}
          La recette, telle qu&apos;elle est écrite, en produit {formatServings(recipeServings)}.
        </p>
      ) : null}

      <ul>
        {scaled.map((ingredient) => (
          <li key={ingredient.id} className="flex items-center gap-3 border-b py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium tracking-tight">
                {ingredient.label}
              </span>
              <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                {formatIngredientQuantity(ingredient)}
              </span>
            </span>
            <span className="tabular flex-none text-muted-foreground">
              {ingredient.per100g === null ? (
                <span className="text-destructive">—</span>
              ) : (
                `${formatKcal(scaleMacros(ingredient.per100g, ingredient.quantityG).kcal)} kcal`
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="tabular mt-3 text-muted-foreground">
        {formatServings(servings)} en tout {batch.unresolvedCount > 0 ? '≈ ' : ''}
        {formatKcal(batch.macros.kcal)} kcal
      </p>
    </>
  );
}
