import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { addRecipeToBasket, basketFor } from '@/server/services/basket';
import { MAX_CHOSEN_MEALS, chooseCatalogMeals } from '@/server/services/catalog';
import { MAX_BASKET_SERVINGS } from '@/lib/basket';
import { isJournalDate } from '@/lib/date';

export const runtime = 'nodejs';

/**
 * Le panier de la semaine : les plats retenus, avant qu'on décide quel jour
 * chacun passe à table.
 *
 * Le POST admet deux sources, et c'est `source` qui les distingue. Depuis le
 * catalogue, on envoie des `slug` : l'écran de choix ne connaît que ceux-là,
 * et la recette est installée en chemin si elle ne l'est pas déjà. Depuis le
 * carnet, on envoie un identifiant de recette, qui existe déjà.
 *
 * Les deux portes plutôt qu'une, parce qu'un `slug` et un identifiant ne
 * désignent pas le même objet : le premier nomme un plat du code, le second
 * une ligne qui appartient à quelqu'un. Les confondre dans un seul champ
 * demanderait de deviner lequel on a reçu.
 */

const postSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('catalog'),
    weekStart: z.string().refine(isJournalDate, 'Date invalide.'),
    slugs: z.array(z.string().min(1).max(80)).min(1).max(MAX_CHOSEN_MEALS),
  }),
  z.object({
    source: z.literal('recipe'),
    weekStart: z.string().refine(isJournalDate, 'Date invalide.'),
    recipeId: z.number().int().positive(),
    servings: z.number().finite().positive().max(MAX_BASKET_SERVINGS),
  }),
]);

export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const weekStart = new URL(request.url).searchParams.get('weekStart');
  if (weekStart === null || !isJournalDate(weekStart)) {
    return apiError('invalid_input');
  }

  return Response.json({ basket: await basketFor(userId, weekStart) });
}

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

  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  if (parsed.data.source === 'recipe') {
    const added = await addRecipeToBasket(
      userId,
      parsed.data.weekStart,
      parsed.data.recipeId,
      parsed.data.servings,
    );
    if (added.kind === 'invalid') {
      return apiError('invalid_input');
    }
    if (added.kind === 'not_found') {
      return apiError('not_found', 'Recette introuvable.');
    }
    return Response.json({ id: added.id }, { status: 201 });
  }

  const report = await chooseCatalogMeals(userId, parsed.data.weekStart, parsed.data.slugs);
  // Aucun plat retenu signifie que rien dans la demande ne correspondait au
  // catalogue : c'est une requête invalide, pas un panier vide.
  if (report.chosen === 0 && report.failed.length === 0) {
    return apiError('invalid_input', 'Aucun plat reconnu.');
  }

  return Response.json({ report }, { status: 201 });
}
