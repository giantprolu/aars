import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { apiGet, apiSend } from './api';
import { env } from './env';
import { TTL, cookieName, sameBytes, seal, unseal, type TokenKind } from './session';
import type { Passkey } from './types';

/**
 * Entrée du tableau de bord : deux facteurs, toujours.
 *
 * 1. Le mot de passe admin, comparé en temps constant, chaque échec payé
 *    d'une seconde et demie d'attente. Réussi, il ne donne qu'un jeton
 *    « en attente » de cinq minutes.
 * 2. Une passkey (WebAuthn, vérification de l'utilisateur exigée : visage,
 *    empreinte ou code de l'appareil). Tant qu'aucune n'existe, le mot de
 *    passe permet d'enregistrer la première ; ensuite, en ajouter une demande
 *    une session complète. La dernière ne se révoque pas.
 *
 * La session dure huit heures, en cookie `__Host-`, HttpOnly, SameSite=Strict.
 */

const encoder = new TextEncoder();
const FAILURE_DELAY_MS = 1500;

async function setToken(kind: TokenKind, data: Record<string, string> = {}): Promise<void> {
  (await cookies()).set(cookieName(kind), await seal(kind, data), {
    httpOnly: true,
    secure: env.secure,
    sameSite: 'strict',
    path: '/',
    maxAge: TTL[kind],
  });
}

async function clearToken(kind: TokenKind): Promise<void> {
  (await cookies()).delete(cookieName(kind));
}

async function readToken(kind: TokenKind): Promise<Record<string, string> | null> {
  return unseal((await cookies()).get(cookieName(kind))?.value, kind);
}

export async function hasSession(): Promise<boolean> {
  return (await readToken('session')) !== null;
}

/** Pour chaque page et chaque action : sans session complète, retour à l'entrée. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) {
    redirect('/login');
  }
}

export async function logout(): Promise<void> {
  await clearToken('session');
  await clearToken('pending');
  await clearToken('challenge');
}

export function listPasskeys(): Promise<{ passkeys: Passkey[] }> {
  return apiGet<{ passkeys: Passkey[] }>('/passkeys');
}

/** Premier facteur. Rend vrai et pose le jeton « en attente », ou attend puis rend faux. */
export async function checkPassword(given: string): Promise<boolean> {
  const expected = env.password;
  if (!env.configured || !expected) {
    return false;
  }
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  if (!sameBytes(await digest(given), await digest(expected))) {
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return false;
  }
  await setToken('pending');
  return true;
}

export type PasskeyPurpose = 'login' | 'enroll' | 'add';

export type PasskeyOptions =
  | { kind: 'login'; options: PublicKeyCredentialRequestOptionsJSON }
  | { kind: 'register'; options: PublicKeyCredentialCreationOptionsJSON };

/**
 * Ce qui donne le droit de lancer une cérémonie : le mot de passe pour se
 * connecter, ou pour enregistrer la toute première passkey ; une session
 * complète pour en ajouter une autre.
 */
async function allowed(purpose: PasskeyPurpose, count: number): Promise<boolean> {
  if (purpose === 'add') {
    return hasSession();
  }
  if ((await readToken('pending')) === null) {
    return false;
  }
  return purpose === 'login' ? count > 0 : count === 0;
}

export async function passkeyOptions(purpose: PasskeyPurpose): Promise<PasskeyOptions | null> {
  const { passkeys } = await listPasskeys();
  if (!(await allowed(purpose, passkeys.length))) {
    return null;
  }
  const known = passkeys.map((key) => ({ id: key.id, transports: key.transports }));

  if (purpose === 'login') {
    const options = await generateAuthenticationOptions({
      rpID: env.rpId,
      allowCredentials: known,
      userVerification: 'required',
    });
    await setToken('challenge', { challenge: options.challenge, purpose });
    return { kind: 'login', options };
  }

  const options = await generateRegistrationOptions({
    rpName: 'Aars admin',
    rpID: env.rpId,
    userName: 'admin',
    userDisplayName: 'Administration Aars',
    userID: encoder.encode('aars-admin'),
    attestationType: 'none',
    excludeCredentials: known,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await setToken('challenge', { challenge: options.challenge, purpose });
  return { kind: 'register', options };
}

/** Deuxième facteur, ou ajout d'un appareil. Rend un message d'erreur, ou `null` si c'est fait. */
export async function finishPasskey(
  purpose: PasskeyPurpose,
  response: AuthenticationResponseJSON | RegistrationResponseJSON,
  name: string,
): Promise<string | null> {
  const challenge = await readToken('challenge');
  await clearToken('challenge');
  const { passkeys } = await listPasskeys();
  if (!challenge || challenge.purpose !== purpose || !challenge.challenge || !(await allowed(purpose, passkeys.length))) {
    return 'La demande a expiré : recommence depuis le mot de passe.';
  }

  if (purpose === 'login') {
    const stored = passkeys.find((key) => key.id === response.id);
    if (!stored) {
      return 'Cette passkey n\'est pas enregistrée ici.';
    }
    try {
      const result = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.origin,
        expectedRPID: env.rpId,
        requireUserVerification: true,
        credential: {
          id: stored.id,
          publicKey: isoBase64URL.toBuffer(stored.publicKey),
          counter: stored.counter,
          transports: stored.transports,
        },
      });
      if (!result.verified) {
        return 'Passkey refusée.';
      }
      await apiSend('PATCH', `/passkeys/${encodeURIComponent(stored.id)}`, { counter: result.authenticationInfo.newCounter });
    } catch {
      return 'Passkey refusée.';
    }
  } else {
    try {
      const result = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.origin,
        expectedRPID: env.rpId,
        requireUserVerification: true,
      });
      if (!result.verified) {
        return 'Passkey refusée.';
      }
      const { credential } = result.registrationInfo;
      await apiSend('POST', '/passkeys', {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        name: name.trim().slice(0, 60) || 'Appareil',
      });
    } catch {
      return 'Enregistrement de la passkey impossible.';
    }
  }

  if (purpose !== 'add') {
    await clearToken('pending');
    await setToken('session');
  }
  return null;
}

/** Révoque une passkey, sauf la dernière : sans elle, plus personne n'entrerait. */
export async function revokePasskey(id: string): Promise<string | null> {
  const { passkeys } = await listPasskeys();
  if (passkeys.length <= 1) {
    return 'C\'est la dernière passkey : ajoutes-en une autre avant de la révoquer.';
  }
  if (!passkeys.some((key) => key.id === id)) {
    return 'Passkey introuvable.';
  }
  await apiSend('DELETE', `/passkeys/${encodeURIComponent(id)}`);
  return null;
}
