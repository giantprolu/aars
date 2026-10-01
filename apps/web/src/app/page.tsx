import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { DayDial } from '@/components/DayDial';
import { MealJournal } from '@/components/MealJournal';
import { UserAvatar } from '@/components/UserAvatar';
import { historyPage, journalForToday } from '@/server/services/entries';
import { requireUserId } from '@/server/guard';
import { planForWeek } from '@/server/services/meal-plan';
import { bridgeStatus, lastWeighIn, targetFor, weightHistory } from '@/server/services/profile';
import { recipesFor } from '@/server/services/recipes';
import { identityFor } from '@/server/services/social';
import { quickSessionFor } from '@/server/services/today';
import { preferencesFor, sessionHistory } from '@/server/services/workouts';
import {
  daysFrom,
  formatDayInitial,
  formatJournalDate,
  hourInParis,
  isoWeekNumber,
  startOfWeek,
  todayInParis,
} from '@/lib/date';
import { formatKcal } from '@/lib/nutrition';
import { macrosPerServing } from '@/lib/recipe';
import { initialsOf } from '@/lib/social';
import { weightChange } from '@/lib/weight';
import { cn } from '@/lib/utils';
import { TodayTiles, type PlannedTonight } from './TodayTiles';
import { WelcomeCard } from './WelcomeCard';
import { recordUsage } from '@/server/services/usage';

// Le journal vient du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/** Semaines de pesées lues pour la tuile Poids : un mois et demi de tendance. */
const WEIGHT_WEEKS = 6;

