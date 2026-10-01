import 'server-only';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import type { WeighIn } from '@/lib/weight';

/**
 * Pesées, une par jour et par utilisateur.
 *
 * Toutes les fonctions reçoivent l'utilisateur en premier argument : un poids
 * est une donnée de santé, et aucune lecture ne doit pouvoir partir d'ailleurs.
 */

/** Enregistre la pesée du jour, ou remplace celle déjà faite ce jour-là. */
export async function upsertWeighIn(userId: number, day: string, weightKg: number): Promise<void> {
  await db()
    .insert(schema.weightLogs)
    .values({ userId, day, weightKg: String(weightKg) })
    .onConflictDoUpdate({
      target: [schema.weightLogs.userId, schema.weightLogs.day],
      set: { weightKg: sql`excluded.weight_kg`, createdAt: sql`now()` },
    });
}

export async function listWeighIns(userId: number, sinceDate: string): Promise<WeighIn[]> {
  const rows = await db()
    .select({ day: schema.weightLogs.day, weightKg: schema.weightLogs.weightKg })
    .from(schema.weightLogs)
    .where(and(eq(schema.weightLogs.userId, userId), gte(schema.weightLogs.day, sinceDate)))
    .orderBy(asc(schema.weightLogs.day));
  return rows.map((row) => ({ day: String(row.day).slice(0, 10), weightKg: Number(row.weightKg) }));
}

/** La dernière pesée de l'utilisateur, ou `null` s'il ne s'est jamais pesé. */
export async function latestWeighIn(userId: number): Promise<WeighIn | null> {
  const [row] = await db()
    .select({ day: schema.weightLogs.day, weightKg: schema.weightLogs.weightKg })
    .from(schema.weightLogs)
    .where(eq(schema.weightLogs.userId, userId))
    .orderBy(desc(schema.weightLogs.day))
    .limit(1);
  return row ? { day: String(row.day).slice(0, 10), weightKg: Number(row.weightKg) } : null;
}
