import 'server-only';
import {
  FREE_FAVORITE_LIMIT,
  FREE_RECIPE_LIMIT,
  KITCHEN_PLUS_PRODUCT,
  SUBSCRIPTION_PRODUCTS,
  entitlementsFrom,
  grantsPremium,
  grantsPurchase,
  underFreeLimit,
  uuidFromHex,
  type PurchaseState,
} from '@/lib/premium';
import { env, requireEnv } from '../env';
import {
  acknowledgeProduct,
  acknowledgeSubscription,
  lookupProduct,
  lookupSubscription,
  type StorePurchase,
} from '../clients/google-play';
import {
  lookupSubscription as lookupAppleSubscription,
  lookupTransaction as lookupAppleTransaction,
} from '../clients/app-store';
import {
  countFavorites,
  countOwnRecipes,
  markAcknowledged,
  markPurchaseAcknowledged,
  purchaseByToken,
  purchasesFor,
  savePurchase,
  saveSubscription,
  subscriptionByToken,
  subscriptionsFor,
} from '../db/queries/premium';

/**
 * Service des achats (freemium, décisions du 01/10/2026 et du 05/10/2026).
 *
 * Deux façons de payer, dans les deux magasins : l'abonnement mensuel, qui
 * ouvre tout, et Cuisine+, achat unique qui ouvre à vie le plan automatique
 * et l'import de recette. Le droit se décide ici et nulle part ailleurs : les
 * apps affichent ce que le serveur leur dit, et chaque route payante
 * redemande. Un téléphone qui se dirait abonné n'ouvre rien.
 */

export interface PremiumStatus {
  premium: boolean;
  /** Cuisine+ : achetée, ou ouverte par l'abonnement. */
  kitchenPlus: boolean;
  /** Échéance de l'abonnement qui ouvre l'accès, `null` sans abonnement actif. */
  expiresAt: Date | null;
  limits: { recipes: number; favorites: number };
  usage: { recipes: number; favorites: number };
}

export async function isPremium(userId: number, now: Date = new Date()): Promise<boolean> {
  const subscriptions = await subscriptionsFor(userId);
  return subscriptions.some((item) => grantsPremium(item.state, item.expiresAt, now));
}

/** Vrai si ce compte a le plan automatique et l'import de recette. */
export async function hasKitchenPlus(userId: number, now: Date = new Date()): Promise<boolean> {
  const [premium, purchases] = await Promise.all([isPremium(userId, now), purchasesFor(userId)]);
  return entitlementsFrom(premium, ownsKitchenPlus(purchases)).kitchenPlus;
}

function ownsKitchenPlus(purchases: readonly { productId: string; state: PurchaseState }[]): boolean {
  return purchases.some((item) => item.productId === KITCHEN_PLUS_PRODUCT && grantsPurchase(item.state));
}

export async function premiumStatus(userId: number, now: Date = new Date()): Promise<PremiumStatus> {
  const [subscriptions, purchases, recipes, favorites] = await Promise.all([
    subscriptionsFor(userId),
    purchasesFor(userId),
    countOwnRecipes(userId),
    countFavorites(userId),
  ]);
  const granting = subscriptions.find((item) => grantsPremium(item.state, item.expiresAt, now));
  const rights = entitlementsFrom(granting !== undefined, ownsKitchenPlus(purchases));
  return {
    premium: rights.premium,
    kitchenPlus: rights.kitchenPlus,
    expiresAt: granting?.expiresAt ?? null,
    limits: { recipes: FREE_RECIPE_LIMIT, favorites: FREE_FAVORITE_LIMIT },
    usage: { recipes, favorites },
  };
}

/** Vrai si ce compte peut écrire une recette de plus. */
export async function canAddRecipe(userId: number): Promise<boolean> {
  if (underFreeLimit(await countOwnRecipes(userId), FREE_RECIPE_LIMIT)) {
    return true;
  }
  return isPremium(userId);
}

/** Vrai si ce compte peut enregistrer un favori de plus. */
export async function canAddFavorite(userId: number): Promise<boolean> {
  if (underFreeLimit(await countFavorites(userId), FREE_FAVORITE_LIMIT)) {
    return true;
  }
  return isPremium(userId);
}

async function hmacHex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireEnv('SESSION_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Buffer.from(signature).toString('hex');
}

