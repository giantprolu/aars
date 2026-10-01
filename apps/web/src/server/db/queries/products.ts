import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../client';
import type { Macros, ReferenceFood } from '@/lib/types';

/** Accès au cache produits (FR-12, FR-14). */

function toNumber(value: string): number {
  return Number(value);
}

function toReferenceFood(row: typeof schema.products.$inferSelect): ReferenceFood {
  return {
    kind: 'product',
    ref: row.barcode,
    name: row.name,
    per100g: {
      kcal: toNumber(row.kcal100g),
      proteinG: toNumber(row.protein100g),
      carbsG: toNumber(row.carbs100g),
      fatG: toNumber(row.fat100g),
    },
    servingSizeG: row.servingSizeG === null ? null : toNumber(row.servingSizeG),
  };
}

/** Cherche un produit en cache. Consulté avant tout appel réseau (FR-12). */
export async function findProduct(barcode: string): Promise<ReferenceFood | null> {
  const [row] = await db()
    .select()
    .from(schema.products)
    .where(eq(schema.products.barcode, barcode))
    .limit(1);
  return row ? toReferenceFood(row) : null;
}

export interface UpsertProductInput {
  barcode: string;
  name: string;
  per100g: Macros;
  servingSizeG: number | null;
  source: 'off' | 'manual';
}

/** Écrit ou met à jour un produit. Jamais de doublon : la clé est le code-barres (FR-14). */
export async function upsertProduct(input: UpsertProductInput): Promise<ReferenceFood> {
  const values = {
    barcode: input.barcode,
    name: input.name,
    kcal100g: String(input.per100g.kcal),
    protein100g: String(input.per100g.proteinG),
    carbs100g: String(input.per100g.carbsG),
    fat100g: String(input.per100g.fatG),
    servingSizeG: input.servingSizeG === null ? null : String(input.servingSizeG),
    source: input.source,
    updatedAt: new Date(),
  };

  const [row] = await db()
    .insert(schema.products)
    .values(values)
    .onConflictDoUpdate({ target: schema.products.barcode, set: values })
    .returning();

  if (!row) {
    throw new Error("Le produit n'a pas été écrit.");
  }
  return toReferenceFood(row);
}
