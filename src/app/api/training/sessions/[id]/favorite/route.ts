import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { favoriteSession } from '@/server/services/workouts';
import { MAX_TEMPLATE_NAME } from '@/lib/workout';

export const runtime = 'nodejs';

const favoriteSchema = z.object({
  name: z.string().max(MAX_TEMPLATE_NAME).nullable().default(null),
});

/** Retient une séance faite dans les favoris, pour la refaire. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError('invalid_input');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = favoriteSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await favoriteSession(userId, id, parsed.data.name);
  switch (result.kind) {
    case 'saved':
      return Response.json({ templateId: result.templateId }, { status: 201 });
    case 'already':
      return Response.json({ already: true });
    case 'empty':
      return apiError('invalid_input', 'Cette séance ne compte aucune série.');
    case 'not_found':
      return apiError('not_found');
  }
}