/**
 * Identifiant opaque du compte, que l'app passe à Google au moment de l'achat
 * (`setObfuscatedAccountId`).
 *
 * Google le rend avec l'achat, ce qui lie un jeton au compte qui l'a payé :
 * un jeton intercepté ne peut pas être présenté par un autre compte. Un HMAC
 * plutôt que l'identifiant brut, parce que Google interdit d'y mettre une
 * donnée personnelle, et 64 caractères hexadécimaux, sa limite exacte.
 */
export function accountRef(userId: number): Promise<string> {
  return hmacHex(`play-account:${userId}`);
}

/**
 * Le même lien pour l'App Store : l'`appAccountToken` que l'app passe à
 * l'achat, un UUID tiré d'un HMAC du compte. Apple le rend dans chaque
 * transaction, y compris restaurée sur un autre iPhone.
 */
export async function appAccountToken(userId: number): Promise<string> {
  return uuidFromHex(await hmacHex(`app-store-account:${userId}`));
}

/** Confirme l'achat chez Google s'il ne l'est pas encore, sans faire échouer l'appelant. */
async function acknowledgeIfNeeded(
  userId: number,
  purchaseToken: string,
  purchase: StorePurchase,
): Promise<void> {
  if (purchase.acknowledged || (purchase.state !== 'active' && purchase.state !== 'in_grace_period')) {
    return;
  }
  if (await acknowledgeSubscription(purchase.productId, purchaseToken)) {
    await markAcknowledged(userId, purchaseToken);
  }
}

export type VerifyPurchaseResult =
  | { kind: 'verified'; status: PremiumStatus }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

/**
 * Rattache un achat Google Play au compte, après l'avoir fait lire à Google :
 * l'abonnement, ou Cuisine+ quand l'app désigne ce produit.
 *
 * Appelée par l'app juste après l'achat, et à chaque démarrage pour les
 * achats en attente : rejouer est sans effet de bord.
 */
