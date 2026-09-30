'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { SwipeToDeleteRow } from '@/components/SwipeToDeleteRow';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deleteFavorite, replayFavorite } from '@/lib/client/favorites';
import { favoriteTotals, type FavoriteMeal } from '@/lib/favorites';
import { MEALS, MEAL_LABELS, isMeal, type Meal } from '@/lib/meal';
import { useInitialMeal } from '@/lib/client/meal-param';
import { formatGrams, formatKcal } from '@/lib/nutrition';

/**
 * Les repas favoris, à refaire d'un appui.
 *
 * Le repas d'arrivée est choisi une fois, en haut, et vaut pour tous : on
 * ouvre cet écran au moment de manger, et c'est l'heure qui dit presque
 * toujours lequel. Le favori garde en mémoire le repas d'où il vient, mais
 * l'avoine du petit-déjeuner mangée en collation reste une collation.
 *
 * Un favori se supprime d'un glissement, comme une ligne du journal.
 */
export function FavoritesFlow({ favorites }: { favorites: readonly FavoriteMeal[] }) {
  const router = useRouter();
  const initialMeal = useInitialMeal();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());

  async function add(favorite: FavoriteMeal) {
    setBusy(favorite.id);
    setError(null);
    const outcome = await replayFavorite(favorite.id, meal);
    setBusy(null);
    if (outcome.kind === 'ok') {
      router.push('/');
      router.refresh();
      return;
    }
    setError(outcome.message ?? 'Le repas n’a pas pu être ajouté.');
  }

  async function remove(favorite: FavoriteMeal) {
    const outcome = await deleteFavorite(favorite.id);
    if (outcome.kind === 'ok') {
      setRemoved((previous) => new Set(previous).add(favorite.id));
    }
  }

  const shown = favorites.filter((favorite) => !removed.has(favorite.id));

  return (
    <>
      <NavHeader label="Ajouter" href="/add" />
      <PageTitle title="Mes favoris" description="Un repas déjà noté, refait d’un appui." />

      {shown.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mx-auto max-w-[28ch] text-lg font-semibold tracking-tight">
            Aucun favori pour l’instant.
          </p>
          <p className="mx-auto mt-2 max-w-[34ch] text-muted-foreground">
            Sur le journal du jour, l’étoile à côté d’un repas l’enregistre ici.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/">Revenir au journal</Link>
          </Button>
        </div>
      ) : (
        <>
          <Select value={meal} onValueChange={(value) => isMeal(value) && setMeal(value)}>
            <SelectTrigger aria-label="Repas" className="mt-4 h-10 w-full data-[size=default]:h-10">
              <span className="text-muted-foreground">Ajouter au repas :</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEALS.map((value) => (
                <SelectItem key={value} value={value}>
                  {MEAL_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error ? <ErrorAlert>{error}</ErrorAlert> : null}

          <ul className="mt-3">
            {shown.map((favorite) => {
              const totals = favoriteTotals(favorite);
              return (
                <SwipeToDeleteRow
                  key={favorite.id}
                  label={favorite.name}
                  onDelete={() => remove(favorite)}
                >
                  <div className="flex items-center gap-3 border-b py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium tracking-tight">
                        {favorite.name}
                      </p>
                      <p className="mt-px truncate text-[12.5px] text-muted-foreground">
                        {favorite.items.map((item) => item.foodLabel).join(', ')}
                      </p>
                      <p className="tabular mt-px text-[12.5px] text-muted-foreground">
                        {formatKcal(totals.kcal)} kcal · {formatGrams(totals.proteinG)} g P
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void add(favorite)}
                      disabled={busy !== null}
                      aria-label={`Ajouter ${favorite.name} au ${MEAL_LABELS[meal].toLowerCase()}`}
                    >
                      <PlusIcon />
                      {busy === favorite.id ? 'Ajout…' : 'Ajouter'}
                    </Button>
                  </div>
                </SwipeToDeleteRow>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
