import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  issueSessionToken,
  sessionCookieOptions,
} from '@/server/auth';
import { apiError } from '@/server/errors';
import { resetWithToken } from '@/server/services/account';

export const runtime = 'nodejs';

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(512),
});

/** Nouveau mot de passe avec le lien reçu par courriel. */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = resetSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await resetWithToken(parsed.data.token, parsed.data.password);
  if (result.kind === 'refused') {
    return apiError('unauthorized', 'Lien expiré ou déjà utilisé, ou mot de passe trop court.');
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await issueSessionToken(result.userId),
    sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return Response.json({ ok: true });
}
