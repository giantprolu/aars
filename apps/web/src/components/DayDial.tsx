import Link from 'next/link';
import type { Macros } from '@/lib/types';
import { formatGrams, formatKcal } from '@/lib/nutrition';
import { progressRatio } from '@/lib/journal';
import { cn } from '@/lib/utils';

/**
 * La jauge du jour (maquette 5a, écran Aujourd'hui) : un anneau qui dit ce qui
 * reste, les trois macros en regard, puis trois chiffres — le mangé, la cible,
 * et ce que l'entraînement y ajoute.
 *
 * Sans profil, l'anneau dit le mangé et les barres la part de chaque macro
 * dans l'énergie du jour : des chiffres, aucune opinion. Le dépassement est dit
 * par le nombre, jamais par un anneau qui ferait plus d'un tour.
 */

export interface DayTarget {
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const MACRO_ROWS = [
  { key: 'proteinG', label: 'Protéines', ink: 'text-protein-ink', track: 'bg-protein-soft', fill: 'bg-protein' },
  { key: 'carbsG', label: 'Glucides', ink: 'text-carb-ink', track: 'bg-carb-soft', fill: 'bg-carb' },
  { key: 'fatG', label: 'Lipides', ink: 'text-fat-ink', track: 'bg-fat-soft', fill: 'bg-fat' },
] as const;

/** Un anneau en dégradé conique, `ratio` entre 0 et 1. */
export function Ring({
  ratio,
  size,
  thickness,
  children,
  className,
}: {
  ratio: number;
  size: number;
  thickness: number;
  children: React.ReactNode;
  className?: string;
}) {
  const percent = Math.round(progressRatio(ratio, 1) * 1000) / 10;
  return (
    <div
      className={cn('flex flex-none items-center justify-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--nutri) 0 ${percent}%, var(--nutri-soft) ${percent}% 100%)`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-full bg-card"
        style={{ width: size - thickness * 2, height: size - thickness * 2 }}
      >
        {children}
      </div>
    </div>
  );
}

export function DayDial({
  macros,
  target,
  trainingKcal = null,
  editHref = '/profile',
}: {
  macros: Macros;
  target: DayTarget | null;
  /** Ce que l'entraînement du jour ajoute à la cible, ou `null` s'il n'y en a pas. */
  trainingKcal?: number | null;
  /** Où mène « cible · modifier ». */
  editHref?: string;
}) {
  const remaining = target === null ? null : target.targetKcal - macros.kcal;

  const goals =
    target === null
      ? null
      : { proteinG: target.proteinG, carbsG: target.carbsG, fatG: target.fatG };
  const energyShare = {
    proteinG: macros.proteinG * 4,
    carbsG: macros.carbsG * 4,
    fatG: macros.fatG * 9,
  };

  return (
    <section
      aria-label="Totaux du jour"
      className="flex flex-col gap-3.5 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-[18px]">
        <Ring
          ratio={target === null ? 0 : macros.kcal / target.targetKcal}
          size={112}
          thickness={10}
        >
          <span className="text-[26px] leading-none font-bold tracking-[-0.03em] text-nutri-ink">
            {formatKcal(remaining === null ? macros.kcal : Math.abs(remaining))}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {remaining === null ? 'kcal mangées' : remaining >= 0 ? 'restantes' : 'au-dessus'}
          </span>
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {MACRO_ROWS.map((row) => {
            const ratio =
              goals === null
                ? progressRatio(energyShare[row.key], macros.kcal)
                : progressRatio(macros[row.key], goals[row.key]);
            return (
              <div key={row.key}>
                <div className="flex justify-between text-[12.5px]">
                  <span className={cn('font-medium', row.ink)}>{row.label}</span>
                  <span>
                    <b className="font-semibold">{formatGrams(macros[row.key])}</b>
                    <span className="text-muted-foreground">
                      {goals === null ? ' g' : ` / ${formatGrams(goals[row.key])} g`}
                    </span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={row.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(ratio * 100)}
                  className={cn('mt-1 h-[7px] overflow-hidden rounded-full', row.track)}
                >
                  <div
                    className={cn('h-full rounded-full', row.fill)}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-divider pt-3 text-center">
        <div>
          <p className="text-base font-semibold">{formatKcal(macros.kcal)}</p>
          <p className="text-[11.5px] text-muted-foreground">mangées</p>
        </div>
        <Link href={editHref} className="border-x border-divider">
          <p className="text-base font-semibold">
            {target === null ? '—' : formatKcal(target.targetKcal)}
          </p>
          <p className="text-[11.5px] font-medium text-nutri-ink">
            {target === null ? 'fixer une cible' : 'cible · modifier'}
          </p>
        </Link>
        <div>
          <p className="text-base font-semibold text-sport-ink">
            {trainingKcal === null || trainingKcal === 0
              ? '—'
              : `${trainingKcal > 0 ? '+' : '−'}${formatKcal(Math.abs(trainingKcal))}`}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {trainingKcal !== null && trainingKcal < 0 ? 'repos' : 'entraînement'}
          </p>
        </div>
      </div>
    </section>
  );
}
