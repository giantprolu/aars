import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { createRecipe, recipesFor } from '@/server/services/recipes';
import { REJECTION_MESSAGES, recipeSchema } from '@/server/validation/recipes';

export const runtime = 'nodejs';

/** Les recettes de l'utilisateur, ingrédients résolus. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  return Response.json({ recipes: await recipesFor(userId) });
}

/**
 * Crée une recette écrite à la main.
 *
 * Les plats du catalogue n'entrent pas par ici : ils passent par `/api/basket`,
 * qui les installe et les met au panier d'un même geste. Deux portes, parce
 * que ce sont deux intentions — écrire une recette, ou choisir sa semaine.
 *
 * `action` subsiste dans le corps, seule valeur admise, pour ne pas rendre
 * invalides les requêtes déjà en vol au moment du déploiement.
 */
const postSchema = recipeSchema.extend({ action: z.literal('create') });

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

  const { name, servings, steps, prepMinutes, notes, ingredients } = parsed.data;
  const result = await createRecipe(userId, {
    name,
    servings,
    steps,
    prepMinutes,
    notes,
    ingredients,
  });
  if (result.kind === 'invalid') {
    return apiError('invalid_input', REJECTION_MESSAGES[result.reason]);
  }
  if (result.kind === 'not_found') {
    return apiError('not_found');
  }

  return Response.json({ id: result.id }, { status: 201 });
}
