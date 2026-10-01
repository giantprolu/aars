import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { profileFor, recordProfile, targetFor } from '@/server/services/profile';
import { ACTIVITY_FACTORS } from '@/lib/energy';
import { isJournalDate } from '@/lib/date';

export const runtime = 'nodejs';

/**
 * Profil corporel et cible calorique (FR-26).
 *
 * Les bornes physiologiques sont vérifiées par le service, pas ici : zod ne
 * contrôle que la forme, et une seule autorité doit trancher ce qui est
 * plausible.
 */
const profileSchema = z.object({
  sex: z.enum(['male', 'female']),
  birthDate: z.string().refine(isJournalDate, 'Date invalide.'),
  heightCm: z.number().int(),
  weightKg: z.number(),
  bodyFatPercent: z.number().nullable(),
  activity: z.enum(Object.keys(ACTIVITY_FACTORS) as [string, ...string[]]),
  goal: z.enum(['lose', 'maintain', 'gain']),
  ratePercentPerWeek: z.number(),
  /** Cible fixée à la main. `null` rend la main au calcul. */
  manualTargetKcal: z.number().int().nullable(),
});

export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const [profile, target] = await Promise.all([profileFor(userId), targetFor(userId)]);
  return Response.json({ profile, target });
}

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

  const parsed = profileSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await recordProfile(userId, parsed.data as Parameters<typeof recordProfile>[1]);
  if (result.kind === 'invalid') {
    return apiError('invalid_input', 'Mesures hors des bornes admises.');
  }

  return Response.json({ target: result.target });
}
