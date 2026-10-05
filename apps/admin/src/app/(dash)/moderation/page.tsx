import Link from 'next/link';
import { BarChart3Icon } from 'lucide-react';
import { CaseBadges, PriorityBadge, since } from '@/components/ModerationBadges';
import { PageTitle } from '@/components/PageTitle';
import { Stat } from '@/components/Stat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ACTION_LABELS, TARGET_LABELS, type CaseSummary, type ModerationMetrics } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status === 'closed' ? 'closed' : 'open';
  const [{ cases }, metrics] = await Promise.all([
    apiGet<{ cases: CaseSummary[] }>(`/moderation/queue?status=${status}`),
    apiGet<ModerationMetrics>('/moderation/metrics?days=30'),
  ]);
  const open = metrics.openByPriority.reduce((sum, entry) => sum + entry.count, 0);
  const urgent = metrics.openByPriority.filter((entry) => entry.priority <= 1).reduce((sum, entry) => sum + entry.count, 0);
  const active = metrics.active.restriction + metrics.active.suspension + metrics.active.ban;

  return (
    <>
      <PageTitle
        title="Modération"
        description="Dossiers ouverts par la modération automatique ou par des signalements, du plus urgent au plus ancien."
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {(['open', 'closed'] as const).map((entry) => (
              <Link
                key={entry}
                href={`/moderation?status=${entry}`}
                className={cn('rounded-md px-3 py-1', entry === status ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
              >
                {entry === 'open' ? 'À traiter' : 'Clos'}
              </Link>
            ))}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/moderation/indicateurs">
              <BarChart3Icon aria-hidden />
              Indicateurs
            </Link>
          </Button>
        </div>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="À traiter" value={open} />
        <Stat label="Urgents (P0, P1)" value={urgent} />
        <Stat label="Sanctions en cours" value={active} hint={`${metrics.active.suspension} suspension(s), ${metrics.active.ban} bannissement(s)`} />
        <Stat
          label="Classés sans suite après action automatique"
          value={metrics.autoReversed}
          hint={`sur ${metrics.autoActions} actions automatiques, 30 jours`}
          href="/moderation/indicateurs"
        />
      </div>

      {cases.length === 0 ? (
        <p className="text-muted-foreground">{status === 'open' ? 'Aucun dossier à traiter.' : 'Aucun dossier clos.'}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((entry) => (
            <Link key={entry.id} href={`/moderation/${entry.id}`}>
              <Card className="gap-2 py-4 transition-colors hover:bg-accent/40">
                <CardHeader className="gap-2 px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={entry.priority} />
                    <CardTitle className="text-base">{TARGET_LABELS[entry.targetKind] ?? entry.targetKind}</CardTitle>
                    <CaseBadges status={entry.status} category={entry.category} flags={entry.flags} />
                    {entry.recommendedAction ? (
                      <Badge variant="destructive">Proposé : {ACTION_LABELS[entry.recommendedAction] ?? entry.recommendedAction}</Badge>
                    ) : null}
                  </div>
                  <CardDescription>
                    Dossier n° {entry.id} · @{entry.subject.handle ?? '?'} (compte {entry.subject.id}) · ouvert{' '}
                    {since(entry.createdAt)}
                    {entry.reports > 0 ? ` · ${entry.reports} signalement(s)` : ''}
                    {entry.assignedTo ? ` · ${entry.assignedTo}` : ''}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
