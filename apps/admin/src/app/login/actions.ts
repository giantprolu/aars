'use server';

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { checkPassword, finishPasskey, listPasskeys, passkeyOptions, type PasskeyOptions } from '@/lib/auth';
import { env } from '@/lib/env';

/**
 * Le serveur Aars n'a pas répondu, ou a refusé la clé : dit plutôt que de
 * laisser une exception devenir une page d'erreur muette.
 */
const SERVER_REFUSED =
  'Le serveur Aars refuse la clé ou ne répond pas : vérifie que ADMIN_API_KEY est la même dans les deux projets Vercel, puis redéploie le projet aars.';

export type PasswordState =
  | { step: 'password'; error: string | null }
  | { step: 'login' | 'enroll'; error: null };

export async function submitPassword(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  if (!env.configured) {
    return { step: 'password', error: 'Tableau de bord non configuré (variables ADMIN_* manquantes).' };
  }
  const password = form.get('password');
  if (typeof password !== 'string' || !(await checkPassword(password))) {
    return { step: 'password', error: 'Mot de passe incorrect.' };
  }
  try {
    const { passkeys } = await listPasskeys();
    return { step: passkeys.length === 0 ? 'enroll' : 'login', error: null };
  } catch {
    return { step: 'password', error: SERVER_REFUSED };
  }
}

export async function beginPasskey(purpose: 'login' | 'enroll'): Promise<PasskeyOptions | { error: string }> {
  try {
    return (await passkeyOptions(purpose)) ?? { error: 'La demande a expiré : recharge la page et recommence.' };
  } catch {
    return { error: SERVER_REFUSED };
  }
}

export async function completePasskey(
  purpose: 'login' | 'enroll',
  response: AuthenticationResponseJSON | RegistrationResponseJSON,
  name: string,
): Promise<string | null> {
  try {
    return await finishPasskey(purpose, response, name);
  } catch {
    return SERVER_REFUSED;
  }
}
