import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { openSessionFor, startFreeSession, startSession } from '@/server/services/workouts';

export const runtime = 'nodejs';

/** La séance ouverte, s'il y en a une. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  return Response.json({ session: await openSessionFor(userId) });
}

const startSchema = z.object({
  /** Séance modèle suivie, ou `null` pour une séance improvisée. */
  templateId: z.number().int().positive().nullable().default(null),
  /** Une séance libre, à laquelle on ajoute les exercices en cours de route. */
  free: z.boolean().default(false),
});

/**
 * Ouvre une séance.
 *
 * Répond 200 et non 201 quand une séance était déjà ouverte : rien n'a été
 * créé, et le client doit rejoindre celle qui existe.
 */
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

  const parsed = startSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = parsed.data.free
    ? await startFreeSession(userId)
    : await startSession(userId, parsed.data.templateId);
  switch (result.kind) {
    case 'started':
      return Response.json({ id: result.id }, { status: 201 });
    case 'already_open':
      return Response.json({ id: result.id, alreadyOpen: true });
    case 'not_found':
      return apiError('not_found', 'Séance introuvable.');
  }
}
