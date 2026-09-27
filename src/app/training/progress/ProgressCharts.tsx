'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  METRIC_LABELS,
  formatMetric,
  formatShortDate,
  type ProgressMetric,
  type SessionPoint,
  type WeekPoint,
} from '@/lib/workout-progress';
import type { WeekWeight } from '@/lib/weight';

/**
 * Les graphiques de la progression, sur le Chart de shadcn/ui.
 *
 * Une seule couleur par graphique, la première du jeu de graphiques : chaque
 * graphique ne porte qu'une série, et le titre de sa carte la nomme. La
 * dernière valeur, celle qu'on vient de faire, est la seule à l'opacité
 * pleine dans les colonnes, comme dans l'historique du journal.
 */

const weekConfig = {
  volume: { label: 'Tonnage', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function formatTonnage(kg: number): string {
  return kg >= 1000
    ? `${(Math.round(kg / 100) / 10).toLocaleString('fr-FR')} t`
    : `${kg.toLocaleString('fr-FR')} kg`;
}

/** Tonnage soulevé semaine par semaine. */
export function WeeklyVolumeChart({ weeks }: { weeks: readonly WeekPoint[] }) {
  const data = weeks.map((week, index) => ({
    ...week,
    label: formatShortDate(week.weekStart),
    fillOpacity: index === weeks.length - 1 ? 1 : 0.45,
  }));

  return (
    <ChartContainer config={weekConfig} className="aspect-auto h-[150px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const week = payload[0]?.payload as (WeekPoint & { label: string }) | undefined;
                return week === undefined ? '' : `Semaine du ${week.label}`;
              }}
              formatter={(value, _name, item) => {
                const week = item.payload as WeekPoint;
                return (
                  <span className="tabular">
                    {formatTonnage(Number(value))} · {week.sessions} séance
                    {week.sessions > 1 ? 's' : ''}
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="volume" fill="var(--color-volume)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

const trendConfig = {
  value: { label: 'Mesure', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** La mesure de l'exercice, séance après séance. */
export function ExerciseTrendChart({
  points,
  metric,
}: {
  points: readonly SessionPoint[];
  metric: ProgressMetric;
}) {
  const data = points.map((point) => ({ ...point, label: formatShortDate(point.sessionDate) }));

  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-[180px] w-full">
      <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          domain={['dataMin - 5', 'dataMax + 5']}
          allowDecimals={false}
          tickFormatter={(value: number) => Math.round(value).toLocaleString('fr-FR')}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const point = payload[0]?.payload as { label: string } | undefined;
                return point?.label ?? '';
              }}
              formatter={(value) => (
                <span className="tabular">
                  {METRIC_LABELS[metric]} : {formatMetric(metric, Number(value))}
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-value)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

const sessionVolumeConfig = {
  volume: { label: 'Tonnage', color: 'var(--chart-2)' },
} satisfies ChartConfig;

/** Le tonnage de chaque séance sur cet exercice. */
export function SessionVolumeChart({ points }: { points: readonly SessionPoint[] }) {
  const data = points.map((point) => ({ ...point, label: formatShortDate(point.sessionDate) }));

  return (
    <ChartContainer config={sessionVolumeConfig} className="aspect-auto h-[130px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => <span className="tabular">{formatTonnage(Number(value))}</span>}
            />
          }
        />
        <Bar dataKey="volume" fill="var(--color-volume)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

const weightConfig = {
  weightKg: { label: 'Poids', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/**
 * Le poids moyen de chaque semaine, sur la même grille que le tonnage.
 *
 * Les semaines sans pesée restent des trous : `connectNulls` tirerait un trait
 * entre deux mesures et montrerait un poids qu'on n'a jamais lu sur la balance.
 * L'axe part des valeurs et non de zéro, sans quoi un kilo de variation sur
 * quatre-vingts ne se verrait pas.
 */
export function WeeklyWeightChart({ weeks }: { weeks: readonly WeekWeight[] }) {
  const data = weeks.map((week) => ({ ...week, label: formatShortDate(week.weekStart) }));

  return (
    <ChartContainer config={weightConfig} className="aspect-auto h-[150px] w-full">
      <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          domain={['dataMin - 1', 'dataMax + 1']}
          allowDecimals={false}
          tickFormatter={(value: number) => Math.round(value).toLocaleString('fr-FR')}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const week = payload[0]?.payload as { label: string } | undefined;
                return week === undefined ? '' : `Semaine du ${week.label}`;
              }}
              formatter={(value, _name, item) => {
                const week = item.payload as WeekWeight;
                return (
                  <span className="tabular">
                    {Number(value).toLocaleString('fr-FR')} kg · {week.count} pesée
                    {week.count > 1 ? 's' : ''}
                  </span>
                );
              }}
            />
          }
        />
        <Line
          dataKey="weightKg"
          type="monotone"
          stroke="var(--color-weightKg)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-weightKg)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
