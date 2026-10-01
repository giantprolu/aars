import { ChevronLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { requireUserId } from '@/server/guard';
import { weightHistory } from '@/server/services/profile';
import { progressOverview } from '@/server/services/workouts';
import { formatChange, formatMetric } from '@/lib/workout-progress';
import { weightChange } from '@/lib/weight';
import { cn } from '@/lib/utils';

// Les séances viennent du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/** Les trois périodes de la maquette, en semaines. */
const PERIODS = [
  { weeks: 4, label: '4 sem.' },
  { weeks: 12, label: '12 sem.' },
  { weeks: 52, label: '1 an' },
] as const;

type PeriodWeeks = (typeof PERIODS)[number]['weeks'];

function readPeriod(raw: string | undefined): PeriodWeeks {
  const found = PERIODS.find((period) => String(period.weeks) === raw);
  return found?.weeks ?? 12;
}

/** Moyenne d'une liste, zéro si elle est vide. */
function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * La progression (maquette 5a, écran 7 : Moi › Progression).
 *
 * Le tonnage semaine après semaine, en bâtons, et le poids moyen par-dessus,
 * sur les mêmes semaines. Les deux se lisent ensemble : un poids qui monte
 * avec le tonnage est une prise de muscle probable, un poids qui monte seul
 * ne l'est pas. Puis chaque exercice, sa valeur actuelle et son écart sur la
 * période : c'est là que se voit un mouvement qui stagne.
 *
 * Composant serveur, sans bibliothèque de graphiques : des bâtons et un tracé
 * suffisent, et ne coûtent rien au chargement.
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = readPeriod((await searchParams).period);
  const userId = await requireUserId();
  const [{ weeks, exercises }, weights] = await Promise.all([
    progressOverview(userId, period),
    weightHistory(userId, period),
  ]);

  const sessions = weeks.reduce((total, week) => total + week.sessions, 0);
  const maxVolume = Math.max(1, ...weeks.map((week) => week.volume));

  // Le tonnage compare la seconde moitié de la période à la première.
  const half = Math.floor(weeks.length / 2);
  const before = mean(weeks.slice(0, half).map((week) => week.volume));
  const after = mean(weeks.slice(half).map((week) => week.volume));
  const volumeChange = before > 0 ? Math.round(((after - before) / before) * 100) : null;
  const change = weightChange(weights);

  // Le poids, ramené dans la hauteur du graphique avec une marge en haut et en bas.
  const weighed = weights
    .map((week, index) => ({ index, value: week.weightKg }))
    .filter((point): point is { index: number; value: number } => point.value !== null);
  const low = Math.min(...weighed.map((point) => point.value));
  const high = Math.max(...weighed.map((point) => point.value));
  const span = high - low || 1;
  const columnWidth = 330 / weeks.length;
  const weightPoints = weighed
    .map(
      (point) =>
        `${Math.round(point.index * columnWidth + columnWidth / 2)},${Math.round(20 + ((high - point.value) / span) * 70)}`,
    )
    .join(' ');

  return (
    <div className="flex flex-col gap-3 pt-3 pb-4">
      <Link href="/me" className="-ml-0.5 flex items-center gap-1 text-sm font-medium">
        <ChevronLeftIcon aria-hidden className="size-5" />
        Moi
      </Link>

      <header className="flex items-end justify-between gap-3 px-1">
        <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em]">Progression</h1>
        <nav aria-label="Période" className="flex rounded-full bg-track/70 p-0.5 text-xs font-medium">
          {PERIODS.map((item) => (
            <Link
              key={item.weeks}
              href={`/training/progress?period=${item.weeks}`}
              aria-current={item.weeks === period ? 'page' : undefined}
              className={cn(
                'rounded-full px-2.5 py-1',
                item.weeks === period ? 'bg-card font-semibold' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section aria-label="Tonnage et poids" className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold">Tonnage et poids</h2>
          <div className="flex gap-3 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-[2px] bg-sport" />
              tonnage
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden className="h-[3px] w-2.5 rounded-[2px] bg-body" />
              poids
            </span>
          </div>
        </div>
        <div className="relative h-[130px]">
          <div aria-hidden className={cn('absolute inset-0 flex items-end', period === 52 ? 'gap-[2px]' : 'gap-1.5')}>
            {weeks.map((week, index) => (
              <div
                key={week.weekStart}
                className={cn(
                  'flex-1 rounded-[4px]',
                  index === weeks.length - 1 ? 'bg-sport' : 'bg-sport-mid',
                )}
                style={{ height: `${Math.max(2, (week.volume / maxVolume) * 100)}%` }}
              />
            ))}
          </div>
          {weighed.length > 1 ? (
            <svg
              aria-hidden
              viewBox="0 0 330 130"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              <polyline
                points={weightPoints}
                fill="none"
                stroke="var(--body)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : null}
        </div>
        <div className="grid grid-cols-3 border-t border-divider pt-2.5 text-center">
          <div>
            <p className="text-base font-semibold text-sport-ink">{sessions}</p>
            <p className="text-[11px] text-muted-foreground">séances</p>
          </div>
          <div>
            <p className="text-base font-semibold text-sport-ink">
              {volumeChange === null ? '—' : `${volumeChange > 0 ? '+' : volumeChange < 0 ? '−' : ''}${Math.abs(volumeChange)} %`}
            </p>
            <p className="text-[11px] text-muted-foreground">tonnage</p>
          </div>
          <div>
            <p className="text-base font-semibold text-body-ink">
              {change === null
                ? '—'
                : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toLocaleString('fr-FR')} kg`}
            </p>
            <p className="text-[11px] text-muted-foreground">poids</p>
          </div>
        </div>
      </section>

      {exercises.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-center text-[13px] text-muted-foreground">
          Aucune série enregistrée sur cette période.
        </p>
      ) : (
        <section aria-label="Par exercice" className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[1fr_72px_72px] border-b border-divider px-3.5 py-2 text-[11.5px] text-muted-foreground">
            <span>Exercice</span>
            <span className="text-right">1RM est.</span>
            <span className="text-right">Écart</span>
          </div>
          <ul>
            {exercises.map(({ exercise, metric, latest, change: delta }, index) => (
              <li key={exercise.id} className={cn(index > 0 && 'border-t border-divider')}>
                <Link
                  href={`/training/progress/${exercise.id}`}
                  className="grid grid-cols-[1fr_72px_72px] items-center px-3.5 py-2.5"
                >
                  <span className="truncate text-sm font-medium">{exercise.name}</span>
                  <span className="text-right font-semibold">{formatMetric(metric, latest.value)}</span>
                  <span
                    className={cn(
                      'justify-self-end rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
                      delta !== null && delta > 0
                        ? 'bg-sport-soft text-sport-ink'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {delta === null ? '1 séance' : formatChange(metric, delta)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="px-1 text-[12px] text-muted-foreground">
        L’écart compare la dernière séance à la première de la période, sur le 1RM estimé quand
        l’exercice se charge.
      </p>
    </div>
  );
}
