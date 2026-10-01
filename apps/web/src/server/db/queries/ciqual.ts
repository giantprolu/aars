import 'server-only';
import { sql } from 'drizzle-orm';
import { db, schema } from '../client';

/**
 * État de la table de référence CIQUAL, pour l'écran de réglages (FR-24).
 *
 * La date d'import n'est pas stockée à part : chaque ligne porte son
 * `updated_at`, et l'import les réécrit toutes. Leur maximum est donc la date
 * du dernier passage, sans table de métadonnées à tenir à jour.
 */
export interface CiqualStatus {
  /** Nombre d'aliments en base, tous états confondus. */
  count: number;
  /** Date du dernier import, ou `null` si la table est vide. */
  lastImportedAt: Date | null;
}

export async function getCiqualStatus(): Promise<CiqualStatus> {
  const [row] = await db()
    .select({
      count: sql<number>`count(*)::int`,
      // Un horodatage agrégé revient en texte du pilote HTTP, dans un format
      // qui dépend des réglages de la base. L'époque en millisecondes ne
      // dépend de rien et se relit sans ambiguïté de fuseau.
      lastImportedMs: sql<
        number | null
      >`(extract(epoch from max(${schema.ciqualFoods.updatedAt})) * 1000)::bigint`,
    })
    .from(schema.ciqualFoods);

  if (!row || row.count === 0 || row.lastImportedMs === null) {
    return { count: row?.count ?? 0, lastImportedAt: null };
  }

  const parsed = new Date(Number(row.lastImportedMs));
  return {
    count: row.count,
    lastImportedAt: Number.isNaN(parsed.getTime()) ? null : parsed,
  };
}
