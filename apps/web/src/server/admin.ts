import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/**
 * Vrai si la requête vient du tableau de bord : l'en-tête `x-admin-key` porte
 * `ADMIN_API_KEY`. Les deux côtés sont réduits à leur empreinte avant d'être
 * comparés en temps constant, pour ne trahir ni la valeur ni la longueur.
 *
 * Sans `ADMIN_API_KEY`, personne n'est admin : les routes `/api/admin/*`
 * répondent 404, comme si elles n'existaient pas.
 */
export function isAdminRequest(request: Request): boolean {
  const expected = env.adminApiKey;
  const given = request.headers.get('x-admin-key');
  if (!expected || !given) {
    return false;
  }
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
