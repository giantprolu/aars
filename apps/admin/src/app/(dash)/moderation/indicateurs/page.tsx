import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { Stat } from '@/components/Stat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, SANCTION_LABELS, type ModerationMetrics } from '@/lib/types';

export const dynamic = 'force-dynamic';

const WINDOWS = [7, 30, 90] as const;

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)} %`;
}

/**
 * Ce que la modération fait, et à quel point elle se trompe. Les faux
 * positifs connus sont les dossiers où l'automatique avait agi, puis classés
 * sans suite par un humain : ils disent quand recaler la politique.
 */
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const asked = Number((await searchParams).days);
  const days = (WINDOWS as readonly number[]).includes(asked) ? asked : 30;
  const metrics = await apiGet<ModerationMetrics>(`/moderation/metrics?days=${days}`);
  const decided = metrics.confirmed + metrics.dismissed;

  return (
    <>
      <Link href="/moderation" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        File de modération
      </Link>
      <PageTitle title="Indicateurs de modération" description={`Sur les ${days} derniers jours.`}>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {WINDOWS.map((entry) => (
            <Link
              key={entry}
              href={`/moderation/indicateurs?days=${entry}`}
              className={cn('rounded-md px-3 py-1', entry === days ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
            >
              {entry} j
            </Link>
          ))}
        </div>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dossiers ouverts" value={metrics.opened} hint={`${percent(Math.round((metrics.urgentShare ?? 0) * metrics.opened), metrics.opened)} en P0 ou P1`} />
        <Stat label="Actions automatiques" value={metrics.autoActions} hint="contenus masqués ou refusés" />
        <Stat
          label="Faux positifs connus"
          value={metrics.autoReversed}
          hint={`${percent(metrics.autoReversed, metrics.autoActions)} des actions automatiques`}
        />
        <Stat
          label="Délai moyen de décision"
          value={metrics.meanResolutionHours === null ? '—' : `${metrics.meanResolutionHours} h`}
          hint={`${decided} dossier(s) clos`}
        />
        <Stat label="Confirmés" value={metrics.confirmed} hint={`précision ${percent(metrics.confirmed, decided)}`} />
        <Stat label="Classés sans suite" value={metrics.dismissed} />
        <Stat
          label="Signalements"
          value={metrics.reports.created}
          hint={`${metrics.reports.actionTaken} suivis d'effet, ${metrics.reports.dismissed} rejetés`}
        />
        <Stat
          label="Abus du signalement"
          value={metrics.reports.coordinated + metrics.reports.rateLimited}
          hint={`${metrics.reports.coordinated} dossier(s) visé(s) par une vague, ${metrics.reports.rateLimited} refus de fréquence`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dossiers par catégorie</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.openedByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun dossier sur la période.</p>
            ) : (
              <Table>
                <TableBody>
                  {metrics.openedByCategory.map((entry) => (
                    <TableRow key={entry.category}>
                      <TableCell>{CATEGORY_LABELS[entry.category] ?? entry.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{entry.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sanctions</CardTitle>
            <CardDescription>
              En cours : {metrics.active.restriction} restriction(s), {metrics.active.suspension} suspension(s), {metrics.active.ban}{' '}
              bannissement(s).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sanction</TableHead>
                  <TableHead className="text-right">Automatiques</TableHead>
                  <TableHead className="text-right">Humaines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.sanctions.map((entry) => (
                  <TableRow key={entry.kind}>
                    <TableCell>{SANCTION_LABELS[entry.kind] ?? entry.kind}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.system}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.human}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Appels : pas encore ouverts aux utilisateurs. Les textes vérifiés sans rien trouver ne sont pas comptés en base, par
        minimisation : ils ne laissent qu&apos;une ligne dans les journaux Vercel.
      </p>
    </>
  );
}
