import type { ApiErrorBody, ApiErrorCode } from '@/lib/types';

/**
 * Liste fermée des erreurs de route (spine, conventions).
 * Aucun message d'exception brute n'est propagé au client.
 */
const MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: 'Session requise.',
  invalid_input: 'Requête invalide.',
  email_taken: 'Cette adresse a déjà un compte.',
  not_found: 'Introuvable.',
  payload_too_large: 'Image trop lourde.',
  model_unavailable: 'Reconnaissance indisponible.',
  model_quota_exceeded: 'Quota du modèle de reconnaissance épuisé.',
  model_bad_format: 'Réponse du modèle inexploitable.',
  upstream_unavailable: 'Service indisponible.',
  premium_required: 'Réservé aux abonnés.',
  purchase_invalid: 'Achat introuvable ou déjà rattaché à un autre compte.',
  content_rejected: 'Ce texte ne respecte pas les règles de la Communauté.',
  community_restricted: 'Ton accès à la Communauté est limité.',
  rate_limited: 'Trop de demandes en peu de temps. Réessaie un peu plus tard.',
  forbidden: 'Ce geste demande une permission que ce rôle n’a pas.',
  conflict: 'Le dossier a changé depuis son ouverture : recharge-le avant de décider.',
  internal: 'Erreur interne.',
};

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_input: 400,
  email_taken: 409,
  not_found: 404,
  payload_too_large: 413,
  model_unavailable: 503,
  model_quota_exceeded: 429,
  model_bad_format: 422,
  upstream_unavailable: 502,
  // 403 et non 402 : le client n'a rien à payer pour cette requête, il lui
  // manque un droit. Les apps l'affichent comme une invitation à s'abonner.
  premium_required: 403,
  purchase_invalid: 409,
  // 422 et non 400 : la requête est bien formée, c'est son contenu que les
  // règles de la Communauté refusent. Le message dit quoi faire.
  content_rejected: 422,
  community_restricted: 403,
  rate_limited: 429,
  forbidden: 403,
  conflict: 409,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message?: string): Response {
  const body: ApiErrorBody = {
    error: { code, message: message ?? MESSAGES[code] },
  };
  return Response.json(body, { status: STATUS[code] });
}
