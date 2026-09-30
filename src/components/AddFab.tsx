'use client';

import { DumbbellIcon, PlusIcon, ScaleIcon, UtensilsIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MealSheet, SessionSheet, WeighInSheet, type QuickSheetProps } from './QuickSheets';
import { fetchQuickAdd } from '@/lib/client/quick-add';
import { hourInParis } from '@/lib/date';
import { mealForHour } from '@/lib/meal';
import type { QuickAddContext } from '@/lib/quick-add';
import { cn } from '@/lib/utils';

/**
 * Le bouton + du centre de la barre, en arc (maquette 6a).
 *
 * Un appui le fait tourner en ×, assombrit l'écran et sort trois bulles en
 * arc : Séance à gauche, Repas au sommet, Pesée à droite. Chacune ouvre sa
 * feuille. Un appui long saute tout cela et ouvre le scanner, le geste le plus
 * fréquent de la journée. Le fond ou le × referment.
 *
 * Il demande ses données à l'ouverture, pas au rendu : la barre d'onglets
 * survit aux navigations, et ce qu'elle aurait lu au chargement serait périmé
 * dès le premier repas noté.
 */

type Sheet = 'meal' | 'session' | 'weigh';

/** Durée d'un appui long, en millisecondes. */
const LONG_PRESS_MS = 500;

/** Position de chaque bulle depuis le centre du bouton, en pixels. */
const BUBBLES = [
  {
    sheet: 'session',
    label: 'Séance',
    icon: DumbbellIcon,
    dx: -92,
    dy: -78,
    delay: '0s',
    className: 'size-[54px] bg-sport text-sport-on shadow-[0_8px_20px_-6px_rgb(38_46_87/0.6)]',
  },
  {
    sheet: 'meal',
    label: 'Repas',
    icon: UtensilsIcon,
    dx: 0,
    dy: -128,
    delay: '0.04s',
    className: 'size-[66px] bg-nutri text-nutri-on shadow-[0_8px_22px_-6px_rgb(54_179_126/0.7)]',
  },
  {
    sheet: 'weigh',
    label: 'Pesée',
    icon: ScaleIcon,
    dx: 92,
    dy: -78,
    delay: '0.08s',
    className: 'size-[54px] bg-body text-body-on shadow-[0_8px_20px_-6px_rgb(124_92_252/0.6)]',
  },
] as const satisfies readonly {
  sheet: Sheet;
  label: string;
  icon: typeof DumbbellIcon;
  dx: number;
  dy: number;
  delay: string;
  className: string;
}[];

export function AddFab() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [context, setContext] = useState<QuickAddContext | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const toastTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSheet(null);
  }, []);

  // Rien ne survit à la navigation qu'une bulle ou une feuille a déclenchée.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(
    () => () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setContext(await fetchQuickAdd());
  }, []);

  function showToast(message: string) {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPointerDown() {
    longPressed.current = false;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      close();
      router.push(`/add/scan?meal=${mealForHour(hourInParis())}`);
    }, LONG_PRESS_MS);
  }

  function onClick() {
    cancelPress();
    // L'appui long a déjà ouvert le scanner : le relâcher ne doit rien faire.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (sheet !== null || open) {
      close();
      return;
    }
    setOpen(true);
    void refresh();
  }

  function pick(next: Sheet) {
    setOpen(false);
    setSheet(next);
  }

  const sheetProps: QuickSheetProps = {
    context,
    onClose: close,
    onDone: (message: string) => {
      close();
      showToast(message);
      void refresh();
      router.refresh();
    },
  };

  const dimmed = open;

  return (
    <>
      {/* Le voile : il assombrit tout sauf le bouton et ses bulles, et referme au toucher. */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          'fixed inset-0 z-10 bg-[rgb(28_24_20/0.5)] backdrop-blur-[2px] transition-opacity duration-250',
          dimmed ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div className="relative z-20 flex size-[50px] items-center justify-center">
        {BUBBLES.map((bubble) => {
          const Icon = bubble.icon;
          return (
            <button
              key={bubble.sheet}
              type="button"
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              onClick={() => pick(bubble.sheet)}
              style={{
                transform: open
                  ? `translate(-50%, -50%) translate(${bubble.dx}px, ${bubble.dy}px) scale(1)`
                  : 'translate(-50%, -50%) scale(0.2)',
                transitionDelay: open ? bubble.delay : '0s',
              }}
              className={cn(
                'absolute top-1/2 left-1/2 flex items-center justify-center rounded-full transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(.34,1.56,.64,1)]',
                bubble.className,
                open ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <Icon aria-hidden className={bubble.sheet === 'meal' ? 'size-[26px]' : 'size-[22px]'} />
              <span className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 text-[12.5px] font-bold whitespace-nowrap text-white">
                {bubble.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(event) => event.preventDefault()}
          onClick={onClick}
          aria-expanded={open}
          aria-label={open ? 'Fermer' : 'Ajouter un repas, une séance ou une pesée'}
          className={cn(
            'relative flex size-[50px] touch-none items-center justify-center rounded-full shadow-[0_6px_16px_-4px_rgb(0_0_0/0.35)] transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] select-none [-webkit-touch-callout:none]',
            open ? 'scale-[0.92] bg-card text-foreground' : 'bg-nutri text-nutri-on',
          )}
        >
          <PlusIcon
            aria-hidden
            className={cn(
              'size-6 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]',
              open && 'rotate-[135deg]',
            )}
          />
        </button>
      </div>

      <MealSheet {...sheetProps} open={sheet === 'meal'} />
      <SessionSheet {...sheetProps} open={sheet === 'session'} />
      <WeighInSheet {...sheetProps} open={sheet === 'weigh'} />

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed top-[calc(var(--safe-top)+1rem)] left-1/2 z-[60] rounded-full bg-foreground px-4 py-2.5 text-[13.5px] font-medium whitespace-nowrap text-background transition-[transform,opacity] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]',
          toast === null ? '-translate-x-1/2 -translate-y-5 opacity-0' : '-translate-x-1/2 opacity-100',
        )}
      >
        {toast}
      </div>
    </>
  );
}
