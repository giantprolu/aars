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
