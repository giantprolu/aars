import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { rotateIngestToken } from '@/server/db/queries/users';

export const runtime = 'nodejs';

/**
 * Fabrique un jeton d'ingestion pour le raccourci iOS (FR-27).
 *
 * En POST seulement, et jamais en GET : chaque appel remplace le jeton
 * précédent, ce qui n'est pas une lecture. C'est aussi le moyen de révoquer un
 * raccourci partagé par erreur, puisque l'ancien jeton cesse aussitôt de
 * fonctionner.
 */
export async function POST(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  try {
    return Response.json({ token: await rotateIngestToken(userId) });
  } catch (error) {
    console.error('[ingest-token] rotation en echec', error);
    return apiError('internal');
  }
}
