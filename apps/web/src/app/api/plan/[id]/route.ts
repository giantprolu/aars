import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { journalPlannedMeal, reopenMeal, unplanMeal } from '@/server/services/meal-plan';

export const runtime = 'nodejs';

/**
 * Un plat prévu : le retirer du plan, le marquer mangé, ou revenir sur ce
 * marquage.
 *
 * Marquer mangé est un POST et non un PUT : ce n'est pas la mise à jour d'une
 * ressource mais une opération qui écrit ailleurs, dans le journal, et dont
 * l'effet ne se résume pas à l'état du plat.
 */
const actionSchema = z.object({ action: z.enum(['journal', 'reopen']) });

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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

  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  if (parsed.data.action === 'reopen') {
    const reopened = await reopenMeal(userId, id);
    return reopened ? Response.json({ ok: true }) : apiError('not_found');
  }

  const result = await journalPlannedMeal(userId, id);
  switch (result.kind) {
    case 'journaled':
      return Response.json({ created: result.created, skipped: result.skipped });
    case 'already_journaled':
      return apiError('invalid_input', 'Ce plat est déjà au journal.');
    case 'nothing_to_journal':
      return apiError('invalid_input', "Aucun ingrédient de cette recette n'a de fiche.");
    case 'not_found':
      return apiError('not_found');
  }
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

  const removed = await unplanMeal(userId, id);
  return removed ? new Response(null, { status: 204 }) : apiError('not_found');
}
