import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { removeEntry } from '@/server/services/entries';

export const runtime = 'nodejs';

/** Supprime une entrée (FR-5). Refuse sans session (FR-2). */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return apiError('invalid_input');
  }

  const removed = await removeEntry(userId, numericId);
  if (!removed) {
    return apiError('not_found');
  }
  return Response.json({ ok: true });
}
