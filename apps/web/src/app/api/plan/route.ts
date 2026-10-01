import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { MAX_PLANNED_SERVINGS, planForWeek, planMeal } from '@/server/services/meal-plan';
import { isJournalDate } from '@/lib/date';
import { MEALS } from '@/lib/meal';

export const runtime = 'nodejs';

/** Zod à la frontière : le corps est analysé, jamais utilisé tel quel (spine). */
const createSchema = z.object({
  planDate: z.string().refine(isJournalDate, 'Date invalide.'),
  meal: z.enum(MEALS),
  recipeId: z.number().int().positive(),
  servings: z.number().finite().positive().max(MAX_PLANNED_SERVINGS),
});

/** Les plats prévus d'une semaine, à partir du lundi passé en paramètre. */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const from = new URL(request.url).searchParams.get('from');
  if (from === null || !isJournalDate(from)) {
    return apiError('invalid_input');
  }

  return Response.json({ planned: await planForWeek(userId, from) });
}

/** Ajoute un plat au plan. */
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

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await planMeal(userId, parsed.data);
  if (result.kind === 'invalid') {
    return apiError('invalid_input');
  }
  if (result.kind === 'not_found') {
    return apiError('not_found', 'Recette introuvable.');
  }

  return Response.json({ id: result.id }, { status: 201 });
}
