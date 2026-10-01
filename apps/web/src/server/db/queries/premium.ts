import 'server-only';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { parseStoreState, type StoreState } from '@/lib/premium';
import type { StorePurchase } from '../../clients/google-play';
import { db, schema } from '../client';

/**
 * Abonnements et compteurs des limites gratuites.
 *
 * L'utilisateur est en premier argument partout, sauf dans
 * `subscriptionByToken` : une notification de Google ne porte qu'un jeton
 * d'achat, et c'est la ligne retrouvée qui dit à qui il appartient.
 */

export interface StoredSubscription {
  userId: number;
  productId: string;
  state: StoreState;
  expiresAt: Date | null;
  acknowledged: boolean;
}

function toSubscription(row: typeof schema.storeSubscriptions.$inferSelect): StoredSubscription {
  return {
    userId: row.userId,
    productId: row.productId,
    state: parseStoreState(row.state),
    expiresAt: row.expiresAt,
    acknowledged: row.acknowledged,
  };
}

export async function subscriptionByToken(purchaseToken: string): Promise<StoredSubscription | null> {
  const [row] = await db()
    .select()
    .from(schema.storeSubscriptions)
    .where(eq(schema.storeSubscriptions.purchaseToken, purchaseToken));
  return row ? toSubscription(row) : null;
}

/** Les abonnements d'un compte, l'échéance la plus lointaine d'abord. */
export async function subscriptionsFor(userId: number): Promise<StoredSubscription[]> {
  const rows = await db()
    .select()
    .from(schema.storeSubscriptions)
    .where(eq(schema.storeSubscriptions.userId, userId))
    .orderBy(desc(schema.storeSubscriptions.expiresAt));
  return rows.map(toSubscription);
}

/**
 * Écrit l'état lu chez Google pour ce jeton.
 *
 * Le conflit sur le jeton ne réécrit que si la ligne appartient déjà à ce
 * compte : un jeton présenté par un second compte ne change pas de mains. Rend
 * `false` dans ce cas.
 */
export async function saveSubscription(
  userId: number,
  purchaseToken: string,
  purchase: StorePurchase,
): Promise<boolean> {
  const values = {
    productId: purchase.productId,
    state: purchase.state,
    expiresAt: purchase.expiresAt,
    autoRenewing: purchase.autoRenewing,
    acknowledged: purchase.acknowledged,
    updatedAt: new Date(),
  };
  const rows = await db()
    .insert(schema.storeSubscriptions)
    .values({ userId, purchaseToken, ...values })
    .onConflictDoUpdate({
      target: schema.storeSubscriptions.purchaseToken,
      set: values,
      setWhere: eq(schema.storeSubscriptions.userId, userId),
    })
    .returning({ id: schema.storeSubscriptions.id });
  return rows.length > 0;
}

export async function markAcknowledged(userId: number, purchaseToken: string): Promise<void> {
  await db()
    .update(schema.storeSubscriptions)
    .set({ acknowledged: true, updatedAt: new Date() })
    .where(
      and(
        eq(schema.storeSubscriptions.userId, userId),
        eq(schema.storeSubscriptions.purchaseToken, purchaseToken),
      ),
    );
}

/** Recettes écrites à la main ; celles du catalogue ne comptent pas. */
export async function countOwnRecipes(userId: number): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, userId), isNull(schema.recipes.catalogSlug)));
  return row?.total ?? 0;
}

export async function countFavorites(userId: number): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(schema.favoriteMeals)
    .where(eq(schema.favoriteMeals.userId, userId));
  return row?.total ?? 0;
}
