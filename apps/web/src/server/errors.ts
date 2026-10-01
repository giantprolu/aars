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
  internal: 500,
};

export function apiError(code: ApiErrorCode, message?: string): Response {
  const body: ApiErrorBody = {
    error: { code, message: message ?? MESSAGES[code] },
  };
  return Response.json(body, { status: STATUS[code] });
}
