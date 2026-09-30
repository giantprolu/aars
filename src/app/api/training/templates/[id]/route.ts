import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { favoriteTemplate } from '@/server/services/workouts';
import { MAX_TEMPLATE_NAME } from '@/lib/workout';

export const runtime = 'nodejs';

const patchSchema = z.object({
  favorite: z.boolean(),
  /** Le nom sous lequel ranger une séance improvisée qu'on garde. */
  name: z.string().max(MAX_TEMPLATE_NAME).nullable().default(null),
});

/** Range une séance modèle dans les favoris, ou l'en sort. */
export async function PATCH(
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

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const saved = await favoriteTemplate(userId, id, parsed.data.favorite, parsed.data.name);
  return saved ? Response.json({ ok: true }) : apiError('not_found');
}
