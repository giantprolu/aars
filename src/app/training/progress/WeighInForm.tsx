'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveWeighIn } from '@/lib/client/weight';
import { isValidWeighIn } from '@/lib/weight';

/**
 * La pesée du jour, en une ligne.
 *
 * Elle vit ici, sous la courbe, parce que c'est en regardant la courbe qu'on
 * pense à la nourrir. Elle met aussi à jour le poids du profil, dont dépend la
 * cible calorique : se peser suffit à la garder juste.
 */
export function WeighInForm({ lastWeightKg }: { lastWeightKg: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(lastWeightKg === null ? '' : String(lastWeightKg));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const weight = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && isValidWeighIn(weight);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) {
      return;
    }
    setBusy(true);
    const outcome = await saveWeighIn(weight);
    setBusy(false);
    if (outcome.kind === 'ok') {
      setMessage(
        outcome.profileUpdated
          ? 'Pesée enregistrée, cible calorique mise à jour.'
          : 'Pesée enregistrée.',
      );
      router.refresh();
      return;
    }
    setMessage('La pesée n’a pas pu être enregistrée.');
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            type="text"
            inputMode="decimal"
            aria-label="Poids du jour en kilogrammes"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setMessage(null);
            }}
            className="tabular pr-8"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground"
          >
            kg
          </span>
        </div>
        <Button type="submit" disabled={!valid || busy}>
          {busy ? 'Enregistrement…' : 'Peser'}
        </Button>
      </div>
      {message !== null ? (
        <p role="status" className="mt-1.5 text-[12.5px] text-muted-foreground">
          {message}
        </p>
      ) : null}
    </form>
  );
}
