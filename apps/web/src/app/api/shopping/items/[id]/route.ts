import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { checkItem, removeItem } from '@/server/services/shopping';
import { isValidBarcode } from '@/lib/barcode';

export const runtime = 'nodejs';

/**
 * Un article de la liste : le cocher, le décocher, le retirer.
 *
 * Cocher au scanner porte le code-barres du produit posé dans le chariot.
 * Il n'est pas qu'une trace : c'est lui qui décidera des macros des prochains
 * repas construits sur cet ingrédient.
 */
const patchSchema = z.object({
  checked: z.boolean(),
  barcode: z
    .string()
    .trim()
    .refine(isValidBarcode, 'Code-barres invalide.')
    .nullable()
    .default(null),
  refKind: z.enum(['ciqual', 'product']),
  refValue: z.string().trim().min(1).max(64),
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

  const updated = await checkItem(userId, { itemId: id, ...parsed.data });
  return updated ? Response.json({ ok: true }) : apiError('not_found');
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

  const removed = await removeItem(userId, id);
  return removed ? new Response(null, { status: 204 }) : apiError('not_found');
}
