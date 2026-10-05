/**
 * Ce que la personne concernée lit. Clair, général, et sans prise : le
 * message dit quelle règle est en cause, jamais quel mot ni quel seuil, pour
 * ne pas apprendre à écrire juste à côté.
 */

import type { ModerationCategory } from './types';

/** La règle en cause, en termes généraux. */
export const CATEGORY_REASONS: Record<ModerationCategory, string> = {
  harassment: 'insultes ou harcèlement',
  hate: 'propos haineux ou discriminatoires',
  threat: 'menaces ou violence',
  sexual: 'contenu sexuel',
  minor_safety: 'protection des mineurs',
  spam: 'spam ou liens',
  scam: 'arnaque ou usurpation',
  self_promotion: 'publicité',
  self_harm: 'contenu qui peut mettre en danger',
  illegal: 'vente ou promotion de produits interdits',
};

/** Le numéro national de prévention du suicide, gratuit, 24 h/24. */
export const SUPPORT_LINE = '3114';

export function rejectedNameMessage(category: ModerationCategory | null): string {
  if (category === 'self_harm') {
    return `Ce nom n’est pas affiché dans la Communauté. Si tu traverses un moment difficile, le ${SUPPORT_LINE} répond gratuitement, jour et nuit.`;
  }
  return 'Ce nom ne respecte pas les règles de la Communauté. Choisis-en un autre.';
}

function formatUntil(until: Date): string {
  return until.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Le message d'un geste refusé parce que l'accès à la Communauté est limité.
 * Il rappelle que le reste de l'app ne change pas : une sanction de la
 * Communauté ne touche ni au journal ni aux séances.
 */
export function standingMessage(kind: 'restricted' | 'suspended' | 'banned', until: Date | null): string {
  const rest = 'Ton journal et tes séances restent accessibles.';
  if (kind === 'banned') {
    return `Ton accès à la Communauté est fermé. ${rest}`;
  }
  const when = until === null ? '' : ` jusqu’au ${formatUntil(until)}`;
  return kind === 'restricted'
    ? `Ton accès à la Communauté est limité${when}. ${rest}`
    : `Ton accès à la Communauté est suspendu${when}. ${rest}`;
}

export const RATE_LIMITED_MESSAGE = 'Trop de demandes en peu de temps. Réessaie un peu plus tard.';
