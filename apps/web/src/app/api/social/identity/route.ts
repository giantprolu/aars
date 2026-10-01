import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { saveIdentity } from '@/server/services/social';
import { DISPLAY_NAME_MAX, HANDLE_MAX } from '@/lib/social';

export const runtime = 'nodejs';

const identitySchema = z.object({
  // L'arobase éventuelle compte dans la longueur saisie, d'où le caractère de plus.
  handle: z.string().min(1).max(HANDLE_MAX + 1),
  displayName: z.string().max(DISPLAY_NAME_MAX * 2).nullable().default(null),
});

/** Choisit son identifiant public et son nom affiché. */
export async function PUT(request: Request): Promise<Response> {
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

  const parsed = identitySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await saveIdentity(userId, parsed.data.handle, parsed.data.displayName);
  switch (result.kind) {
    case 'saved':
      return Response.json({ ok: true });
    case 'invalid':
      return apiError('invalid_input', 'Identifiant invalide.');
    case 'taken':
      return Response.json({ taken: true }, { status: 409 });
  }
}
