import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  hashPassword,
  issueSessionToken,
  sessionCookieOptions,
} from '@/server/auth';
import { apiError } from '@/server/errors';
import { createUser } from '@/server/db/queries/users';

export const runtime = 'nodejs';

/**
 * Inscription (FR-1).
 *
 * Libre : aucun code d'invitation. Sans service d'envoi de courriel, l'adresse
 * n'est pas vérifiée et aucune récupération de mot de passe n'est possible.
 * Elle sert d'identifiant, rien de plus.
 */
const registerSchema = z.object({
  // Volontairement permissif : sans vérification par courriel, une validation
  // stricte n'apporte qu'un faux sentiment de contrôle.
  // Le rognage est fait par normalizeEmail, seule autorite sur la forme stockee.
  email: z.email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(512),
});

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      'invalid_input',
      `Adresse invalide ou mot de passe de moins de ${MIN_PASSWORD_LENGTH} caractères.`,
    );
  }

  let result: Awaited<ReturnType<typeof createUser>>;
  try {
    result = await createUser(parsed.data.email, await hashPassword(parsed.data.password));
  } catch (error) {
    console.error('[users] creation du compte en echec', error);
    return apiError('internal');
  }

  if (result.kind === 'email_taken') {
    return apiError('email_taken');
  }

  // La session est ouverte dans la foulée : redemander le mot de passe juste
  // après l'avoir choisi n'apporte rien.
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await issueSessionToken(result.user.id),
    sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return Response.json({ ok: true }, { status: 201 });
}
