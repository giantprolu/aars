import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { importRecipe } from '@/server/services/recipe-import';
import { recordUsage } from '@/server/services/usage';

export const runtime = 'nodejs';

const bodySchema = z.object({ url: z.string().trim().min(8).max(2000) });

/**
 * Lit une page de recette et rend un brouillon (Cuisine+). Rien n'est
 * enregistré : l'app ouvre le brouillon dans l'éditeur, et la recette se crée
 * par `POST /api/recipes` comme une autre, avec `imported: true`.
 */
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
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input', 'Colle l’adresse complète de la page.');
  }

  const result = await importRecipe(userId, parsed.data.url);
  switch (result.kind) {
    case 'premium_required':
      await recordUsage(userId, 'paywall_hit');
      return apiError('premium_required', 'L’import de recette fait partie de Cuisine+.');
    case 'invalid_url':
      return apiError('invalid_input', 'Cette adresse ne peut pas être lue. Colle le lien d’une page web.');
    case 'unreachable':
      return apiError('upstream_unavailable', 'La page n’a pas pu être lue. Vérifie le lien, ou réessaie plus tard.');
    case 'no_recipe':
      return apiError('not_found', 'Aucune recette lisible sur cette page.');
    case 'draft':
      return Response.json({ draft: result.draft });
  }
}
