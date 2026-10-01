'use client';

import { CookingPotIcon, DumbbellIcon, FlameIcon, PlayIcon, ScaleIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { journalMeal } from '@/lib/client/plan';
import { startSession } from '@/lib/client/training';
import { formatKcal } from '@/lib/nutrition';
import type { QuickSession } from '@/lib/quick-add';
import { cn } from '@/lib/utils';

/**
 * Les quatre tuiles d'Aujourd'hui (maquette 5a) : la séance du jour, le plat
 * de ce soir, le poids et l'activité. Chacune porte la couleur de son domaine
 * et un seul geste.
 *
 * Composant client pour ces gestes seulement : commencer la séance et manger
 * le plat prévu écrivent, puis rafraîchissent l'écran.
 */

export interface PlannedTonight {
  planId: number;
  /** « Ce soir » pour un dîner, « Ce midi » pour un déjeuner. */
  heading: string;
  name: string;
  kcal: number | null;
  servings: number;
  eaten: boolean;
}

export interface WeightTile {
  latestKg: number;
  /** Écart sur la période affichée, en kilos, ou `null` faute de deux semaines. */
  changeKg: number | null;
  /** Moyennes hebdomadaires, la plus ancienne en tête ; `null` pour une semaine sans pesée. */
  weeks: (number | null)[];
}

export interface ActivityTile {
  /** Calories actives du jour reçues de Santé, ou `null` si rien n'est arrivé. */
  activeKcal: number | null;
  sessionsDone: number;
  sessionsPlanned: number;
}

function Header({
  label,
  icon: Icon,
  className,
}: {
  label: string;
  icon: typeof ScaleIcon;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-[11.5px] font-semibold">{label}</span>
      <Icon aria-hidden className="size-4" />
    </div>
  );
}

function formatKg(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) {
    return <div className="h-[22px]" />;
  }
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const step = 140 / (values.length - 1);
  const points = values
    .map((value, index) =>
      value === null ? null : `${Math.round(index * step)},${Math.round(4 + ((max - value) / span) * 20)}`,
    )
    .filter((point): point is string => point !== null)
    .join(' ');
  return (
    <svg viewBox="0 0 140 28" aria-hidden className="h-[22px] w-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="var(--body)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TodayTiles({
  session,
  tonight,
  weight,
  activity,
}: {
  session: QuickSession | null;
  tonight: PlannedTonight | null;
  weight: WeightTile | null;
  activity: ActivityTile;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'session' | 'meal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function begin(templateId: number) {
    setBusy('session');
    setError(null);
    const outcome = await startSession(templateId);
    setBusy(null);
    if (outcome.kind === 'started') {
      router.push(`/training/session/${outcome.id}`);
      return;
    }
    setError('La séance n’a pas pu être ouverte.');
  }

  async function eat(planId: number) {
    setBusy('meal');
    setError(null);
    const outcome = await journalMeal(planId);
    setBusy(null);
    if (outcome.kind === 'journaled') {
      router.refresh();
      return;
    }
    setError(outcome.kind === 'refused' ? outcome.message : 'Le plat n’a pas pu être noté.');
  }

  const pill =
    'flex h-8 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-bold disabled:opacity-60';

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {/* Séance du jour */}
        <div className="flex min-h-32 flex-col gap-2.5 rounded-xl bg-sport p-3.5 text-sport-on">
          <Header label={session?.kind === 'open' ? 'Séance en cours' : 'Séance du jour'} icon={DumbbellIcon} className="[&>span]:font-medium [&>span]:opacity-85" />
          <p className="flex-1 text-base leading-tight font-semibold">
            {session === null ? 'Pas de programme' : session.name}
          </p>
          {session?.kind === 'open' ? (
            <Link href={`/training/session/${session.sessionId}`} className={cn(pill, 'bg-white text-sport')}>
              <PlayIcon aria-hidden className="size-3 fill-current" />
              Reprendre
            </Link>
          ) : session?.kind === 'next' ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void begin(session.templateId)}
              className={cn(pill, 'bg-white text-sport')}
            >
              <PlayIcon aria-hidden className="size-3 fill-current" />
              {busy === 'session' ? 'Ouverture…' : 'Commencer'}
            </button>
          ) : (
            <Link href="/training/preferences" className={cn(pill, 'bg-white text-sport')}>
              Composer
            </Link>
          )}
        </div>

        {/* Le plat prévu */}
        <div className="flex min-h-32 flex-col gap-2.5 rounded-xl bg-cook-soft p-3.5">
          <Header label={tonight?.heading ?? 'Ce soir'} icon={CookingPotIcon} className="text-cook-ink" />
          <div className="flex-1">
            <p className="text-[15px] leading-tight font-semibold">
              {tonight === null ? 'Rien de prévu' : tonight.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {tonight === null
                ? 'Le plan de la semaine'
                : `${tonight.kcal === null ? '' : `${formatKcal(tonight.kcal)} kcal · `}${tonight.servings} part${tonight.servings > 1 ? 's' : ''}`}
            </p>
          </div>
          {tonight === null ? (
            <Link href="/kitchen" className={cn(pill, 'bg-cook text-cook-on')}>
              Planifier
            </Link>
          ) : tonight.eaten ? (
            <span className={cn(pill, 'bg-card text-cook-ink')}>Noté</span>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void eat(tonight.planId)}
              className={cn(pill, 'bg-cook text-cook-on')}
            >
              {busy === 'meal' ? 'Enregistrement…' : 'Manger'}
            </button>
          )}
        </div>

        {/* Poids */}
        <Link href="/me" className="flex flex-col gap-1.5 rounded-xl bg-body-soft p-3.5">
          <Header label="Poids" icon={ScaleIcon} className="text-body-ink" />
          {weight === null ? (
            <>
              <p className="text-xl font-semibold tracking-[-0.02em]">—</p>
              <p className="text-[11.5px] text-muted-foreground">Touche + puis Pesée</p>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold tracking-[-0.02em]">
                {formatKg(weight.latestKg)}{' '}
                <span className="text-xs font-medium text-muted-foreground">kg</span>{' '}
                {weight.changeKg !== null && weight.changeKg !== 0 ? (
                  <span className="text-xs font-bold text-body-ink">
                    {weight.changeKg > 0 ? '+' : '−'}
                    {formatKg(Math.abs(weight.changeKg))}
                  </span>
                ) : null}
              </p>
              <Sparkline values={weight.weeks} />
            </>
          )}
        </Link>

        {/* Activité */}
        <Link href="/settings/health" className="flex flex-col gap-1.5 rounded-xl bg-body-soft p-3.5">
          <Header label="Activité (Santé)" icon={FlameIcon} className="text-body-ink" />
          <p className="text-xl font-semibold tracking-[-0.02em]">
            {activity.activeKcal === null ? '—' : formatKcal(activity.activeKcal)}{' '}
            <span className="text-xs font-medium text-muted-foreground">kcal</span>
          </p>
          <div className="flex gap-[3px]" aria-hidden>
            {Array.from({ length: Math.max(activity.sessionsPlanned, 1) }, (_, index) => (
              <span
                key={index}
                className={cn(
                  'h-[5px] flex-1 rounded-full',
                  index < activity.sessionsDone ? 'bg-sport' : 'bg-sport-mid',
                )}
              />
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            {activity.sessionsDone} séance{activity.sessionsDone > 1 ? 's' : ''} sur{' '}
            {activity.sessionsPlanned}
          </p>
        </Link>
      </div>
      {error !== null ? (
        <p role="alert" className="px-1 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
