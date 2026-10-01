import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { recipeFor, removeRecipe, saveRecipe } from '@/server/services/recipes';
import { MAX_PLANNED_SERVINGS, journalRecipe } from '@/server/services/recipe-journal';
import { REJECTION_MESSAGES, recipeSchema } from '@/server/validation/recipes';
import { MEALS } from '@/lib/meal';
import { recordMeal } from '@/server/services/usage';

export const runtime = 'nodejs';

/**
 * Une recette donnée.
 *
 * Chaque gestionnaire passe l'utilisateur de la session au service, qui le
 * pose en tête de sa clause `where`. L'identifiant de l'URL ne désigne donc
 * jamais qu'une recette du demandeur : celle d'un autre compte répond 404,
 * exactement comme une recette inexistante. Distinguer les deux dirait à qui
 * essaie qu'il a visé juste.
 */

/** Rend l'identifiant de l'URL, ou `null` s'il n'en est pas un. */
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  const recipe = await recipeFor(userId, id);
  return recipe === null ? apiError('not_found') : Response.json({ recipe });
}

/**
 * Inscrit la recette au journal du jour, un ingrédient par ligne.
 *
 * POST et non PUT, comme pour un plat prévu : ce n'est pas la mise à jour de
 * la recette mais une opération qui écrit ailleurs, dans le journal, et qui
 * laisse la fiche inchangée.
 *
 * Le corps ne porte pas de date : le jour est celui du serveur. Rien dans ce
 * parcours ne sert à corriger le passé, et ouvrir ce paramètre reviendrait à
 * offrir une écriture datée par le client sur des données de santé.
 */
const journalSchema = z.object({
  action: z.literal('journal'),
  meal: z.enum(MEALS),
  servings: z.number().finite().positive().max(MAX_PLANNED_SERVINGS),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = journalSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await journalRecipe(userId, {
    recipeId: id,
    meal: parsed.data.meal,
    servings: parsed.data.servings,
  });
  switch (result.kind) {
    case 'journaled':
      await recordMeal(userId, 'recipe');
      return Response.json({ created: result.created, skipped: result.skipped });
    case 'nothing_to_journal':
      return apiError('invalid_input', "Aucun ingrédient de cette recette n'a de fiche.");
    case 'invalid':
      return apiError('invalid_input');
    case 'not_found':
      return apiError('not_found');
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = recipeSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await saveRecipe(userId, id, parsed.data);
  if (result.kind === 'invalid') {
    return apiError('invalid_input', REJECTION_MESSAGES[result.reason]);
  }
  if (result.kind === 'not_found') {
    return apiError('not_found');
  }
  return Response.json({ id: result.id });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  const removed = await removeRecipe(userId, id);
  return removed ? new Response(null, { status: 204 }) : apiError('not_found');
}
