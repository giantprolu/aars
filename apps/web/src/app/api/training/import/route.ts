import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { analyseWorkoutLog, saveWrittenSession } from '@/server/services/workouts';
import { isJournalDate } from '@/lib/date';
import { MAX_REPS, MAX_SECONDS, MAX_SETS, MAX_WEIGHT_KG } from '@/lib/workout';

export const runtime = 'nodejs';

/**
 * Import d'une séance écrite à la main.
 *
 * Deux temps, et c'est délibéré. `analyse` lit le texte et propose un
 * rapprochement avec le catalogue sans rien écrire ; `save` enregistre ce que
 * l'utilisateur a confirmé. Un exercice mal reconnu se valide bien plus
 * facilement qu'il ne se corrige une fois la séance en base.
 */

/** Plafond du texte accepté. Une séance tient en quinze lignes, jamais mille. */
const MAX_LOG_LENGTH = 4000;

const analyseSchema = z.object({
  action: z.literal('analyse'),
  text: z.string().min(1).max(MAX_LOG_LENGTH),
});

const setSchema = z.object({
  reps: z.number().int().min(1).max(MAX_REPS).nullable().default(null),
  seconds: z.number().int().min(1).max(MAX_SECONDS).nullable().default(null),
  weightKg: z.number().finite().min(0).max(MAX_WEIGHT_KG).nullable().default(null),
  toFailure: z.boolean().default(false),
});

const saveSchema = z.object({
  action: z.literal('save'),
  sessionDate: z.string().refine(isJournalDate, 'Date invalide.'),
  lines: z
    .array(
      z.object({
        exerciseId: z.number().int().positive().nullable().default(null),
        name: z.string().min(1).max(80),
        sets: z.array(setSchema).min(1).max(MAX_SETS),
      }),
    )
    .min(1)
    .max(30),
});

const bodySchema = z.discriminatedUnion('action', [analyseSchema, saveSchema]);

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

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  if (parsed.data.action === 'analyse') {
    return Response.json({ lines: await analyseWorkoutLog(userId, parsed.data.text) });
  }

  const result = await saveWrittenSession(
    userId,
    parsed.data.sessionDate,
    parsed.data.lines,
  );
  switch (result.kind) {
    case 'saved':
      return Response.json({ id: result.id, sets: result.sets }, { status: 201 });
    case 'empty':
      return apiError('invalid_input', 'Aucune série à enregistrer.');
    case 'invalid':
      return apiError('invalid_input', 'Série invalide.');
  }
}
