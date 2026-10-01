import {
  ActivityIcon,
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  SettingsIcon,
  SunMoonIcon,
  TrendingUpIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppearanceForm } from '@/app/settings/appearance/AppearanceForm';
import { ReminderSwitch } from '@/app/settings/AccountRows';
import { requireUserId } from '@/server/guard';
import { hasIngestToken } from '@/server/db/queries/users';
import { bridgeStatus, lastWeighIn, weightHistory } from '@/server/services/profile';
import { pushPublicKey } from '@/server/services/reminders';
import { identityFor } from '@/server/services/social';
import { gymCatalog, preferencesFor, progressOverview } from '@/server/services/workouts';
import { todayInParis } from '@/lib/date';
import { initialsOf } from '@/lib/social';
import { THEME_COOKIE, readAppearance } from '@/lib/theme';
import { weightChange } from '@/lib/weight';
import { formatSet } from '@/lib/workout';
import { recordsSince } from '@/lib/workout-progress';
import { cn } from '@/lib/utils';
import { WeighInButton } from './WeighInButton';

export const dynamic = 'force-dynamic';

/** Semaines de la carte Poids et de la régularité : un trimestre. */
const WEEKS = 12;

function formatKg(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const ROW = 'flex items-center gap-3 px-3.5 py-[11px]';

/**
 * Moi (maquette 5a, écran 6) : le corps et la progression, puis les réglages
 * qui tiennent sur une ligne. Le reste — objectif, code de secours, export,
 * suppression — vit dans « Compte et données ».
 *
 * Composant serveur ; l'apparence, le rappel et la pesée sont des îlots
 * client (AD-10).
 */
export default async function MePage() {
  const userId = await requireUserId();
  const store = await cookies();
  const appearance = readAppearance(store.get(THEME_COOKIE)?.value);
  const today = todayInParis();

  const [identity, preferences, gyms, weights, last, progress, bridge, tokenExists] =
    await Promise.all([
      identityFor(userId),
      preferencesFor(userId),
      gymCatalog(),
      weightHistory(userId, WEEKS),
      lastWeighIn(userId),
      progressOverview(userId, WEEKS),
      bridgeStatus(userId),
      hasIngestToken(userId),
    ]);

  const name = identity.displayName ?? (identity.handle === null ? 'Moi' : `@${identity.handle}`);
  const gym = gyms.find((item) => item.id === preferences.gymId)?.name ?? null;

  const weighed = weights.filter((week) => week.weightKg !== null);
  const weekAverage = weighed[weighed.length - 1]?.weightKg ?? null;
  const change = weightChange(weights.slice(-5));
  const values = weights.map((week) => week.weightKg);
  const known = values.filter((value): value is number => value !== null);
  const low = Math.min(...known);
  const high = Math.max(...known);

  const monthStart = `${today.slice(0, 8)}01`;
  const records = recordsSince(progress.exercises, monthStart);
  const topRecord = records[0];
  const activeWeeks = progress.weeks.filter((week) => week.sessions > 0).length;

  const bridgeLabel = !tokenExists
    ? 'Inactif'
    : bridge.dayCount >= bridge.requiredDays
      ? 'Actif'
      : 'En attente';

  return (
    <div className="flex flex-col gap-3 pt-3 pb-4">
      <div className="flex items-center justify-between px-1">
        <Link href="/" className="-ml-1.5 flex items-center gap-1 text-sm font-medium">
          <ChevronLeftIcon aria-hidden className="size-5" />
          Retour
        </Link>
        <Link href="/settings" aria-label="Compte et données" className="text-muted-foreground">
          <SettingsIcon aria-hidden className="size-5" />
        </Link>
      </div>

      <header className="flex items-center gap-3 px-1">
        <span
          aria-hidden
          className="flex size-12 flex-none items-center justify-center rounded-full bg-body text-base font-semibold text-body-on"
        >
          {initialsOf(identity.displayName ?? identity.handle)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.03em]">{name}</h1>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {gym === null ? 'Salle non précisée' : gym} · {preferences.sessionsPerWeek} séances par
            semaine
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <section aria-label="Poids" className="col-span-2 flex flex-col gap-2.5 rounded-xl bg-body-soft p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11.5px] font-semibold text-body-ink">Poids · moyenne de la semaine</p>
              <p className="text-[26px] font-semibold tracking-[-0.03em]">
                {weekAverage === null ? '—' : formatKg(weekAverage)}{' '}
                <span className="text-[13px] font-medium text-muted-foreground">kg</span>{' '}
                {change !== null && change !== 0 ? (
                  <span className="text-[13px] font-bold text-body-ink">
                    {change > 0 ? '+' : '−'}
                    {formatKg(Math.abs(change))}
                  </span>
                ) : null}
              </p>
            </div>
            <WeighInButton last={last} />
          </div>
          <div aria-hidden className="flex h-[70px] items-end gap-[5px]">
            {values.map((value, index) => (
              <div
                key={weights[index]?.weekStart ?? index}
                className={cn(
                  'flex-1 rounded-[4px]',
                  value === null ? 'bg-body-mid/40' : index === values.length - 1 ? 'bg-body' : 'bg-body-mid',
                )}
                style={{
                  height:
                    value === null
                      ? '6%'
                      : `${known.length < 2 || high === low ? 60 : 45 + ((value - low) / (high - low)) * 45}%`,
                }}
              />
            ))}
          </div>
        </section>

        <div className="rounded-xl bg-sport-soft p-3.5">
          <p className="text-[11.5px] font-semibold text-sport-ink">Records ce mois</p>
          <p className="text-[22px] font-semibold">{records.length}</p>
          <p className="truncate text-xs text-muted-foreground">
            {topRecord === undefined
              ? 'Aucun pour l’instant'
              : `${topRecord.exercise.name} ${formatSet(topRecord.record.best)}`}
          </p>
        </div>
        <div className="rounded-xl bg-sport-soft p-3.5">
          <p className="text-[11.5px] font-semibold text-sport-ink">Régularité</p>
          <p className="text-[22px] font-semibold">
            {activeWeeks}/{WEEKS}
          </p>
          <p className="text-xs text-muted-foreground">semaines actives</p>
        </div>

        <Link
          href="/training/progress"
          className="col-span-2 flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3"
        >
          <TrendingUpIcon aria-hidden className="size-[18px] text-sport-ink" />
          <span className="flex-1 text-sm font-medium">Progression détaillée</span>
          <ChevronRightIcon aria-hidden className="size-4 text-faint" />
        </Link>
      </div>

      <ul className="overflow-hidden rounded-xl border bg-card">
        <li className={cn(ROW, 'border-b border-divider')}>
          <SunMoonIcon aria-hidden className="size-[17px] text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Apparence</span>
          <AppearanceForm initial={appearance} compact />
        </li>
        <li className={cn(ROW, 'border-b border-divider')}>
          <BellIcon aria-hidden className="size-[17px] text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Rappel du déjeuner</span>
          <ReminderSwitch publicKey={pushPublicKey()} />
        </li>
        <li className="border-b border-divider">
          <Link href="/settings/health" className={ROW}>
            <ActivityIcon aria-hidden className="size-[17px] text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Santé</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                bridgeLabel === 'Actif' ? 'bg-sport-soft text-sport-ink' : 'bg-muted text-muted-foreground',
              )}
            >
              {bridgeLabel}
            </span>
          </Link>
        </li>
        <li>
          <Link href="/settings" className={ROW}>
            <KeyRoundIcon aria-hidden className="size-[17px] text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Compte et données</span>
            <ChevronRightIcon aria-hidden className="size-4 text-faint" />
          </Link>
        </li>
      </ul>
    </div>
  );
}