export async function verifyGooglePurchase(
  userId: number,
  purchaseToken: string,
  productId: string | null = null,
): Promise<VerifyPurchaseResult> {
  if (productId === KITCHEN_PLUS_PRODUCT) {
    return verifyGoogleOneTime(userId, purchaseToken, productId);
  }
  const lookup = await lookupSubscription(purchaseToken);
  if (lookup.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  if (lookup.kind === 'not_found') {
    return { kind: 'invalid' };
  }

  const { purchase } = lookup;
  // Un achat sans identifiant de compte vient d'une version de l'app qui ne le
  // posait pas encore : il reste accepté, l'unicité du jeton protège déjà.
  if (purchase.accountRef !== null && purchase.accountRef !== (await accountRef(userId))) {
    return { kind: 'invalid' };
  }
  if (!(await saveSubscription(userId, 'google_play', purchaseToken, purchase))) {
    return { kind: 'invalid' };
  }

  await acknowledgeIfNeeded(userId, purchaseToken, purchase);
  return { kind: 'verified', status: await premiumStatus(userId) };
}

async function verifyGoogleOneTime(
  userId: number,
  purchaseToken: string,
  productId: string,
): Promise<VerifyPurchaseResult> {
  const lookup = await lookupProduct(productId, purchaseToken);
  if (lookup.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  if (lookup.kind === 'not_found') {
    return { kind: 'invalid' };
  }
  const { purchase } = lookup;
  if (purchase.accountRef !== null && purchase.accountRef !== (await accountRef(userId))) {
    return { kind: 'invalid' };
  }
  if (!(await savePurchase(userId, 'google_play', purchaseToken, purchase))) {
    return { kind: 'invalid' };
  }
  if (!purchase.acknowledged && purchase.state === 'purchased' && (await acknowledgeProduct(productId, purchaseToken))) {
    await markPurchaseAcknowledged(userId, purchaseToken);
  }
  return { kind: 'verified', status: await premiumStatus(userId) };
}

/**
 * Rattache un achat App Store au compte, après l'avoir fait lire à Apple.
 *
 * L'app donne l'identifiant d'une transaction ; le serveur la relit, vérifie
 * l'app et le compte (`appAccountToken`), puis range l'achat sous sa
 * transaction d'origine, qui ne change pas d'un renouvellement à l'autre.
 * Apple n'a pas d'accusé de réception à envoyer : c'est l'app qui termine la
 * transaction, une fois cette réponse reçue.
 */
export async function verifyAppleTransaction(userId: number, transactionId: string): Promise<VerifyPurchaseResult> {
  const lookup = await lookupAppleTransaction(transactionId);
  if (lookup.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  if (lookup.kind === 'not_found') {
    return { kind: 'invalid' };
  }
  const transaction = lookup.value;
  if (transaction.bundleId !== env.appleBundleId) {
    return { kind: 'invalid' };
  }
  if (transaction.appAccountToken !== null && transaction.appAccountToken !== (await appAccountToken(userId))) {
    return { kind: 'invalid' };
  }
  const saved = await saveAppleTransaction(userId, transaction.originalTransactionId, transaction.productId, transaction.revoked);
  if (saved !== 'saved') {
    return { kind: saved };
  }
  return { kind: 'verified', status: await premiumStatus(userId) };
}

/** Range l'état courant d'un achat App Store, abonnement ou Cuisine+. */
async function saveAppleTransaction(
  userId: number,
  originalTransactionId: string,
  productId: string,
  revoked: boolean,
): Promise<'saved' | 'invalid' | 'unavailable'> {
  if (productId === SUBSCRIPTION_PRODUCTS.app_store) {
    const status = await lookupAppleSubscription(originalTransactionId);
    if (status.kind !== 'found') {
      return status.kind === 'unavailable' ? 'unavailable' : 'invalid';
    }
    const subscription = status.value;
    const purchase: StorePurchase = {
      productId: subscription.productId,
      state: subscription.state,
      expiresAt: subscription.expiresAt,
      autoRenewing: subscription.autoRenewing,
      acknowledged: true,
      accountRef: subscription.appAccountToken,
    };
    return (await saveSubscription(userId, 'app_store', originalTransactionId, purchase)) ? 'saved' : 'invalid';
  }
  if (productId === KITCHEN_PLUS_PRODUCT) {
    const purchase = { productId, state: revoked ? ('refunded' as const) : ('purchased' as const), acknowledged: true };
    return (await savePurchase(userId, 'app_store', originalTransactionId, purchase)) ? 'saved' : 'invalid';
  }
  return 'invalid';
}

/**
 * Relit un abonnement signalé par une notification de Google.
 *
 * La notification ne porte qu'un jeton, et son contenu n'est pas cru : seule
 * la relecture chez Google fait foi. Un jeton encore inconnu est ignoré —
 * l'app le présentera elle-même, avec la session qui dit à qui il appartient.
 */
export async function refreshFromNotification(purchaseToken: string): Promise<void> {
  const stored = await subscriptionByToken(purchaseToken);
  if (stored === null) {
    return;
  }
  const lookup = await lookupSubscription(purchaseToken);
  if (lookup.kind !== 'found') {
    // `unavailable` doit faire réessayer Pub/Sub : l'appelant le transforme
    // en erreur. `not_found` n'a rien à relire, inutile d'insister.
    if (lookup.kind === 'unavailable') {
      throw new Error('Google indisponible');
    }
    return;
  }
  await saveSubscription(stored.userId, 'google_play', purchaseToken, lookup.purchase);
  await acknowledgeIfNeeded(stored.userId, purchaseToken, lookup.purchase);
}

/** Même relecture pour un achat unique Google (remboursement, achat payé en différé). */
export async function refreshOneTimeFromNotification(purchaseToken: string, productId: string): Promise<void> {
  const stored = await purchaseByToken(purchaseToken);
  if (stored === null) {
    return;
  }
  const lookup = await lookupProduct(productId, purchaseToken);
  if (lookup.kind === 'unavailable') {
    throw new Error('Google indisponible');
  }
  if (lookup.kind === 'found') {
    await savePurchase(stored.userId, 'google_play', purchaseToken, lookup.purchase);
  }
}

/**
 * Relit un achat App Store signalé par une notification d'Apple
 * (renouvellement, expiration, remboursement…). Seule la transaction
 * d'origine est tirée de la notification, et l'état est relu chez Apple.
 * Un achat encore inconnu est ignoré, comme chez Google.
 */
export async function refreshAppleFromNotification(originalTransactionId: string): Promise<void> {
  const [subscription, purchase] = await Promise.all([
    subscriptionByToken(originalTransactionId),
    purchaseByToken(originalTransactionId),
  ]);
  const stored = subscription ?? purchase;
  if (stored === null) {
    return;
  }
  const lookup = await lookupAppleTransaction(originalTransactionId);
  if (lookup.kind === 'unavailable') {
    throw new Error('App Store indisponible');
  }
  if (lookup.kind === 'not_found') {
    return;
  }
  const saved = await saveAppleTransaction(
    stored.userId,
    originalTransactionId,
    lookup.value.productId,
    lookup.value.revoked,
  );
  if (saved === 'unavailable') {
    throw new Error('App Store indisponible');
  }
}
