import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { currentUserId } from '@/server/guard';
import { hasIngestToken } from '@/server/db/queries/users';
import { bridgeStatus } from '@/server/services/profile';
import { env } from '@/server/env';
import { HealthBridge } from '../HealthBridge';

export const dynamic = 'force-dynamic';

/** Repli quand la base est injoignable : l'écran doit survivre à une panne. */
const EMPTY_STATUS = {
  lastDay: null,
  lastKcal: null,
  dayCount: 0,
  typicalKcal: 0,
  peakKcal: 0,
  requiredDays: 3,
};

/** Pont vers Santé d'Apple (FR-27), sorti des réglages où il tenait trop de place. */
export default async function HealthPage() {
  const userId = await currentUserId();
  const [tokenExists, status] = await Promise.all([
    userId === null ? Promise.resolve(false) : hasIngestToken(userId),
    userId === null
      ? Promise.resolve(EMPTY_STATUS)
      : bridgeStatus(userId).catch(() => EMPTY_STATUS),
  ]);

  return (
    <>
      <NavHeader label="Réglages" href="/settings" />
      <PageTitle title="Activité depuis Santé" />
      <HealthBridge
        hasToken={tokenExists}
        status={status}
        shortcutUrl={env.healthShortcutUrl ?? null}
      />
    </>
  );
}
