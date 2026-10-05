'use server';

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { finishPasskey, logout, passkeyOptions, requireSession, revokePasskey, type PasskeyOptions } from '@/lib/auth';

const SERVER_REFUSED = 'Le serveur Aars refuse la clé ou ne répond pas.';

export async function beginAddPasskey(): Promise<PasskeyOptions | null> {
  await requireSession();
  try {
    return await passkeyOptions('add');
  } catch {
    return null;
  }
}

export async function completeAddPasskey(response: RegistrationResponseJSON, name: string): Promise<string | null> {
  await requireSession();
  let failure: string | null;
  try {
    failure = await finishPasskey('add', response, name);
  } catch {
    failure = SERVER_REFUSED;
  }
  revalidatePath('/securite');
  return failure;
}

export async function revoke(id: string): Promise<string | null> {
  await requireSession();
  let failure: string | null;
  try {
    failure = await revokePasskey(id);
  } catch {
    failure = SERVER_REFUSED;
  }
  revalidatePath('/securite');
  return failure;
}

export async function signOut(): Promise<void> {
  await logout();
  redirect('/login');
}
