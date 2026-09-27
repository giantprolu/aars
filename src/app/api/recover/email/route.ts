import { z } from 'zod';
import { apiError } from '@/server/errors';
import { emailRecoveryAvailable, requestEmailReset } from '@/server/services/account';

export const runtime = 'nodejs';

const requestSchema = z.object({ email: z.string().trim().min(3).max(254) });

/**
 * Demande un lien de réinitialisation.
 *
 * Répond 202 que l'adresse ait un compte ou non : la réponse ne doit rien
 * apprendre sur qui est inscrit.
 */
export async function POST(request: Request): Promise<Response> {
  if (!emailRecoveryAvailable()) {
    return apiError('not_found');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  await requestEmailReset(parsed.data.email);
  return Response.json({ ok: true }, { status: 202 });
}
