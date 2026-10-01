import { ChevronRightIcon, TrophyIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUserId } from '@/server/guard';
import { exerciseProgressFor } from '@/server/services/workouts';
import { formatRelativeJournalDate } from '@/lib/date';
import { formatSet } from '@/lib/workout';
import { METRIC_LABELS, formatChange, formatMetric } from '@/lib/workout-progress';
import { ExerciseTrendChart, SessionVolumeChart } from '../ChartsLazy';

export const dynamic = 'force-dynamic';

/** Séances listées sous les graphiques. Les plus récentes ; le graphique garde tout. */
const LISTED_SESSIONS = 12;

/**
 * La progression d'un exercice, sur toute son histoire.
 *
 * Le record est montré tel qu'il a été fait — « 70 kg × 5 » — et non par sa
 * seule estimation : c'est la série qu'on se rappelle, et celle qu'on cherche
 * à battre en posant la barre.
 *
 * Un exercice sans aucune série de l'utilisateur est introuvable, et non
 * vide : la requête filtre sur l'utilisateur, et répondre autrement dirait
 * qu'un identifiant existe chez quelqu'un d'autre.
 */
export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const userId = await requireUserId();
  const exerciseId = Number((await params).exerciseId);
  if (!Number.isSafeInteger(exerciseId) || exerciseId <= 0) {
    notFound();
  }

  const progress = await exerciseProgressFor(userId, exerciseId);
  if (progress === null) {
    notFound();
  }

  const { exercise, metric, points, latest, record, change } = progress;
  const recent = [...points].reverse().slice(0, LISTED_SESSIONS);
  const loaded = metric === 'load';

  return (
    <>
      <NavHeader label="Progression" href="/training/progress" />
      <PageTitle
        title={exercise.name}
        {...(exercise.muscleGroup === null ? {} : { description: exercise.muscleGroup })}
      />

      <div className="mt-4 flex gap-2.5">
        <Card className="min-w-0 flex-1 gap-0 p-3">
          <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <TrophyIcon aria-hidden className="size-3" />
            Record
          </p>
          <p className="tabular mt-0.5 truncate text-[17px] font-semibold tracking-tight">
            {formatSet({ ...record.best, toFailure: false })}
          </p>
          <p className="text-[11.5px] text-muted-foreground first-letter:uppercase">
            {formatRelativeJournalDate(record.sessionDate)}
          </p>
        </Card>
        <Card className="min-w-0 flex-1 gap-0 p-3">
          <p className="text-[11.5px] text-muted-foreground">{METRIC_LABELS[metric]}</p>
          <p className="tabular mt-0.5 truncate text-[17px] font-semibold tracking-tight">
            {formatMetric(metric, latest.value)}
          </p>
          <p className="tabular text-[11.5px] text-muted-foreground">
            {change === null ? 'une seule séance' : `${formatChange(metric, change)} depuis le début`}
          </p>
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader>
          <CardTitle>{METRIC_LABELS[metric]}</CardTitle>
          <CardDescription>
            {loaded
              ? 'Estimé par la formule d’Epley sur la meilleure série de chaque séance.'
              : metric === 'reps'
                ? 'La série la plus longue de chaque séance, au poids du corps.'
                : 'La plus longue série de chaque séance.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {points.length < 2 ? (
            <p className="py-6 text-center text-muted-foreground">
              Une deuxième séance tracera la courbe.
            </p>
          ) : (
            <ExerciseTrendChart points={points} metric={metric} />
          )}
        </CardContent>
      </Card>

      {loaded && points.length >= 2 ? (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Tonnage par séance</CardTitle>
            <CardDescription>Charge × répétitions, toutes séries comprises.</CardDescription>
          </CardHeader>
          <CardContent>
            <SessionVolumeChart points={points} />
          </CardContent>
        </Card>
      ) : null}

      <h2 className="mt-5 mb-1 text-[12.5px] text-muted-foreground">
        {points.length > LISTED_SESSIONS ? 'Dernières séances' : 'Séances'}
      </h2>
      <ul>
        {recent.map((point) => (
          <li key={point.sessionId}>
            <Link
              href={`/training/session/${point.sessionId}`}
              className="flex items-center gap-3 border-b py-2.5 transition-colors active:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14.5px] font-medium tracking-tight first-letter:uppercase">
                    {formatRelativeJournalDate(point.sessionDate)}
                  </span>
                  {point.sessionId === record.sessionId ? (
                    <Badge variant="secondary">Record</Badge>
                  ) : null}
                </span>
                <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                  {formatSet(point.best)} · {point.setCount} série{point.setCount > 1 ? 's' : ''}
                </span>
              </span>
              <span className="tabular flex-none text-right">
                <span className="block font-medium">{formatMetric(metric, point.value)}</span>
                {loaded ? (
                  <span className="block text-[12.5px] text-muted-foreground">
                    {point.volume.toLocaleString('fr-FR')} kg
                  </span>
                ) : null}
              </span>
              <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