/**
 * Aujourd'hui (maquette 5a, écran 1).
 *
 * Tout ce qui compte dans la journée, sur un écran : la semaine en bâtons, la
 * jauge du jour et ses macros, la séance, le plat du soir, le poids,
 * l'activité, puis les repas notés. On ajoute par le bouton + de la barre.
 *
 * Composant serveur : les lectures partent ensemble, seules les tuiles et la
 * liste des repas, qui écrivent, sont des composants client (AD-10).
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ bienvenue?: string }>;
}) {
  const welcome = (await searchParams).bienvenue === '1';
  const today = todayInParis();
  const weekStart = startOfWeek(today);
  const userId = await requireUserId();
  await recordUsage(userId, 'app_opened');
  const [
    { totals, entries },
    target,
    identity,
    recentDays,
    session,
    planned,
    recipes,
    weights,
    lastWeight,
    bridge,
    preferences,
    sessions,
  ] = await Promise.all([
    journalForToday(userId),
    targetFor(userId),
    identityFor(userId),
    historyPage(userId, 7, 0),
    quickSessionFor(userId),
    planForWeek(userId, weekStart),
    recipesFor(userId),
    weightHistory(userId, WEIGHT_WEEKS),
    lastWeighIn(userId),
    bridgeStatus(userId),
    preferencesFor(userId),
    sessionHistory(userId, 14),
  ]);

  // La semaine en bâtons : la hauteur dit la part de la cible, bornée au plein.
  const kcalByDay = new Map(recentDays.map((day) => [day.entryDate, day.macros.kcal]));
  kcalByDay.set(today, totals.macros.kcal);
  const reference =
    target?.targetKcal ?? Math.max(1, ...Array.from(kcalByDay.values()));
  const week = daysFrom(weekStart, 7).map((day) => ({
    day,
    ratio: Math.min(1, (kcalByDay.get(day) ?? 0) / reference),
    state: day === today ? 'today' : day < today ? 'past' : 'future',
  }));

  // Le plat prévu : le dîner, ou le déjeuner tant qu'on est avant 15 h.
  const todays = planned.filter((meal) => meal.planDate === today);
  const lunchFirst = hourInParis() < 15;
  const pick =
    (lunchFirst ? todays.find((meal) => meal.meal === 'lunch' && meal.journaledAt === null) : undefined) ??
    todays.find((meal) => meal.meal === 'dinner') ??
    todays.find((meal) => meal.meal === 'lunch');
  let tonight: PlannedTonight | null = null;
  if (pick !== undefined) {
    const recipe = recipes.find((candidate) => candidate.id === pick.recipeId);
    const perServing = recipe === undefined ? null : macrosPerServing(recipe).macros.kcal;
    tonight = {
      planId: pick.id,
      heading: pick.meal === 'dinner' ? 'Ce soir' : 'Ce midi',
      name: pick.recipeName,
      kcal: perServing === null ? null : Math.round(perServing * pick.servings),
      servings: pick.servings,
      eaten: pick.journaledAt !== null,
    };
  }

  const sessionsDone = sessions.filter(
    (item) => item.finishedAt !== null && item.sessionDate >= weekStart,
  ).length;

  const trainingKcal =
    target === null || target.trainingDay === null || target.cycleKcal === 0 ? null : target.cycleKcal;

  return (
    <div className="flex flex-col gap-3 pt-3 pb-4">
      <header className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em]">Aujourd’hui</h1>
          <p className="text-[12.5px] text-muted-foreground">
            <span className="inline-block first-letter:uppercase">{formatJournalDate(today)}</span>
            {target?.trainingDay === true ? (
              <>
                {' · '}
                <span className="font-semibold text-sport-ink">jour d’entraînement</span>
              </>
            ) : null}
          </p>
        </div>
        <UserAvatar initials={initialsOf(identity.displayName ?? identity.handle)} />
      </header>

      {welcome ? (
        <WelcomeCard
          name={identity.displayName}
          targetKcal={target === null ? null : formatKcal(target.targetKcal)}
          handle={identity.handle}
          sessionsPerWeek={session === null ? null : preferences.sessionsPerWeek}
        />
      ) : null}

      <section aria-label="La semaine" className="flex flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Semaine {isoWeekNumber(today)}</span>
          <Link href="/history" className="flex items-center gap-0.5 font-semibold text-nutri-ink">
            Historique
            <ChevronRightIcon aria-hidden className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-7 items-end gap-1.5">
          {week.map((day) => (
            <div key={day.day} className="flex flex-col items-center gap-1">
              <div className="flex h-[30px] w-full items-end">
                <div
                  className={cn(
                    'w-full rounded-[4px]',
                    day.state === 'today' && 'bg-nutri',
                    day.state === 'past' && (day.ratio > 0 ? 'bg-nutri-mid' : 'bg-track'),
                    day.state === 'future' && 'bg-track',
                  )}
                  style={{
                    height: day.state === 'future' || day.ratio === 0 ? 3 : `${Math.max(10, day.ratio * 100)}%`,
                  }}
                />
              </div>
              <span
                className={cn(
                  'text-[11px]',
                  day.state === 'today' && 'font-bold text-nutri-ink',
                  day.state === 'past' && 'text-muted-foreground',
                  day.state === 'future' && 'text-faint',
                )}
              >
                {formatDayInitial(day.day)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <DayDial
        macros={totals.macros}
        target={
          target === null
            ? null
            : {
                targetKcal: target.targetKcal,
                proteinG: target.proteinG,
                carbsG: target.carbsG,
                fatG: target.fatG,
              }
        }
        trainingKcal={trainingKcal}
      />

      <TodayTiles
        session={session}
        tonight={tonight}
        weight={
          lastWeight === null
            ? null
            : {
                latestKg: lastWeight.weightKg,
                changeKg: weightChange(weights),
                weeks: weights.map((item) => item.weightKg),
              }
        }
        activity={{
          activeKcal: bridge.lastDay === today ? bridge.lastKcal : null,
          sessionsDone,
          sessionsPlanned: preferences.sessionsPerWeek,
        }}
      />

      {entries.length === 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[15px] font-semibold">Rien de noté pour l’instant</p>
          <p className="text-[13px] text-muted-foreground">
            Touche + puis Repas : scanne un code-barres, cherche un nom, ou photographie
            l’assiette.
          </p>
        </div>
      ) : (
        <MealJournal entries={entries} deletable favoritable />
      )}
    </div>
  );
}
