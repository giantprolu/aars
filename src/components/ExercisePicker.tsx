'use client';

import { CheckIcon, StarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { setExerciseFavorite } from '@/lib/client/training';
import { cn } from '@/lib/utils';
import { normalizeExerciseName } from '@/lib/workout-log';
import { EQUIPMENT_LABELS, type Exercise } from '@/lib/workout';

/** Le filtre qui montre les favoris seulement. */
const FAVORITES = '__favorites';

/**
 * Choisir des exercices dans le catalogue, sans rien écrire.
 *
 * Les favoris passent en tête, et se marquent d'un appui sur l'étoile de la
 * ligne : c'est là, en choisissant, qu'on sait lesquels on refait toujours. Le
 * filtre par muscle répond à la question qu'on se pose vraiment en composant
 * une séance — « qu'est-ce que j'ai pour le dos ? » — et la recherche au cas
 * où l'on connaît déjà le nom.
 *
 * `multiple` garde la feuille ouverte : composer une séance, c'est en choisir
 * six d'affilée, et rouvrir la feuille six fois serait six gestes de trop.
 */
export function ExercisePicker({
  open,
  title,
  description,
  catalog,
  favorites,
  onFavoritesChange,
  selected,
  excluded,
  multiple = false,
  onToggle,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  catalog: readonly Exercise[];
  favorites: ReadonlySet<number>;
  onFavoritesChange: (next: Set<number>) => void;
  /** Ceux déjà choisis dans cette feuille, cochés. */
  selected: ReadonlySet<number>;
  /** Ceux qu'on ne peut pas choisir, déjà présents ailleurs dans la séance. */
  excluded: ReadonlySet<number>;
  multiple?: boolean;
  onToggle: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = [
    ...new Set(
      catalog
        .map((exercise) => exercise.muscleGroup ?? (exercise.kind === 'cardio' ? 'Cardio' : null))
        .filter((value): value is string => value !== null),
    ),
  ];

  const needle = normalizeExerciseName(query);
  const visible = catalog
    .filter((exercise) => !excluded.has(exercise.id))
    .filter(
      (exercise) =>
        needle === '' ||
        [exercise.name, ...exercise.aliases].some((name) =>
          normalizeExerciseName(name).includes(needle),
        ),
    )
    .filter((exercise) => {
      if (group === null) {
        return true;
      }
      if (group === FAVORITES) {
        return favorites.has(exercise.id);
      }
      return (exercise.muscleGroup ?? (exercise.kind === 'cardio' ? 'Cardio' : null)) === group;
    })
    .sort(
      (a, b) =>
        Number(favorites.has(b.id)) - Number(favorites.has(a.id)) ||
        (a.rank ?? 99) - (b.rank ?? 99) ||
        a.name.localeCompare(b.name, 'fr'),
    );

  async function toggleFavorite(exercise: Exercise) {
    const next = new Set(favorites);
    const favorite = !next.has(exercise.id);
    if (favorite) {
      next.add(exercise.id);
    } else {
      next.delete(exercise.id);
    }
    // Affiché tout de suite, défait si le serveur refuse : attendre la réponse
    // pour allumer une étoile rendrait le geste hésitant.
    onFavoritesChange(next);
    setError(null);
    const outcome = await setExerciseFavorite(exercise.id, favorite);
    if (outcome.kind === 'error') {
      onFavoritesChange(new Set(favorites));
      setError('Le favori n’a pas pu être enregistré.');
    }
  }

  function close() {
    setQuery('');
    setError(null);
    onClose();
  }

  const chips: { value: string | null; label: string }[] = [
    { value: null, label: 'Tous' },
    ...(favorites.size > 0 ? [{ value: FAVORITES, label: 'Favoris' }] : []),
    ...groups.map((value) => ({ value, label: value })),
  ];

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[92dvh] max-w-lg flex-col gap-0 rounded-t-[20px] px-5 pt-2.5 pb-[calc(1rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 flex-none rounded-full bg-border" />
        <SheetHeader className="flex-none p-0 pr-10">
          <SheetTitle className="text-[17px]">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <Input
          type="search"
          placeholder="Chercher un exercice"
          aria-label="Chercher un exercice"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-4 flex-none"
        />

        <div
          role="group"
          aria-label="Filtrer par muscle"
          className="-mx-5 mt-3 flex flex-none gap-1.5 overflow-x-auto px-5 pb-1"
        >
          {chips.map((chip) => (
            <Button
              key={chip.value ?? 'all'}
              type="button"
              size="xs"
              variant={group === chip.value ? 'default' : 'outline'}
              aria-pressed={group === chip.value}
              onClick={() => setGroup(chip.value)}
              className="flex-none rounded-full px-3"
            >
              {chip.label}
            </Button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-2 flex-none text-[13px] text-destructive">
            {error}
          </p>
        ) : null}

        <ul className="mt-2 min-h-0 flex-1 divide-y overflow-y-auto">
          {visible.length === 0 ? (
            <li className="py-6 text-[13.5px] text-muted-foreground">
              Aucun exercice ne correspond.
            </li>
          ) : null}
          {visible.map((exercise) => {
            const isSelected = selected.has(exercise.id);
            const isFavorite = favorites.has(exercise.id);
            return (
              <li key={exercise.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={multiple ? isSelected : undefined}
                  onClick={() => {
                    onToggle(exercise);
                    if (!multiple) {
                      close();
                    }
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
                >
                  {multiple ? (
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 flex-none items-center justify-center rounded-md border',
                        isSelected && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {isSelected ? <CheckIcon className="size-3.5" /> : null}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium tracking-tight">
                      {exercise.name}
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {[exercise.muscleGroup, EQUIPMENT_LABELS[exercise.equipment]]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={isFavorite}
                  aria-label={
                    isFavorite
                      ? `Retirer ${exercise.name} des favoris`
                      : `Mettre ${exercise.name} en favori`
                  }
                  onClick={() => void toggleFavorite(exercise)}
                  className={isFavorite ? 'text-primary' : 'text-muted-foreground'}
                >
                  <StarIcon className={cn(isFavorite && 'fill-current')} />
                </Button>
              </li>
            );
          })}
        </ul>

        {multiple ? (
          <SheetFooter className="flex-none p-0 pt-3">
            <Button type="button" onClick={close} className="w-full">
              {selected.size === 0
                ? 'Fermer'
                : `Terminé · ${selected.size} exercice${selected.size > 1 ? 's' : ''}`}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
