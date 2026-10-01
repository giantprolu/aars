import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { requireEnv } from '../env';
import * as schema from './schema';

/**
 * Connexion Postgres. Postgres est la seule source de vérité (AD-5).
 *
 * L'absence de DATABASE_URL lève explicitement au premier appel plutôt que de
 * se rabattre sur des données factices : un journal silencieusement vide serait
 * pire qu'une erreur. Voir B-2 de BLOCKERS.md.
 */

type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

export function db(): Database {
  if (!cached) {
    cached = drizzle(neon(requireEnv('DATABASE_URL')), { schema });
  }
  return cached;
}

export { schema };
