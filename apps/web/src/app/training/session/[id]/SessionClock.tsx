import { TimerIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEFAULT_REST_SECONDS, formatClock } from '@/lib/workout';

/**
 * La durée de la séance et le repos entre deux séries.
 *
 * Les deux se calculent depuis une heure fixe, jamais en décomptant seconde
 * par seconde. Entre deux séries, le téléphone se verrouille : le navigateur
 * suspend alors ses minuteries, et un décompte reprendrait là où il s'était
 * figé. Une échéance, elle, reste juste au déverrouillage.
 *
 * La fin du repos vibre là où le téléphone le permet. iOS ne le permet pas ;
 * la ligne change alors de couleur, ce qui se voit d'un coup d'œil posé sur
 * le banc.
 */

const STEP_SECONDS = 15;

export interface Rest {
  /** Échéance, en millisecondes depuis l'époque. */
  endsAt: number;
}

export function SessionClock({
  startedAt,
  rest,
  onRestChange,
}: {
  startedAt: Date;
  rest: Rest | null;
  onRestChange: (rest: Rest | null) => void;
}) {
  // Nul avant le montage : l'heure du serveur n'est pas celle du téléphone,
  // et l'afficher ferait différer le rendu hydraté du rendu serveur.
  const [now, setNow] = useState<number | null>(null);
  const rang = useRef<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const remaining = rest === null || now === null ? null : Math.ceil((rest.endsAt - now) / 1000);
  const over = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (over && rest !== null && rang.current !== rest.endsAt) {
      rang.current = rest.endsAt;
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [over, rest]);

  function adjust(seconds: number) {
    if (rest === null || now === null) {
      return;
    }
    // Rallonger un repos déjà fini repart de maintenant, pas de l'échéance
    // passée : sinon « +15 s » n'ajouterait rien.
    const base = Math.max(rest.endsAt, now);
    onRestChange({ endsAt: Math.max(now, base + seconds * 1000) });
  }

  const elapsed = now === null ? null : (now - new Date(startedAt).getTime()) / 1000;

  return (
    <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
      <p className="tabular text-[13px] text-muted-foreground">
        Séance{' '}
        <span className="font-medium text-foreground">
          {elapsed === null ? '—' : formatClock(elapsed)}
        </span>
      </p>

      {rest === null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRestChange({ endsAt: Date.now() + DEFAULT_REST_SECONDS * 1000 })}
        >
          <TimerIcon />
          Repos {formatClock(DEFAULT_REST_SECONDS)}
        </Button>
      ) : (
        <div className="flex items-center gap-1.5">
          <p
            role="timer"
            aria-live={over ? 'assertive' : 'off'}
            className={cn(
              'tabular mr-1 text-[15px] font-semibold',
              over ? 'text-primary' : 'text-foreground',
            )}
          >
            {over ? 'Repos terminé' : `Repos ${remaining === null ? '—' : formatClock(remaining)}`}
          </p>
          {over ? null : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => adjust(-STEP_SECONDS)}
                aria-label={`Raccourcir le repos de ${STEP_SECONDS} secondes`}
                className="tabular px-2"
              >
                −{STEP_SECONDS}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => adjust(STEP_SECONDS)}
                aria-label={`Rallonger le repos de ${STEP_SECONDS} secondes`}
                className="tabular px-2"
              >
                +{STEP_SECONDS}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRestChange(null)}
            aria-label={over ? 'Fermer le repos' : 'Passer le repos'}
          >
            <XIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
