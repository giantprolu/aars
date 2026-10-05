import { z } from 'zod';
import { REPORT_NOTE_MAX, REPORT_REASONS } from '@/lib/social';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { report } from '@/server/services/social';

export const runtime = 'nodejs';

/** Une personne, ou une de ses séances que je vois, et pourquoi. */
const reportSchema = z.object({
  userId: z.number().int().positive(),
  sessionId: z.number().int().positive().nullish(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(REPORT_NOTE_MAX).nullish(),
});

/**
 * Signale un compte ou une séance à l'équipe qui modère (règle 1.2 de l'App
 * Store). Une cible qu'on ne peut pas voir répond comme une cible absente.
 */
export async function POST(request: Request): Promise<Response> {
  const viewerId = await currentUserId();
  if (viewerId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const { userId, sessionId, reason, note } = parsed.data;
  switch (await report(viewerId, { userId, sessionId: sessionId ?? null, reason, note: note ?? null })) {
    case 'created':
      return Response.json({ ok: true }, { status: 201 });
    case 'not_found':
      return apiError('not_found');
    case 'rate_limited':
      return apiError('rate_limited', 'Tu as fait beaucoup de signalements récemment. Réessaie plus tard.');
  }
}
