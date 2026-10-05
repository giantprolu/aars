import Link from 'next/link';
import { CheckIcon, EyeOffIcon } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import { REASON_LABELS, type Report } from '@/lib/types';
import { moderate } from './actions';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status === 'resolved' ? 'resolved' : 'open';
  const { reports } = await apiGet<{ reports: Report[] }>(`/reports?status=${status}`);

  return (
    <>
      <PageTitle
        title="Modération"
        description="Signalements de la Communauté. Supprimer un compte reste à `npm run moderation`, avec sa confirmation."
      >
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(['open', 'resolved'] as const).map((entry) => (
            <Link
              key={entry}
              href={`/moderation?status=${entry}`}
              className={cn('rounded-md px-3 py-1', entry === status ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
            >
              {entry === 'open' ? 'À traiter' : 'Clos'}
            </Link>
          ))}
        </div>
      </PageTitle>
      {reports.length === 0 ? (
        <p className="text-muted-foreground">{status === 'open' ? 'Aucun signalement à traiter.' : 'Aucun signalement clos.'}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <Card key={report.id} className="gap-3">
              <CardHeader className="gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{REASON_LABELS[report.reason] ?? report.reason}</CardTitle>
                  <Badge variant="outline">n° {report.id}</Badge>
                  {report.openOnPerson > 1 ? <Badge variant="destructive">{report.openOnPerson} ouverts sur ce compte</Badge> : null}
                </div>
                <CardDescription>
                  {dateFormat.format(new Date(report.createdAt))} · @{report.reportedHandle ?? '?'} (compte {report.reportedId}), signalé par @
                  {report.reporterHandle ?? '?'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {report.sessionId !== null ? (
                  <p className="text-sm">
                    Séance « {report.sessionName ?? 'Séance'} » (n° {report.sessionId}, {report.sessionVisibility ?? '?'})
                  </p>
                ) : null}
                {report.note ? <p className="rounded-md bg-muted p-3 text-sm">{report.note}</p> : null}
                {status === 'open' ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={moderate}>
                      <input type="hidden" name="id" value={report.id} />
                      <input type="hidden" name="action" value="resolve" />
                      <Button type="submit" size="sm">
                        <CheckIcon aria-hidden />
                        Clore
                      </Button>
                    </form>
                    {report.sessionId !== null && report.sessionVisibility !== 'private' ? (
                      <form action={moderate}>
                        <input type="hidden" name="id" value={report.id} />
                        <input type="hidden" name="action" value="hide-session" />
                        <Button type="submit" size="sm" variant="outline">
                          <EyeOffIcon aria-hidden />
                          Rendre la séance privée
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : report.resolvedAt ? (
                  <p className="text-xs text-muted-foreground">Clos le {dateFormat.format(new Date(report.resolvedAt))}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
