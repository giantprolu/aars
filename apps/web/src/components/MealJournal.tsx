'use client';

import { ChevronDownIcon, StarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveFavorite } from '@/lib/client/favorites';
import { MAX_FAVORITE_NAME, suggestFavoriteName } from '@/lib/favorites';
import type { Entry } from '@/lib/types';
import { groupByMeal, type MealSection } from '@/lib/journal';
import type { Meal } from '@/lib/meal';
import { formatGrams, formatKcal } from '@/lib/nutrition';
import { cn } from '@/lib/utils';
import { SwipeToDeleteRow } from './SwipeToDeleteRow';

/**
 * Le journal d'une journée, groupé par repas (FR-4, FR-5, FR-21).
 *
 * Les valeurs affichées sont les macros figées de chaque entrée : cette liste
 * ne consulte jamais une table de référence (AD-1). Les sous-totaux de repas
 * sont sommés ici, à l'affichage, pour la même raison — il n'y a rien à
 * redemander à la base, tout est déjà dans les lignes.
 *
 * En lecture seule (`deletable` à faux) pour l'historique, où aucune
 * modification n'est possible : c'est la garantie des macros figées rendue
 * visible dans l'interface, et non une fonctionnalité oubliée.
 *
 * Sur le journal du jour (`favoritable`), l'étoile d'un repas l'enregistre en
 * favori : le petit-déjeuner qu'on refait chaque matin se note une fois, puis
 * s'ajoute d'un appui depuis « Mes favoris ».
 */

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <div className="flex items-center gap-3 border-t border-divider py-2.5">
      <Avatar aria-hidden className="size-8">
        <AvatarFallback className="bg-nutri-soft text-xs font-semibold text-nutri-ink uppercase">
          {entry.foodLabel.trim().charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{entry.foodLabel}</p>
        <p className="tabular mt-px text-[12.5px] text-muted-foreground">
          {formatGrams(entry.quantityG)} g
        </p>
      </div>
      <p className="font-medium text-muted-foreground">{formatKcal(entry.macros.kcal)}</p>
    </div>
  );
}

/**
 * La barre empilée d'un repas : la part de chaque macro dans son énergie.
 * Le total en kilocalories est écrit à côté, la couleur ne porte rien seule.
 */
function MacroStrip({ section }: { section: MealSection }) {
  const { proteinG, carbsG, fatG } = section.macros;
  const parts = [
    { share: proteinG * 4, className: 'bg-protein' },
    { share: carbsG * 4, className: 'bg-carb' },
    { share: fatG * 9, className: 'bg-fat' },
  ];
  return (
    <span aria-hidden className="flex h-[7px] w-16 flex-none gap-px overflow-hidden rounded-full bg-track">
      {parts.map((part, index) =>
        part.share > 0 ? (
          <span key={index} className={part.className} style={{ flexGrow: part.share }} />
        ) : null,
      )}
    </span>
  );
}

export function MealJournal({
  entries,
  deletable = false,
  favoritable = false,
  initiallyOpen = false,
}: {
  entries: readonly Entry[];
  deletable?: boolean;
  /** Propose d'enregistrer chaque repas en favori. Journal du jour seulement. */
  favoritable?: boolean;
  /** Repas dépliés d'emblée. Aujourd'hui les replie, l'historique les montre. */
  initiallyOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<Meal>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<Meal>>(new Set());
  const router = useRouter();
  const [removing, setRemoving] = useState<ReadonlySet<number>>(new Set());
  const [naming, setNaming] = useState<{ meal: Meal; label: string } | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReadonlySet<Meal>>(new Set());

  async function submitFavorite(event: React.FormEvent) {
    event.preventDefault();
    if (naming === null) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    const outcome = await saveFavorite(naming.meal, name.trim() === '' ? null : name.trim());
    setSaving(false);
    if (outcome.kind === 'ok') {
      setSaved((previous) => new Set(previous).add(naming.meal));
      setNaming(null);
      return;
    }
    setSaveError(outcome.message ?? 'Le favori n’a pas pu être enregistré.');
  }

  async function remove(id: number) {
    const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      return;
    }
    // Retrait optimiste, puis rafraîchissement serveur pour les totaux (FR-5).
    setRemoving((previous) => new Set(previous).add(id));
    router.refresh();
  }

  const sections = groupByMeal(entries.filter((entry) => !removing.has(entry.id)));

  return (
    <>
      <div className="rounded-xl border bg-card px-3.5 py-1">
        {sections.map((section, index) => {
          const open = initiallyOpen
            ? !collapsed.has(section.meal)
            : expanded.has(section.meal);
          const toggle = () => {
            const flip = (previous: ReadonlySet<Meal>) => {
              const next = new Set(previous);
              if (next.has(section.meal)) {
                next.delete(section.meal);
              } else {
                next.add(section.meal);
              }
              return next;
            };
            if (initiallyOpen) {
              setCollapsed(flip);
            } else {
              setExpanded(flip);
            }
          };
          return (
            <section
              key={section.meal}
              aria-label={section.label}
              className={cn(index > 0 && 'border-t border-divider')}
            >
              <div className="flex items-center gap-2.5 py-2.5">
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <h2 className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {section.label}
                  </h2>
                  <MacroStrip section={section} />
                  <span className="w-11 text-right font-semibold">
                    {formatKcal(section.macros.kcal)}
                  </span>
                  <ChevronDownIcon
                    aria-hidden
                    className={cn(
                      'size-4 flex-none text-faint transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                </button>
              </div>

              {open ? (
                <div className="pb-1">
                  <ul>
                    {section.entries.map((entry) =>
                      deletable ? (
                        <SwipeToDeleteRow
                          key={entry.id}
                          label={entry.foodLabel}
                          onDelete={() => remove(entry.id)}
                        >
                          <EntryRow entry={entry} />
                        </SwipeToDeleteRow>
                      ) : (
                        <li key={entry.id}>
                          <EntryRow entry={entry} />
                        </li>
                      ),
                    )}
                  </ul>
                  {favoritable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mb-1 -ml-2 text-nutri-ink"
                      onClick={() => {
                        setName(suggestFavoriteName(section.entries));
                        setSaveError(null);
                        setNaming({ meal: section.meal, label: section.label });
                      }}
                    >
                      <StarIcon
                        className={saved.has(section.meal) ? 'fill-current' : undefined}
                      />
                      {saved.has(section.meal) ? 'En favori' : 'Mettre en favori'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <Dialog open={naming !== null} onOpenChange={(open) => (open ? undefined : setNaming(null))}>
        <DialogContent>
          <form onSubmit={(event) => void submitFavorite(event)}>
            <DialogHeader>
              <DialogTitle>Repas favori</DialogTitle>
              <DialogDescription>
                {naming === null
                  ? ''
                  : `${naming.label} d’aujourd’hui, à refaire d’un appui depuis « Mes favoris ».`}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="favorite-name">Nom</Label>
              <Input
                id="favorite-name"
                value={name}
                maxLength={MAX_FAVORITE_NAME}
                onChange={(event) => setName(event.target.value)}
              />
              {saveError !== null ? (
                <p role="alert" className="text-[13px] text-destructive">
                  {saveError}
                </p>
              ) : null}
            </div>
            <DialogFooter className="mt-5">
              <Button type="submit" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
