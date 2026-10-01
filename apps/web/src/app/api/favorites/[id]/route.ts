import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { removeFavorite, replayFavorite } from '@/server/services/favorites';
import { MEALS } from '@/lib/meal';
import { recordMeal } from '@/server/services/usage';

export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const replaySchema = z.object({ meal: z.enum(MEALS) });

/** Recopie un favori dans le journal du jour, au repas choisi. */
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

  const parsed = replaySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await replayFavorite(userId, id, parsed.data.meal);
  if (result.kind !== 'added') {
    return apiError('not_found');
  }
  await recordMeal(userId, 'favorite');
  return Response.json({ count: result.count }, { status: 201 });
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

  return (await removeFavorite(userId, id))
    ? new Response(null, { status: 204 })
    : apiError('not_found');
}
