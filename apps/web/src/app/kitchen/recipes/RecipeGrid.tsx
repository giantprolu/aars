'use client';

import { SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DishImage } from '@/components/DishImage';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MEALS, MEAL_SHORT_LABELS, isMeal, type Meal } from '@/lib/meal';
import { formatKcal } from '@/lib/nutrition';

/** Ce que la grille montre d'une recette, calculé côté serveur. */
export interface RecipeTile {
  id: number;
  name: string;
  servings: number;
  prepMinutes: number | null;
  kcalPerServing: number;
  /** Au moins un ingrédient sans fiche : le chiffre est un plancher. */
  partial: boolean;
  imageUrl: string | null;
  /** Le moment de la recette, `null` si elle n'en a pas. */
  meal: Meal | null;
}

/** Sans accents ni casse : « creme » doit trouver « Crème brûlée ». */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Les recettes en grille de deux colonnes, filtrables sur place.
 *
 * Le filtre porte sur des recettes déjà chargées : un carnet personnel compte
 * quelques dizaines de fiches, et une requête par frappe serait plus lente que
 * le tri dans le navigateur.
 */
export function RecipeGrid({ recipes }: { recipes: readonly RecipeTile[] }) {
  const [term, setTerm] = useState('');
  const [slot, setSlot] = useState<Meal | 'all'>('all');
  const needle = fold(term.trim());
  const shown = recipes.filter(
    (r) => (needle === '' || fold(r.name).includes(needle)) && (slot === 'all' || r.meal === slot),
  );

  return (
    <>
      <div className="relative mt-4">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Filtrer mes recettes"
          placeholder="Filtrer mes recettes"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs
        value={slot}
        onValueChange={(value) => setSlot(value === 'all' ? 'all' : isMeal(value) ? value : 'all')}
        className="mt-3"
      >
        <TabsList aria-label="Moment du repas" className="w-full">
          <TabsTrigger value="all">Tout</TabsTrigger>
          {MEALS.map((candidate) => (
            <TabsTrigger key={candidate} value={candidate} className="px-1">
              {MEAL_SHORT_LABELS[candidate]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Aucune recette ne correspond.</p>
      ) : (
        <ul className="mt-3.5 grid grid-cols-2 gap-2.5">
          {shown.map((recipe) => (
            <li key={recipe.id}>
              <Card asChild className="h-full gap-0 p-3.5 transition-colors active:bg-accent">
                <Link href={`/kitchen/recipes/${recipe.id}`}>
                  <DishImage
                    src={recipe.imageUrl}
                    alt=""
                    sizes="(max-width: 32rem) 50vw, 16rem"
                    className="h-[96px] rounded-md"
                  />
                  <span className="mt-2.5 line-clamp-2 text-[13.5px] font-medium tracking-tight">
                    {recipe.name}
                  </span>
                  <span className="tabular mt-0.5 text-[12.5px] text-muted-foreground">
                    {recipe.servings === 1 ? '1 part' : `${recipe.servings} parts`}
                    {recipe.prepMinutes === null ? '' : ` · ${recipe.prepMinutes} min`}
                  </span>
                  <span className="tabular mt-auto pt-1.5 font-semibold">
                    {/*
                      Le total est dit partiel plutôt que faux : un ingrédient
                      qu'on n'a pas su résoudre fait un chiffre trop bas.
                    */}
                    {recipe.partial ? '≈ ' : ''}
                    {formatKcal(recipe.kcalPerServing)}{' '}
                    <span className="font-normal text-muted-foreground">kcal / part</span>
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
