import 'server-only';
import { AUDIT_MIN_DAYS, RETENTION_DAYS } from '@/lib/moderation/config';
import { insertAudit, purgeModerationData } from '../db/queries/moderation';
import { logModeration } from './log';

/**
 * La purge quotidienne de la modération, appelée par la tâche planifiée des
 * rappels (comme celle des compteurs d'usage). On ne garde que ce qui sert
 * encore à la sécurité, aux appels et à l'audit.
 */
export async function purgeModeration(): Promise<Record<string, number>> {
  const counts = await purgeModerationData({
    ...RETENTION_DAYS,
    audit: Math.max(RETENTION_DAYS.audit, AUDIT_MIN_DAYS),
  });
  if (Object.values(counts).some((count) => count > 0)) {
    await insertAudit([{ actor: 'system', event: 'RETENTION_PURGED', caseId: null, userId: null, details: counts }]);
  }
  logModeration('retention', counts);
  return counts;
}
