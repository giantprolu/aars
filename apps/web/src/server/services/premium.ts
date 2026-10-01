import 'server-only';
import {
  FREE_FAVORITE_LIMIT,
  FREE_RECIPE_LIMIT,
  grantsPremium,
  underFreeLimit,
} from '@/lib/premium';
import { requireEnv } from '../env';
import {
  acknowledgeSubscription,
  lookupSubscription,
  type StorePurchase,
} from '../clients/google-play';
import {
  countFavorites,
  countOwnRecipes,
  markAcknowledged,
  saveSubscription,
  subscriptionByToken,
  subscriptionsFor,
} from '../db/queries/premium';

/**
 * Service de l'abonnement (freemium, décision du 01/10/2026).
 *
 * Le droit se décide ici et nulle part ailleurs : les apps affichent ce que
 * le serveur leur dit, et chaque route payante redemande. Un téléphone qui se
 * dirait abonné n'ouvre rien.
 */

export interface PremiumStatus {
  premium: boolean;
  /** Échéance de l'abonnement qui ouvre l'accès, `null` sans abonnement actif. */
  expiresAt: Date | null;
  limits: { recipes: number; favorites: number };
  usage: { recipes: number; favorites: number };
}

export async function isPremium(userId: number, now: Date = new Date()): Promise<boolean> {
  const subscriptions = await subscriptionsFor(userId);
  return subscriptions.some((item) => grantsPremium(item.state, item.expiresAt, now));
}

export async function premiumStatus(userId: number, now: Date = new Date()): Promise<PremiumStatus> {
  const [subscriptions, recipes, favorites] = await Promise.all([
    subscriptionsFor(userId),
    countOwnRecipes(userId),
    countFavorites(userId),
  ]);
  const granting = subscriptions.find((item) => grantsPremium(item.state, item.expiresAt, now));
  return {
    premium: granting !== undefined,
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

/**
 * Identifiant opaque du compte, que l'app passe à Google au moment de l'achat
 * (`setObfuscatedAccountId`).
 *
 * Google le rend avec l'achat, ce qui lie un jeton au compte qui l'a payé :
 * un jeton intercepté ne peut pas être présenté par un autre compte. Un HMAC
 * plutôt que l'identifiant brut, parce que Google interdit d'y mettre une
 * donnée personnelle, et 64 caractères hexadécimaux, sa limite exacte.
 */
export async function accountRef(userId: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireEnv('SESSION_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`play-account:${userId}`));
  return Buffer.from(signature).toString('hex');
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
 * Rattache un achat Google Play au compte, après l'avoir fait lire à Google.
 *
 * Appelée par l'app juste après l'achat, et à chaque démarrage pour les
 * achats en attente : rejouer est sans effet de bord.
 */
export async function verifyGooglePurchase(
  userId: number,
  purchaseToken: string,
): Promise<VerifyPurchaseResult> {
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
  if (!(await saveSubscription(userId, purchaseToken, purchase))) {
    return { kind: 'invalid' };
  }

  await acknowledgeIfNeeded(userId, purchaseToken, purchase);
  return { kind: 'verified', status: await premiumStatus(userId) };
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
  await saveSubscription(stored.userId, purchaseToken, lookup.purchase);
  await acknowledgeIfNeeded(stored.userId, purchaseToken, lookup.purchase);
}
