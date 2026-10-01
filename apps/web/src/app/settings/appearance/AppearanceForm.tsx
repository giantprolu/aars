'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  APPEARANCES,
  APPEARANCE_HINTS,
  APPEARANCE_LABELS,
  isAppearance,
  type Appearance,
} from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Choix de l'apparence, en trois segments.
 *
 * Le choix part au serveur, qui le range dans un cookie, puis la page est
 * rafraîchie. Ce détour paraît lourd pour une couleur de fond, mais c'est lui
 * qui permet au serveur de rendre le bon thème dès la première réponse : un
 * basculement fait uniquement dans le navigateur afficherait d'abord la page
 * dans le mauvais thème, le temps que le script s'exécute.
 *
 * `compact` le loge dans une rangée des réglages : les segments seuls, sans la
 * phrase qui explique le choix courant.
 */
export function AppearanceForm({
  initial,
  compact = false,
}: {
  initial: Appearance;
  compact?: boolean;
}) {
  const router = useRouter();
  const [appearance, setAppearance] = useState<Appearance>(initial);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Appearance) {
    if (next === appearance) {
      return;
    }
    const previous = appearance;
    // Bascule optimiste : le sélecteur répond au doigt, pas au réseau.
    setAppearance(next);
    setError(null);

    try {
      const response = await fetch('/api/appearance', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appearance: next }),
      });
      if (!response.ok) {
        setAppearance(previous);
        setError('Réglage non enregistré.');
        return;
      }
      // Le thème est posé sur <html> par le rendu serveur : il faut le refaire.
      router.refresh();
    } catch {
      setAppearance(previous);
      setError('Réglage non enregistré.');
    }
  }

  // Clair, sombre, auto : l'ordre de la maquette, le défaut en dernier.
  const order = [...APPEARANCES.filter((value) => value !== 'auto'), 'auto' as const];

  return (
    <div className={cn(compact ? 'flex flex-col items-end' : '')}>
      <Tabs
        value={appearance}
        onValueChange={(value) => isAppearance(value) && void choose(value)}
      >
        <TabsList aria-label="Apparence" className={compact ? '' : 'w-full'}>
          {order.map((value) => (
            <TabsTrigger key={value} value={value} className={compact ? 'px-2.5' : ''}>
              {APPEARANCE_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {compact ? null : (
        <p className="mt-3 text-muted-foreground">{APPEARANCE_HINTS[appearance]}</p>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
