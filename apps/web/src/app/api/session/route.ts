import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  issueSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/server/auth';
import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { findUserByEmail } from '@/server/db/queries/users';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(512),
});

/** Ouvre une session (FR-1). */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  let user: Awaited<ReturnType<typeof findUserByEmail>>;
  try {
    user = await findUserByEmail(parsed.data.email);
  } catch (error) {
    // Base injoignable ou configuration absente : blocage d'infrastructure, pas
    // une erreur d'utilisateur. Le message reste générique côté client (NFR-2).
    console.error('[session] lecture du compte en echec', error);
    return apiError('internal');
  }

  // Le mot de passe est vérifié même quand le compte n'existe pas, contre une
  // empreinte factice. Répondre tout de suite révélerait par le temps de
  // réponse quelles adresses ont un compte.
  const stored = user?.passwordHash ?? DUMMY_HASH;
  const ok = await verifyPassword(parsed.data.password, stored);

  if (!user || !ok) {
    // Un seul message pour les deux cas : ne jamais dire laquelle des deux
    // moitiés est fausse.
    return apiError('unauthorized', 'Adresse ou mot de passe incorrect.');
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await issueSessionToken(user.id),
    sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return Response.json({ ok: true });
}

/**
 * Empreinte de comparaison quand l'adresse est inconnue. Le format est valide
 * et le nombre de tours identique, donc le calcul coûte le même temps qu'une
 * vérification réelle et n'échoue jamais plus tôt.
 */
const DUMMY_HASH =
  'pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Verrouille la session depuis les réglages (FR-3). */
export async function DELETE(): Promise<Response> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return Response.json({ ok: true });
}

/** Sonde d'état, utile pour vérifier le 401 sans session (FR-2). */
export async function GET(): Promise<Response> {
  if (!(await hasSession())) {
    return apiError('unauthorized');
  }
  return Response.json({ ok: true });
}
