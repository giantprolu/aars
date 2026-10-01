import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../client';

/** Un abonnement aux notifications, tel que le navigateur le décrit. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Enregistre l'abonnement d'un appareil, ou le rattache au compte connecté.
 *
 * Un téléphone partagé qui change de compte garde la même adresse de
 * notification : elle passe au nouveau compte, sans quoi l'ancien recevrait
 * les rappels du nouveau.
 */
export async function upsertSubscription(userId: number, target: PushTarget): Promise<void> {
  await db()
    .insert(schema.pushSubscriptions)
    .values({ userId, ...target })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, p256dh: target.p256dh, auth: target.auth },
    });
}

export async function deleteSubscription(userId: number, endpoint: string): Promise<void> {
  await db()
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function subscriptionCount(userId: number): Promise<number> {
  const rows = await db()
    .select({ id: schema.pushSubscriptions.id })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
  return rows.length;
}

/**
 * Tous les abonnements, par utilisateur. Réservé à la tâche planifiée des
 * rappels, qui parcourt les comptes un par un et lit ensuite chaque journal
 * avec son utilisateur.
 */
export async function subscriptionsByUser(): Promise<Map<number, PushTarget[]>> {
  const rows = await db().select().from(schema.pushSubscriptions);
  const byUser = new Map<number, PushTarget[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    byUser.set(row.userId, list);
  }
  return byUser;
}

