import Link from 'next/link';
import { UsageChart } from '@/components/Charts';
import { PageTitle } from '@/components/PageTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EVENT_LABELS, type UsageResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90] as const;
const ENGAGEMENT = ['app_opened', 'target_set', 'activity_synced'];
const MEALS = ['meal_search', 'meal_barcode', 'meal_photo', 'meal_manual', 'meal_recent', 'meal_favorite', 'meal_recipe', 'meal_planned'];

function series(usage: UsageResponse, events: string[], field: 'users' | 'total'): Record<string, string | number>[] {
  const end = new Date(`${usage.today}T00:00:00Z`);
  return Array.from({ length: usage.days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (usage.days - 1 - index));
    const day = date.toISOString().slice(0, 10);
    const row: Record<string, string | number> = { day };
    for (const event of events) {
      row[event] = usage.points.find((point) => point.day === day && point.event === event)?.[field] ?? 0;
    }
    return row;
  });
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const asked = Number((await searchParams).days);
  const days = (PERIODS as readonly number[]).includes(asked) ? asked : 30;
  const usage = await apiGet<UsageResponse>(`/usage?days=${days}`);

  const totals = new Map<string, { users: number; total: number }>();
  for (const point of usage.points) {
    const current = totals.get(point.event) ?? { users: 0, total: 0 };
    totals.set(point.event, { users: current.users + point.users, total: current.total + point.total });
  }
  const label = (event: string) => EVENT_LABELS[event] ?? event;

  return (
    <>
      <PageTitle title="Usage" description="Compteurs par jour, tous comptes confondus. Aucun contenu nutritionnel.">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {PERIODS.map((period) => (
            <Link
              key={period}
              href={`/usage?days=${period}`}
              className={cn('rounded-md px-3 py-1', period === days ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
            >
              {period} j
            </Link>
          ))}
        </div>
      </PageTitle>
      <Card>
        <CardHeader>
          <CardTitle>Engagement</CardTitle>
          <CardDescription>Comptes distincts par jour.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageChart data={series(usage, ENGAGEMENT, 'users')} series={ENGAGEMENT.map((key) => ({ key, label: label(key) }))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Repas ajoutés, par méthode</CardTitle>
          <CardDescription>Nombre de repas ajoutés chaque jour.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageChart
            data={series(usage, MEALS.slice(0, 5), 'total')}
            series={MEALS.slice(0, 5).map((key) => ({ key, label: label(key) }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Totaux sur {days} jours</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compteur</TableHead>
                <TableHead className="text-right">Comptes × jours</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...ENGAGEMENT, 'paywall_hit', ...MEALS].map((event) => (
                <TableRow key={event}>
                  <TableCell>{label(event)}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.get(event)?.users ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.get(event)?.total ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
