import { ActiveChart } from '@/components/Charts';
import { PageTitle } from '@/components/PageTitle';
import { Stat } from '@/components/Stat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import type { Overview, UsageResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Les jours de la fenêtre, du plus ancien au plus récent, même sans activité. */
function daysUntil(today: string, count: number): string[] {
  const end = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

export default async function OverviewPage() {
  const [overview, usage] = await Promise.all([apiGet<Overview>('/overview'), apiGet<UsageResponse>('/usage?days=30')]);
  const opened = new Map(usage.points.filter((point) => point.event === 'app_opened').map((point) => [point.day, point.users]));
  const active = daysUntil(usage.today, usage.days).map((day) => ({ day, users: opened.get(day) ?? 0 }));

  return (
    <>
      <PageTitle title="Vue d'ensemble" description={`Au ${new Date(`${overview.today}T12:00:00Z`).toLocaleDateString('fr-FR', { dateStyle: 'long' })}.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Comptes" value={overview.accounts.total} hint={`+${overview.accounts.new7} sur 7 jours, +${overview.accounts.new30} sur 30`} />
        <Stat label="Actifs aujourd'hui" value={overview.active.today} hint={`${overview.active.d7} sur 7 jours, ${overview.active.d30} sur 30`} href="/usage" />
        <Stat label="Recettes sans photo" value={overview.recipes.ownWithoutPhoto} hint={`sur ${overview.recipes.own} écrites ou importées`} href="/recettes" />
        <Stat
          label="Dossiers de modération"
          value={overview.openCases ?? overview.openReports}
          hint={overview.urgentCases ? `${overview.urgentCases} urgent(s), P0 ou P1` : 'aucun urgent'}
          href="/moderation"
        />
        <Stat label="Recettes" value={overview.recipes.total} hint={`${overview.recipes.fromCatalog} venues du catalogue`} />
        <Stat label="Repas au plan cette semaine" value={overview.plannedThisWeek} />
        <Stat label="Abonnés actifs" value={overview.subscriptions.active} hint={overview.salesOpen ? 'vente ouverte' : 'vente fermée'} href="/abonnements" />
        <Stat label="Cuisine+" value={overview.subscriptions.kitchenPlus} hint="achats uniques" href="/abonnements" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Comptes actifs</CardTitle>
          <CardDescription>Comptes ayant ouvert l&apos;app chaque jour, sur 30 jours.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActiveChart data={active} />
        </CardContent>
      </Card>
    </>
  );
}
