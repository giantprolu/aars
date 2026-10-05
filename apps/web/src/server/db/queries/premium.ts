import 'server-only';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import {
  parsePurchaseState,
  parseStoreState,
  type PurchaseState,
  type Store,
  type StoreState,
} from '@/lib/premium';
import type { StorePurchase } from '../../clients/google-play';
import { db, schema } from '../client';

/**
 * Abonnements et compteurs des limites gratuites.
 *
 * L'utilisateur est en premier argument partout, sauf dans
 * `subscriptionByToken` et `purchaseByToken` : une notification d'un magasin
 * ne porte qu'une référence d'achat, et c'est la ligne retrouvée qui dit à qui
 * elle appartient.
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
 * Écrit l'état lu chez le magasin pour ce jeton.
 *
 * Le conflit sur le jeton ne réécrit que si la ligne appartient déjà à ce
 * compte : un jeton présenté par un second compte ne change pas de mains. Rend
 * `false` dans ce cas.
 */
export async function saveSubscription(
  userId: number,
  store: Store,
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
    .values({ userId, store, purchaseToken, ...values })
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

export interface StoredPurchase {
  userId: number;
  store: Store;
  productId: string;
  state: PurchaseState;
  acknowledged: boolean;
}

function toPurchase(row: typeof schema.storePurchases.$inferSelect): StoredPurchase {
  return {
    userId: row.userId,
    store: row.store === 'app_store' ? 'app_store' : 'google_play',
    productId: row.productId,
    state: parsePurchaseState(row.state),
    acknowledged: row.acknowledged,
  };
}

export async function purchaseByToken(purchaseToken: string): Promise<StoredPurchase | null> {
  const [row] = await db()
    .select()
    .from(schema.storePurchases)
    .where(eq(schema.storePurchases.purchaseToken, purchaseToken));
  return row ? toPurchase(row) : null;
}

/** Les achats uniques d'un compte. */
export async function purchasesFor(userId: number): Promise<StoredPurchase[]> {
  const rows = await db()
    .select()
    .from(schema.storePurchases)
    .where(eq(schema.storePurchases.userId, userId));
  return rows.map(toPurchase);
}

/**
 * Écrit l'état d'un achat unique lu chez le magasin. Même garde que pour les
 * abonnements : une référence présentée par un second compte ne change pas de
 * mains, et la fonction rend `false`.
 */
export async function savePurchase(
  userId: number,
  store: Store,
  purchaseToken: string,
  purchase: { productId: string; state: PurchaseState; acknowledged: boolean },
): Promise<boolean> {
  const values = {
    productId: purchase.productId,
    state: purchase.state,
    acknowledged: purchase.acknowledged,
    updatedAt: new Date(),
  };
  const rows = await db()
    .insert(schema.storePurchases)
    .values({ userId, store, purchaseToken, ...values })
    .onConflictDoUpdate({
      target: schema.storePurchases.purchaseToken,
      set: values,
      setWhere: eq(schema.storePurchases.userId, userId),
    })
    .returning({ id: schema.storePurchases.id });
  return rows.length > 0;
}

export async function markPurchaseAcknowledged(userId: number, purchaseToken: string): Promise<void> {
  await db()
    .update(schema.storePurchases)
    .set({ acknowledged: true, updatedAt: new Date() })
    .where(
      and(eq(schema.storePurchases.userId, userId), eq(schema.storePurchases.purchaseToken, purchaseToken)),
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
