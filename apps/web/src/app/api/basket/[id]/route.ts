import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import {
  MAX_BASKET_SERVINGS,
  removeFromBasket,
  setBasketServings,
} from '@/server/services/basket';

export const runtime = 'nodejs';

/** Un plat du panier : régler ses parts, ou le retirer. */
const patchSchema = z.object({
  servings: z.number().finite().positive().max(MAX_BASKET_SERVINGS),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
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

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await setBasketServings(userId, id, parsed.data.servings);
  if (result === 'invalid') {
    return apiError('invalid_input');
  }
  return result === 'updated' ? Response.json({ ok: true }) : apiError('not_found');
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

  const removed = await removeFromBasket(userId, id);
  return removed ? new Response(null, { status: 204 }) : apiError('not_found');
}
