import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env';
import type { ModerationRole } from '@/lib/moderation/rbac';

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

/** Qui agit depuis le tableau de bord : son nom pour l'audit, son rôle pour les permissions. */
export interface AdminActor {
  /** `admin:<appareil>`, ou `admin` si le tableau de bord ne l'a pas transmis. */
  name: string;
  role: ModerationRole;
}

/**
 * L'auteur d'une requête admin. Le tableau de bord transmet le nom de la
 * passkey qui a ouvert la session (`x-admin-actor`) ; on le croit parce que
 * seul lui détient la clé, vérifiée avant. Le nom est réduit à des
 * caractères sûrs : il finit dans le journal d'audit.
 *
 * Une seule clé, un seul rôle : `admin`. Des comptes de modérateurs
 * porteront un jour leur propre rôle (`lib/moderation/rbac.ts`).
 */
export function adminActor(request: Request): AdminActor {
  // Encodé en URI par le tableau de bord : un en-tête HTTP ne porte que de l'ASCII.
  let raw = request.headers.get('x-admin-actor') ?? '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    raw = '';
  }
  const device = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _.'’-]/gu, '')
    .trim()
    .slice(0, 60);
  return { name: device === '' ? 'admin' : `admin:${device}`, role: 'admin' };
}
