import { ChevronRightIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUserId } from '@/server/guard';
import { weightHistory } from '@/server/services/profile';
import { PROGRESS_WEEKS, progressOverview } from '@/server/services/workouts';
import { formatRelativeJournalDate } from '@/lib/date';
import { formatSet } from '@/lib/workout';
import { formatChange } from '@/lib/workout-progress';
import { weightChange } from '@/lib/weight';
import { WeeklyVolumeChart, WeeklyWeightChart } from './ChartsLazy';
import { WeighInForm } from './WeighInForm';

// Les séances viennent du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/**
 * La progression, vue d'ensemble.
 *
 * Deux lectures, dans cet ordre. D'abord la régularité : le tonnage semaine
 * après semaine dit si l'on s'entraîne, avant de dire si l'on progresse. Puis
 * chaque exercice, avec son écart sur la période : c'est là que se voit un
 * mouvement qui stagne alors que le reste avance.
 *
 * Le poids est posé sous le tonnage, sur les mêmes semaines. Les deux courbes
 * se lisent ensemble : un poids qui monte avec le tonnage est une prise de
 * muscle probable, un poids qui monte seul ne l'est pas.
 *
 * Composant serveur ; seuls les graphiques sont des composants client (AD-10).
 */
export default async function ProgressPage() {
  const userId = await requireUserId();
  const [{ weeks, exercises }, weights] = await Promise.all([
    progressOverview(userId),
    weightHistory(userId, PROGRESS_WEEKS),
  ]);
  const weighed = weights.filter((week) => week.weightKg !== null);
  const lastWeight = weighed[weighed.length - 1]?.weightKg ?? null;
  const change = weightChange(weights);

  const weightCard = (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle>Poids</CardTitle>
        <CardDescription>
          {weighed.length === 0
            ? 'Aucune pesée sur la période. La première trace le départ de la courbe.'
            : change === null
              ? 'Moyenne de chaque semaine pesée.'
              : `Moyenne par semaine, ${change > 0 ? '+' : ''}${change.toLocaleString('fr-FR')} kg sur la période.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {weighed.length > 0 ? <WeeklyWeightChart weeks={weights} /> : null}
        <WeighInForm lastWeightKg={lastWeight} />
      </CardContent>
    </Card>
  );

  const sessions = weeks.reduce((total, week) => total + week.sessions, 0);
  const activeWeeks = weeks.filter((week) => week.sessions > 0).length;

  return (
    <>
      <NavHeader label="Sport" href="/training" />
      <PageTitle title="Progression" description={`${PROGRESS_WEEKS} dernières semaines`} />

      {exercises.length === 0 ? (
        <>
          <EmptyState>Aucune série enregistrée sur cette période.</EmptyState>
          <Button asChild variant="outline" className="w-full">
            <Link href="/training">Revenir au programme</Link>
          </Button>
          {weightCard}
        </>
      ) : (
        <>
          <div className="mt-4 flex gap-2.5">
            <Card className="min-w-0 flex-1 gap-0 p-3">
              <p className="text-[11.5px] text-muted-foreground">Séances</p>
              <p className="tabular mt-0.5 text-[19px] font-semibold tracking-tight">{sessions}</p>
              <p className="text-[11.5px] text-muted-foreground">
                sur {PROGRESS_WEEKS} semaines
              </p>
            </Card>
            <Card className="min-w-0 flex-1 gap-0 p-3">
              <p className="text-[11.5px] text-muted-foreground">Régularité</p>
              <p className="tabular mt-0.5 text-[19px] font-semibold tracking-tight">
                {activeWeeks}/{PROGRESS_WEEKS}
              </p>
              <p className="text-[11.5px] text-muted-foreground">semaines actives</p>
            </Card>
            <Card className="min-w-0 flex-1 gap-0 p-3">
              <p className="text-[11.5px] text-muted-foreground">Exercices</p>
              <p className="tabular mt-0.5 text-[19px] font-semibold tracking-tight">
                {exercises.length}
              </p>
              <p className="text-[11.5px] text-muted-foreground">travaillés</p>
            </Card>
          </div>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Tonnage par semaine</CardTitle>
              <CardDescription>Charge × répétitions, toutes séances confondues.</CardDescription>
            </CardHeader>
            <CardContent>
              <WeeklyVolumeChart weeks={weeks} />
            </CardContent>
          </Card>

          {weightCard}

          <h2 className="mt-5 mb-1 text-[12.5px] text-muted-foreground">Par exercice</h2>
          <ul>
            {exercises.map((progress) => {
              const { exercise, metric, record, latest, change } = progress;
              return (
                <li key={exercise.id}>
                  <Link
                    href={`/training/progress/${exercise.id}`}
                    className="flex items-center gap-3 border-b py-2.5 transition-colors active:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium tracking-tight">
                        {exercise.name}
                      </span>
                      <span className="tabular mt-px block truncate text-[12.5px] text-muted-foreground">
                        Record {formatSet(record.best)} ·{' '}
                        {formatRelativeJournalDate(latest.sessionDate)}
                      </span>
                    </span>
                    {change === null ? (
                      <Badge variant="outline">1 séance</Badge>
                    ) : (
                      <Badge
                        variant={change > 0 ? 'secondary' : 'outline'}
                        className="tabular"
                      >
                        {change > 0 ? <TrendingUpIcon /> : change < 0 ? <TrendingDownIcon /> : null}
                        {formatChange(metric, change)}
                      </Badge>
                    )}
                    <ChevronRightIcon
                      aria-hidden
                      className="size-4 flex-none text-muted-foreground"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            L’écart compare la dernière séance à la première de la période, sur le 1RM estimé
            quand l’exercice se charge.
          </p>
        </>
      )}
    </>
  );
}
