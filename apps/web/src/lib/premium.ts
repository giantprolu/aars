/**
 * Abonnement : limites de la version gratuite et lecture de l'état d'un achat.
 *
 * Module pur : les limites sont affichées par les clients, et la décision
 * « abonné ou non » doit se vérifier hors ligne (`scripts/verify-pure.ts`).
 *
 * Ce qui reste gratuit, quoi qu'il arrive : le journal, l'export des données
 * et la suppression du compte (obligation RGPD). Décision du 01/10/2026.
 */

/**
 * Recettes écrites par l'utilisateur. Les plats installés depuis le catalogue
 * ne comptent pas : ils nourrissent le plan de la semaine, et les compter
 * brideraient le plan dès dix plats.
 */
export const FREE_RECIPE_LIMIT = 10;

export const FREE_FAVORITE_LIMIT = 10;

/**
 * États d'un abonnement Google Play, tels que `subscriptionsv2` les nomme,
 * sans le préfixe `SUBSCRIPTION_STATE_`.
 */
export const STORE_STATES = [
  'active',
  'in_grace_period',
  'on_hold',
  'paused',
  'canceled',
  'expired',
  'pending',
  'pending_purchase_canceled',
  'unspecified',
] as const;

export type StoreState = (typeof STORE_STATES)[number];

export function parseStoreState(raw: string | undefined): StoreState {
  const state = (raw ?? '').replace(/^SUBSCRIPTION_STATE_/, '').toLowerCase();
  return (STORE_STATES as readonly string[]).includes(state)
    ? (state as StoreState)
    : 'unspecified';
}

/**
 * Vrai si l'abonnement ouvre les fonctions payantes à cet instant.
 *
 * Résilié ne veut pas dire terminé : la personne a payé jusqu'à l'échéance et
 * garde l'accès jusque-là. Le délai de grâce (paiement refusé, Google
 * réessaie) garde l'accès aussi, c'est ce que Google demande. Suspendu, en
 * pause, en attente de paiement ou expiré : plus d'accès.
 */
export function grantsPremium(state: StoreState, expiresAt: Date | null, now: Date): boolean {
  if (state !== 'active' && state !== 'in_grace_period' && state !== 'canceled') {
    return false;
  }
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/** Vrai si la version gratuite permet encore d'en ajouter un. */
export function underFreeLimit(count: number, limit: number): boolean {
  return count < limit;
}

/*
 * Catalogue des produits (décision du 05/10/2026) : un abonnement mensuel qui
 * ouvre tout, et un achat unique, Cuisine+, qui ouvre à vie le plan
 * automatique de la semaine et l'import de recette. Les identifiants sont
 * ceux des magasins : à créer à l'identique dans la Play Console et App Store
 * Connect.
 */

export const STORES = ['google_play', 'app_store'] as const;

export type Store = (typeof STORES)[number];

/** L'abonnement mensuel. Google range les durées en forfaits d'un même produit, Apple en produits distincts. */
export const SUBSCRIPTION_PRODUCTS: Record<Store, string> = {
  google_play: 'aars_premium',
  app_store: 'aars_premium_mensuel',
};

/** Cuisine+ : le même identifiant dans les deux magasins. */
export const KITCHEN_PLUS_PRODUCT = 'aars_cuisine_plus';

/**
 * Cuisine+ en vente dans les apps : ses deux fonctions existent depuis le
 * 05/10/2026 (`POST /api/plan/auto`, `POST /api/recipes/import`). Les apps
 * lisent ce drapeau dans `GET /api/billing` ; le remettre à faux retire l'offre
 * sans retirer les fonctions à ceux qui l'ont achetée.
 */
export const KITCHEN_PLUS_ON_SALE = true;

/**
 * La vente dans les apps. Fermée tant que l'éditeur n'est pas immatriculé
 * (décision du 05/10/2026) : les apps ne proposent rien, et ce qu'ouvrent
 * l'abonnement et Cuisine+ l'est pour tous, sans limite gratuite. La rouvrir
 * rend aux achats et aux limites leur effet, sans rien d'autre à changer.
 */
export const SALES_OPEN = false;

/** États d'un achat unique, dans les termes du serveur. */
export const PURCHASE_STATES = ['purchased', 'pending', 'refunded'] as const;

export type PurchaseState = (typeof PURCHASE_STATES)[number];

export function parsePurchaseState(raw: string | undefined): PurchaseState {
  return (PURCHASE_STATES as readonly string[]).includes(raw ?? '') ? (raw as PurchaseState) : 'pending';
}

/** Un achat unique ouvre son droit tant qu'il est payé et pas remboursé. */
export function grantsPurchase(state: PurchaseState): boolean {
  return state === 'purchased';
}

/**
 * Google Play, `purchases.products` : 0 acheté, 1 annulé (remboursé ou
 * révoqué), 2 en attente de paiement.
 */
export function googlePurchaseState(purchaseState: number | undefined): PurchaseState {
  if (purchaseState === 0) return 'purchased';
  if (purchaseState === 1) return 'refunded';
  return 'pending';
}

/**
 * L'état d'un abonnement App Store, ramené aux états Google que le serveur
 * connaît déjà. Statuts de l'App Store Server API : 1 actif, 2 expiré,
 * 3 nouvel essai de facturation (plus d'accès), 4 délai de grâce (accès),
 * 5 révoqué. Un abonnement actif dont le renouvellement est coupé est
 * « résilié » : payé jusqu'à l'échéance.
 */
export function appleSubscriptionState(status: number, autoRenewing: boolean): StoreState {
  switch (status) {
    case 1:
      return autoRenewing ? 'active' : 'canceled';
    case 3:
      return 'on_hold';
    case 4:
      return 'in_grace_period';
    case 2:
    case 5:
      return 'expired';
    default:
      return 'unspecified';
  }
}

/** Les droits d'un compte. L'abonnement ouvre tout, Cuisine+ comprise. */
export interface Entitlements {
  premium: boolean;
  kitchenPlus: boolean;
}

export function entitlementsFrom(premium: boolean, ownsKitchenPlus: boolean): Entitlements {
  return { premium, kitchenPlus: premium || ownsKitchenPlus };
}

/**
 * Un UUID tiré d'une empreinte hexadécimale : l'`appAccountToken` que l'app
 * passe à l'App Store au moment de l'achat, qui exige ce format.
 */
export function uuidFromHex(hex: string): string {
  const h = hex.toLowerCase().replace(/[^0-9a-f]/g, '').padEnd(32, '0').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
