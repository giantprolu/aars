import 'server-only';
import { asc, eq, lt, sql } from 'drizzle-orm';
import type { UsageEvent } from '@/lib/usage';
import { db, schema } from '../client';

/** Mesure d'usage. L'utilisateur est en premier argument partout. */

/** Ajoute un à l'événement du jour, en créant la ligne au premier. */
export async function bumpUsage(userId: number, day: string, event: UsageEvent): Promise<void> {
  await db()
    .insert(schema.usageDays)
    .values({ userId, day, event })
    .onConflictDoUpdate({
      target: [schema.usageDays.userId, schema.usageDays.day, schema.usageDays.event],
      set: { count: sql`${schema.usageDays.count} + 1` },
    });
}

/**
 * Efface les compteurs antérieurs à `day`, tous comptes confondus. C'est la
 * durée de conservation promise par la politique de confidentialité.
 */
export async function deleteUsageBefore(day: string): Promise<void> {
  await db().delete(schema.usageDays).where(lt(schema.usageDays.day, day));
}

/** Les compteurs d'un compte, pour l'export. */
export function usageFor(userId: number) {
  return db()
    .select({ day: schema.usageDays.day, event: schema.usageDays.event, count: schema.usageDays.count })
    .from(schema.usageDays)
    .where(eq(schema.usageDays.userId, userId))
    .orderBy(asc(schema.usageDays.day), asc(schema.usageDays.event));
}
