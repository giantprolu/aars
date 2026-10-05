import { PageTitle } from '@/components/PageTitle';
import { Stat } from '@/components/Stat';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiGet } from '@/lib/api';
import type { Overview } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const overview = await apiGet<Overview>('/overview');
  const share = overview.accounts.total === 0 ? 0 : Math.round((overview.subscriptions.active / overview.accounts.total) * 1000) / 10;

  return (
    <>
      <PageTitle title="Abonnés" description="Abonnement mensuel et Cuisine+, sur Google Play et l'App Store." />
      {overview.salesOpen ? null : (
        <Alert>
          <AlertTitle>Vente fermée</AlertTitle>
          <AlertDescription>
            <code>SALES_OPEN = false</code> : rien n&apos;est proposé dans les apps et tout est ouvert à tous. Les chiffres
            ci-dessous resteront à zéro jusqu&apos;à la réouverture.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Abonnés actifs" value={overview.subscriptions.active} hint="payés jusqu'à l'échéance" />
        <Stat label="Part des comptes" value={`${share} %`} hint={`sur ${overview.accounts.total} comptes`} />
        <Stat label="Cuisine+" value={overview.subscriptions.kitchenPlus} hint="achats uniques" />
        <Stat label="Actifs sur 30 jours" value={overview.active.d30} />
      </div>
    </>
  );
}
