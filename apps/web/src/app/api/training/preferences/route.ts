import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { gymCatalog, preferencesFor, savePreferences } from '@/server/services/workouts';
import { MAX_SESSIONS_PER_WEEK, MIN_SESSIONS_PER_WEEK } from '@/lib/workout';

export const runtime = 'nodejs';

/** Les réponses de l'utilisateur, et la liste des salles pour les changer. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const [preferences, gyms] = await Promise.all([preferencesFor(userId), gymCatalog()]);
  return Response.json({ preferences, gyms });
}

const preferencesSchema = z.object({
  /** `null` quand l'utilisateur ne précise pas sa salle. */
  gymId: z.number().int().positive().nullable().default(null),
  focus: z.enum(['upper', 'lower', 'full']),
  equipment: z.enum(['free', 'machine', 'any']),
  sessionsPerWeek: z.number().int().min(MIN_SESSIONS_PER_WEEK).max(MAX_SESSIONS_PER_WEEK),
});

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

  const parsed = preferencesSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await savePreferences(userId, parsed.data);
  switch (result.kind) {
    case 'saved':
      return Response.json({ preferences: result.preferences });
    case 'not_found':
      return apiError('not_found', 'Salle inconnue.');
    case 'invalid':
      return apiError('invalid_input');
  }
}
