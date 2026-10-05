'use server';

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { checkPassword, finishPasskey, listPasskeys, passkeyOptions, type PasskeyOptions } from '@/lib/auth';
import { env } from '@/lib/env';

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
  const { passkeys } = await listPasskeys();
  return { step: passkeys.length === 0 ? 'enroll' : 'login', error: null };
}

export async function beginPasskey(purpose: 'login' | 'enroll'): Promise<PasskeyOptions | null> {
  return passkeyOptions(purpose);
}

export async function completePasskey(
  purpose: 'login' | 'enroll',
  response: AuthenticationResponseJSON | RegistrationResponseJSON,
  name: string,
): Promise<string | null> {
  return finishPasskey(purpose, response, name);
}
