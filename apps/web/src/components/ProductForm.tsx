import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidNutrient } from '@/lib/nutrition';
import type { Macros } from '@/lib/types';

/**
 * Saisie manuelle d'un produit (FR-15).
 *
 * Le seul formulaire long de l'application. Il est acceptable parce qu'il ne se
 * produit qu'une fois par produit : la fiche rejoint le cache et le scan suivant
 * la retrouve directement.
 *
 * Le code-barres n'est pas repris ici : l'écran qui monte ce formulaire
 * l'affiche déjà, et un champ en lecture seule de plus ne ferait qu'éloigner le
 * premier champ réellement saisissable.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis ScanFlow.
 */

const FIELDS = [
  { key: 'kcal', label: 'Énergie (kcal)' },
  { key: 'proteinG', label: 'Protéines (g)' },
  { key: 'carbsG', label: 'Glucides (g)' },
  { key: 'fatG', label: 'Lipides (g)' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

export interface ProductFormValues {
  name: string;
  per100g: Macros;
  servingSizeG: number | null;
}

function initialField(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function ProductForm({
  initialName,
  initialPer100g,
  initialServingSizeG,
  submitting,
  onSubmit,
}: {
  initialName: string | null;
  initialPer100g: Partial<Macros>;
  initialServingSizeG: number | null;
  submitting: boolean;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: initialField(initialPer100g.kcal),
    proteinG: initialField(initialPer100g.proteinG),
    carbsG: initialField(initialPer100g.carbsG),
    fatG: initialField(initialPer100g.fatG),
  });

  function parsed(): Macros | null {
    const macros = {} as Macros;
    for (const field of FIELDS) {
      const raw = values[field.key].trim().replace(',', '.');
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value) || !isValidNutrient(value)) {
        return null;
      }
      macros[field.key] = value;
    }
    return macros;
  }

  const macros = parsed();
  const ready = name.trim().length > 0 && macros !== null;
  const anyMissing = FIELDS.some((field) => initialPer100g[field.key] === undefined);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && macros && !submitting) {
          void onSubmit({
            name: name.trim(),
            per100g: macros,
            servingSizeG: initialServingSizeG,
          });
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="product-name">Nom du produit</Label>
        <Input
          id="product-name"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <Card>
        <CardContent>
          <fieldset aria-labelledby="product-values">
            <CardTitle id="product-values" className="text-[13.5px]">
              Valeurs pour 100 g
            </CardTitle>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
              {FIELDS.map((field) => {
                const missing = initialPer100g[field.key] === undefined;
                return (
                  <div key={field.key} className="grid min-w-0 gap-2">
                    <Label htmlFor={`product-${field.key}`}>
                      {field.label}
                      {missing ? <span className="text-muted-foreground">·</span> : null}
                    </Label>
                    <Input
                      id={`product-${field.key}`}
                      type="text"
                      inputMode="decimal"
                      required
                      autoComplete="off"
                      value={values[field.key]}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                      }
                      className="tabular"
                    />
                  </div>
                );
              })}
            </div>
            {anyMissing ? (
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                Les champs marqués d&apos;un point sont absents de la fiche d&apos;origine.
              </p>
            ) : null}
          </fieldset>
        </CardContent>
      </Card>

      <Button type="submit" disabled={!ready || submitting} className="w-full">
        {submitting ? 'Enregistrement…' : 'Continuer'}
      </Button>
    </form>
  );
}
