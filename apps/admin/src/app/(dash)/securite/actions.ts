'use server';

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { finishPasskey, logout, passkeyOptions, requireSession, revokePasskey, type PasskeyOptions } from '@/lib/auth';

export async function beginAddPasskey(): Promise<PasskeyOptions | null> {
  await requireSession();
  return passkeyOptions('add');
}

export async function completeAddPasskey(response: RegistrationResponseJSON, name: string): Promise<string | null> {
  await requireSession();
  const failure = await finishPasskey('add', response, name);
  revalidatePath('/securite');
  return failure;
}

export async function revoke(id: string): Promise<string | null> {
  await requireSession();
  const failure = await revokePasskey(id);
  revalidatePath('/securite');
  return failure;
}

export async function signOut(): Promise<void> {
  await logout();
  redirect('/login');
}
