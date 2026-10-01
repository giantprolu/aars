import { cookies } from 'next/headers';
import { z } from 'zod';
import { apiError } from '@/server/errors';
import { env } from '@/server/env';
import { APPEARANCES, THEME_COOKIE } from '@/lib/theme';

export const runtime = 'nodejs';

/** Un an : le choix d'apparence n'a pas de raison d'expirer plus tôt. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const schema = z.object({ appearance: z.enum(APPEARANCES) });

/**
 * Enregistre le choix clair, sombre ou auto.
 *
 * Sans session requise, à la différence des autres routes : ce cookie ne porte
 * aucune donnée personnelle, seulement une préférence d'affichage. L'exiger
 * ferait échouer la bascule au moment précis où la session vient d'expirer,
 * c'est-à-dire sur l'écran de déverrouillage.
 */
export async function PUT(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data.appearance, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });

  return Response.json({ appearance: parsed.data.appearance });
}
