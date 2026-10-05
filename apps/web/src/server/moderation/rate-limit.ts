import 'server-only';
import { createHmac } from 'node:crypto';
import type { RateRule } from '@/lib/moderation/config';
import { env } from '../env';
import { hitRateLimit } from '../db/queries/moderation';
import { logModeration } from './log';

/**
 * Limites de fréquence, comptées en base : l'app tourne en fonctions sans
 * mémoire partagée, et Postgres est déjà là. Une requête par geste limité.
 */
export async function withinLimit(key: string, rule: RateRule): Promise<boolean> {
  const count = await hitRateLimit(key, rule.windowSeconds);
  const allowed = count <= rule.limit;
  if (!allowed) {
    // La clé nomme le geste, pas la personne : le numéro de compte reste, l'empreinte IP aussi.
    logModeration('rate_limited', { gesture: key.split(':')[0] ?? 'unknown', count, limit: rule.limit });
  }
  return allowed;
}

/**
 * L'empreinte de l'adresse IP d'une requête, pour compter les inscriptions
 * sans garder l'adresse. Vercel pose `x-forwarded-for` lui-même et écrase ce
 * qu'envoie le client. `null` sans secret de session (développement) ou sans
 * adresse : on ne limite pas ce qu'on ne sait pas compter.
 */
export function ipFingerprint(request: Request): string | null {
  const secret = env.sessionSecret;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
  if (!secret || !ip) {
    return null;
  }
  return createHmac('sha256', `${secret}:rate-limit`).update(ip).digest('base64url').slice(0, 22);
}
