'use client';

import { StarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { groupByMeal } from '@/lib/journal';
import type { Meal } from '@/lib/meal';
import { formatGrams, formatKcal } from '@/lib/nutrition';
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
    <div className="flex items-center gap-3 border-b py-2.5">
      <Avatar aria-hidden className="size-[34px]">
        <AvatarFallback className="text-xs font-semibold uppercase">
          {entry.foodLabel.trim().charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-medium tracking-tight">{entry.foodLabel}</p>
        <p className="tabular mt-px text-[12.5px] text-muted-foreground">
          {formatGrams(entry.quantityG)} g
        </p>
      </div>
      <p className="tabular font-medium">{formatKcal(entry.macros.kcal)}</p>
    </div>
  );
}

export function MealJournal({
  entries,
  deletable = false,
  favoritable = false,
}: {
  entries: readonly Entry[];
  deletable?: boolean;
  /** Propose d'enregistrer chaque repas en favori. Journal du jour seulement. */
  favoritable?: boolean;
}) {
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
      {sections.map((section) => (
        <section key={section.meal} aria-label={section.label}>
          <div className="flex items-center justify-between pt-[18px] pb-1.5">
            <h2 className="text-[13px] font-semibold tracking-tight">{section.label}</h2>
            <div className="flex items-center gap-1">
              {favoritable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={`Enregistrer « ${section.label} » en favori`}
                  onClick={() => {
                    setName(suggestFavoriteName(section.entries));
                    setSaveError(null);
                    setNaming({ meal: section.meal, label: section.label });
                  }}
                >
                  <StarIcon
                    className={saved.has(section.meal) ? 'fill-primary text-primary' : undefined}
                  />
                </Button>
              ) : null}
              <Badge variant="secondary" className="tabular">
                {formatKcal(section.macros.kcal)} kcal
              </Badge>
            </div>
          </div>

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
        </section>
      ))}

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
