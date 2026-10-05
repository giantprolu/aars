'use client';

import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function shortDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** Les comptes actifs jour après jour (ouverture de l'app). */
export function ActiveChart({ data }: { data: { day: string; users: number }[] }) {
  const config = { users: { label: 'Comptes actifs', color: 'var(--chart-1)' } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDay} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => shortDay(String(value))} />} />
        <Area dataKey="users" type="monotone" fill="var(--color-users)" fillOpacity={0.25} stroke="var(--color-users)" />
      </AreaChart>
    </ChartContainer>
  );
}

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

/** Plusieurs compteurs d'usage sur la période, une ligne chacun. */
export function UsageChart({
  data,
  series,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
}) {
  const config: ChartConfig = Object.fromEntries(
    series.map((entry, index) => [entry.key, { label: entry.label, color: COLORS[index % COLORS.length] }]),
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDay} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => shortDay(String(value))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((entry) => (
          <Line key={entry.key} dataKey={entry.key} type="monotone" stroke={`var(--color-${entry.key})`} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
