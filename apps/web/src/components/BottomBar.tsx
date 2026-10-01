'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Barre d'actions basse, qui ne défile pas.
 *
 * Toute cible tactile fréquente vit dans les deux tiers inférieurs (UX-DR-3),
 * et l'action qui clôt un écran est la plus fréquente de toutes. Tant que la
 * barre est montée, la barre d'onglets s'efface : les deux occuperaient le
 * même bord, et l'écran qui porte une action à terminer n'est pas un lieu
 * d'où l'on navigue ailleurs.
 *
 * La barre étant fixe, elle est sortie du flux : c'est à la page de réserver
 * sa hauteur, sans quoi son dernier élément finit dessous. Cette hauteur était
 * écrite en dur ; elle ne tenait pas quand la barre portait deux lignes ou une
 * zone sûre profonde, et le contenu passait dessous — d'où la mesure.
 */
export function BottomBar({
  children,
  className,
  surface = 'background',
}: {
  children: React.ReactNode;
  className?: string;
  /** `card` pour une barre qui porte un état, comme le repos d'une séance. */
  surface?: 'background' | 'card';
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = bar.current;
    if (node === null) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setHeight(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/*
        Réserve la hauteur de la barre. La classe sert jusqu'à la première
        mesure, côté serveur et avant hydratation ; ensuite la hauteur réelle
        l'emporte, quelle que soit la profondeur du contenu.
      */}
      <div
        aria-hidden
        className="h-[calc(5.5rem+var(--safe-bottom))]"
        style={height === null ? undefined : { height }}
      />
      <div
        ref={bar}
        data-bottom-bar
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t',
          surface === 'card' ? 'bg-card' : 'bg-background',
        )}
      >
        <div
          className={cn(
            'mx-auto max-w-lg px-5 pt-3 pb-[calc(1.25rem+var(--safe-bottom))]',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}
