'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { QuantityPad } from '@/components/QuantityPad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildQuantityShortcuts, type QuantityShortcut } from '@/lib/shortcuts';
import { createEntry, fetchRecentQuantities } from '@/lib/client/entries';
import { isValidNutrient } from '@/lib/nutrition';
import type { Meal } from '@/lib/meal';
import type { Macros } from '@/lib/types';

/**
 * Saisie ad hoc d'une entrée (FR-25).
 *
 * Deux étapes : la fiche pour 100 g, puis la quantité. Rien n'est ajouté au
 * cache produits ni aux aliments CIQUAL — une entrée ad hoc ne pollue aucune
 * table de référence.
 */

type Step =
  | { name: 'food' }
  | { name: 'quantity'; foodLabel: string; per100g: Macros; shortcuts: QuantityShortcut[] };

const FIELDS = [
  { key: 'kcal', label: 'Énergie (kcal)' },
  { key: 'proteinG', label: 'Protéines (g)' },
  { key: 'carbsG', label: 'Glucides (g)' },
  { key: 'fatG', label: 'Lipides (g)' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

export function ManualEntryFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'food' });
  const [foodLabel, setFoodLabel] = useState('');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parsedMacros(): Macros | null {
    const parsed = {} as Macros;
    for (const field of FIELDS) {
      const raw = values[field.key].trim().replace(',', '.');
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value) || !isValidNutrient(value)) {
        return null;
      }
      parsed[field.key] = value;
    }
    return parsed;
  }

  const macros = parsedMacros();
  const foodReady = foodLabel.trim().length > 0 && macros !== null;

  async function goToQuantity() {
    if (!macros) {
      return;
    }
    const label = foodLabel.trim();
    const recent = await fetchRecentQuantities('manual', null, label);
    setStep({
      name: 'quantity',
      foodLabel: label,
      per100g: macros,
      shortcuts: buildQuantityShortcuts({ recentQuantities: recent }),
    });
  }

  async function save(quantityG: number, meal: Meal) {
    if (step.name !== 'quantity') {
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await createEntry({
      foodLabel: step.foodLabel,
      per100g: step.per100g,
      quantityG,
      sourceKind: 'manual',
      sourceRef: null,
      meal,
    });

    if (result.kind === 'created') {
      // Retour systématique au journal après un enregistrement (UX-DR-7).
      router.replace('/');
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(
      result.kind === 'unauthorized'
        ? 'Session expirée.'
        : result.kind === 'invalid'
          ? 'Quantité invalide.'
          : 'Enregistrement impossible.',
    );
  }

  if (step.name === 'quantity') {
    return (
      <>
        <NavHeader
          label="Saisir à la main"
          onDismiss={() => {
            setError(null);
            setStep({ name: 'food' });
          }}
        />
        <QuantityPad
          foodLabel={step.foodLabel}
          sourceLabel="Saisie manuelle"
          per100g={step.per100g}
          shortcuts={step.shortcuts}
          submitting={submitting}
          onSubmit={save}
        />
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </>
    );
  }

  return (
    <>
      <NavHeader label="Ajouter" href="/add" />
      <PageTitle
        title="Saisir à la main"
        description="Rien n'est ajouté aux tables de référence."
        className="mb-5"
      />

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void goToQuantity();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="foodLabel">Désignation</Label>
          <Input
            id="foodLabel"
            name="foodLabel"
            type="text"
            required
            maxLength={200}
            autoComplete="off"
            placeholder="Tarte aux poireaux, maison"
            value={foodLabel}
            onChange={(event) => setFoodLabel(event.target.value)}
          />
        </div>

        <Card>
          <CardContent>
            <fieldset aria-labelledby="manual-values">
              <CardTitle id="manual-values" className="text-[13.5px]">
                Valeurs pour 100 g
              </CardTitle>
              <div className="grid grid-cols-2 gap-3 pt-3">
                {FIELDS.map((field) => (
                  <div key={field.key} className="grid min-w-0 gap-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      name={field.key}
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
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <BottomBar>
          <Button type="submit" disabled={!foodReady} className="w-full">
            Continuer
          </Button>
        </BottomBar>
      </form>
    </>
  );
}
