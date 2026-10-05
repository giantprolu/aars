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
import { isMobileClient } from '@/server/guard';
import { createUser } from '@/server/db/queries/users';
import { RATE_LIMITS } from '@/lib/moderation/config';
import { ipFingerprint, withinLimit } from '@/server/moderation/rate-limit';

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

  // Les inscriptions en rafale depuis une même adresse : des comptes jetables
  // pour signaler en meute, ou pour revenir après un bannissement.
  const fingerprint = ipFingerprint(request);
  if (fingerprint !== null) {
    const [hour, day] = await Promise.all([
      withinLimit(`signup:ip:${fingerprint}:h`, RATE_LIMITS.signupsPerIpHour),
      withinLimit(`signup:ip:${fingerprint}:d`, RATE_LIMITS.signupsPerIpDay),
    ]);
    if (!hour || !day) {
      return apiError('rate_limited', 'Trop de comptes créés depuis cette connexion. Réessaie plus tard.');
    }
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
  const token = await issueSessionToken(result.user.id);
  // Une app native n'a pas de cookie : elle reçoit le jeton dans le corps et le
  // renvoie en `Authorization: Bearer`. Le navigateur ne le voit jamais.
  if (isMobileClient(request)) {
    return Response.json({ ok: true, token }, { status: 201 });
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return Response.json({ ok: true }, { status: 201 });
}
