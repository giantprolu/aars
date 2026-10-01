import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { favoritesFor, saveMealAsFavorite } from '@/server/services/favorites';
import { MAX_FAVORITE_NAME } from '@/lib/favorites';
import { MEALS } from '@/lib/meal';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  return Response.json({ favorites: await favoritesFor(userId) });
}

/**
 * Met en favori un repas du journal du jour.
 *
 * Le corps ne porte que le repas et un nom : les aliments sont relus au
 * journal par le serveur, jamais reçus du navigateur.
 */
const saveSchema = z.object({
  meal: z.enum(MEALS),
  name: z.string().max(MAX_FAVORITE_NAME).nullable().default(null),
});

export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await saveMealAsFavorite(userId, parsed.data.meal, parsed.data.name);
  if (result.kind === 'empty') {
    return apiError('invalid_input', 'Ce repas est vide aujourd’hui.');
  }
  if (result.kind === 'too_large') {
    return apiError('invalid_input', 'Ce repas compte trop d’aliments pour un favori.');
  }
  return Response.json({ favorite: result.favorite }, { status: 201 });
}
