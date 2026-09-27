import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  issueSessionToken,
  sessionCookieOptions,
} from '@/server/auth';
import { apiError } from '@/server/errors';
import { recoverWithCode } from '@/server/services/account';

export const runtime = 'nodejs';

const recoverSchema = z.object({
  email: z.string().trim().min(3).max(254),
  code: z.string().trim().min(8).max(40),
  password: z.string().min(1).max(512),
});

/**
 * Nouveau mot de passe avec le code de secours. La session s'ouvre dans la
 * foulée, comme après une inscription : redemander ce qu'on vient de choisir
 * n'apporte rien.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = recoverSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await recoverWithCode(parsed.data.email, parsed.data.code, parsed.data.password);
  if (result.kind === 'refused') {
    // Un seul message : ni l'adresse, ni le code, ni le mot de passe n'est
    // désigné, pour ne rien apprendre à qui essaie des adresses.
    return apiError(
      'unauthorized',
      'Adresse ou code incorrect, ou mot de passe trop court.',
    );
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await issueSessionToken(result.userId),
    sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return Response.json({ ok: true });
}
