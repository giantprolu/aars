/**
 * Banc d'essai : la même API que `src/server/db/client.ts`, sur un Postgres
 * en mémoire (PGlite) au lieu de Neon. Les requêtes de l'app y tournent
 * telles quelles, sans jamais toucher la base de production.
 *
 * `register.mjs` redirige vers ce fichier les imports de `../client` faits
 * depuis `src/server/db/queries/`. Les migrations du dépôt sont appliquées
 * par `migrate.ts`.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { drizzle } from 'drizzle-orm/pglite';
import * as everything from '../../src/server/db/schema';

// tsx ajoute au module des entrées sans prototype, que Drizzle ne sait pas lire.
const schema = Object.fromEntries(
  Object.entries(everything).filter(([, value]) => typeof value === 'object' && value !== null && Object.getPrototypeOf(value) !== null),
) as typeof everything;

export const pglite = new PGlite({ extensions: { pg_trgm, unaccent } });

/**
 * Clé d'essai pour les routes admin, posée avant la première lecture de la
 * configuration (`src/server/env.ts` la lit une fois puis la garde).
 */
export const TEST_ADMIN_KEY = 'banc-essai-'.padEnd(40, 'k');
process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;

const database = drizzle(pglite, { schema });

export function db(): typeof database {
  return database;
}

export { schema };
