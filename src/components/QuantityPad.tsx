import { CheckIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomBar } from './BottomBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { MAX_QUANTITY_G, formatGrams, formatKcal, scaleMacros } from '@/lib/nutrition';
import type { Macros } from '@/lib/types';
import { MEALS, MEAL_LABELS, type Meal, isMeal } from '@/lib/meal';
import { useInitialMeal } from '@/lib/client/meal-param';
import type { QuantityShortcut } from '@/lib/shortcuts';

/**
 * Écran de quantité (FR-8, FR-9). Étape terminale commune aux quatre chemins
 * d'ajout : saisie ad hoc, scan, recherche et reconnaissance photo s'y branchent.
 *
 * Deux choses vivent en bas, dans une barre qui ne défile pas : le repas et
 * l'enregistrement. Toute cible tactile fréquente vit dans les deux tiers
 * inférieurs (UX-DR-3), et ces deux-là closent le geste.
 *
 * Le repas est présélectionné d'après l'heure, jamais imposé : c'est une
 * proposition qui tombe juste assez souvent pour que le geste ordinaire soit
 * une simple validation.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis des
 * écrans qui la portent déjà. La poser en ferait une frontière serveur/client
 * où le rappel `onSubmit` devrait être une Server Action.
 */

export type { QuantityShortcut };

/** Pas des boutons moins et plus, en grammes. */
const STEP_G = 10;

export function QuantityPad({
  foodLabel,
  sourceLabel,
  per100g,
  shortcuts,
  submitting,
  onSubmit,
}: {
  foodLabel: string;
  /** Provenance de la fiche : « Ciqual », « Scanné », « Saisie manuelle ». */
  sourceLabel: string;
  per100g: Macros;
  shortcuts: readonly QuantityShortcut[];
  submitting: boolean;
  onSubmit: (quantityG: number, meal: Meal) => void | Promise<void>;
}) {
  const [raw, setRaw] = useState('');
  const initialMeal = useInitialMeal();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const inputRef = useRef<HTMLInputElement>(null);

  // Le champ reçoit le focus à l'ouverture (EXPERIENCE.md, motifs de composants).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const quantity = Number(raw);
  const error = useMemo(() => {
    if (raw.trim() === '') {
      return null;
    }
    if (!/^\d+$/.test(raw.trim())) {
      return 'Saisis un nombre entier de grammes.';
    }
    if (quantity <= 0) {
      return 'La quantité doit être supérieure à zéro.';
    }
    if (quantity >= MAX_QUANTITY_G) {
      return `La quantité doit rester sous ${MAX_QUANTITY_G} g.`;
    }
    return null;
  }, [raw, quantity]);

  const valid = raw.trim() !== '' && error === null;
  const preview = valid ? scaleMacros(per100g, quantity) : null;

  function step(delta: number) {
    const current = /^\d+$/.test(raw.trim()) ? quantity : 0;
    const next = Math.min(MAX_QUANTITY_G - 1, Math.max(0, current + delta));
    setRaw(next === 0 ? '' : String(next));
  }

  return (
    <form
      id="quantity-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !submitting) {
          void onSubmit(quantity, meal);
        }
      }}
    >
      <div className="pt-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-semibold tracking-tight">{foodLabel}</h2>
          <Badge variant="outline">{sourceLabel}</Badge>
        </div>
        <p className="tabular mt-1 text-[13px] text-muted-foreground">
          {formatKcal(per100g.kcal)} kcal · {formatGrams(per100g.proteinG)} P ·{' '}
          {formatGrams(per100g.carbsG)} G · {formatGrams(per100g.fatG)} L, pour 100 g
        </p>
      </div>

      <Separator className="my-4" />

      <Label htmlFor="quantity">Quantité</Label>
      <div className="mt-2 flex items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => step(-STEP_G)}
          aria-label={`Retirer ${STEP_G} g`}
        >
          <MinusIcon className="size-[19px]" />
        </Button>
        <div className="relative flex-1">
          <Input
            id="quantity"
            ref={inputRef}
            name="quantity"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'quantity-error' : undefined}
            className="tabular h-11 pr-8 text-center text-[19px] font-semibold md:text-[19px]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
          >
            g
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => step(STEP_G)}
          aria-label={`Ajouter ${STEP_G} g`}
        >
          <PlusIcon className="size-[19px]" />
        </Button>
      </div>

      {error ? (
        <p id="quantity-error" role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      ) : null}

      {shortcuts.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quantités habituelles">
          {shortcuts.map((shortcut) => {
            const pressed = raw === String(shortcut.grams);
            return (
              <Badge
                key={`${shortcut.label}-${shortcut.grams}`}
                asChild
                variant={pressed ? 'default' : 'outline'}
                className="tabular h-8 px-3 text-[13px]"
              >
                <button
                  type="button"
                  // Renseigne le champ sans valider : l'utilisateur garde la main (FR-9).
                  onClick={() => setRaw(String(shortcut.grams))}
                  aria-pressed={pressed}
                >
                  {pressed ? <CheckIcon /> : null}
                  {shortcut.label}
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}

      <Separator className="mt-5 mb-3.5" />

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-muted-foreground">Ajouté au journal</p>
          <p className="tabular mt-px text-[25px] font-semibold tracking-tight">
            {preview ? `${formatKcal(preview.kcal)} kcal` : '—'}
          </p>
        </div>
        {preview ? (
          <p className="tabular text-right text-[12.5px] text-muted-foreground">
            {formatGrams(preview.proteinG)} g P
            <br />
            {formatGrams(preview.carbsG)} g G
            <br />
            {formatGrams(preview.fatG)} g L
          </p>
        ) : null}
      </div>

      <BottomBar className="flex gap-2.5">
        <Select value={meal} onValueChange={(value) => isMeal(value) && setMeal(value)}>
          <SelectTrigger aria-label="Repas" className="h-10 flex-1 data-[size=default]:h-10">
            <span className="text-muted-foreground">Repas :</span>
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
        <Button type="submit" disabled={!valid || submitting} className="flex-1">
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </BottomBar>
    </form>
  );
}
