import { env } from './env';

/**
 * Jetons signés des cookies du tableau de bord : `charge.signature`, en
 * base64url, signés en HMAC-SHA256 avec `ADMIN_SESSION_SECRET`. Web Crypto
 * seulement, pour tourner aussi dans le middleware (Edge).
 *
 * Chaque jeton porte son type, son échéance et l'empreinte du mot de passe :
 * changer `ADMIN_PASSWORD` ferme toutes les sessions ouvertes.
 */

export type TokenKind = 'session' | 'pending' | 'challenge';

/** Durées de vie, en secondes. */
export const TTL: Record<TokenKind, number> = {
  session: 8 * 3600,
  pending: 5 * 60,
  challenge: 5 * 60,
};

export const COOKIE: Record<TokenKind, string> = {
  session: 'aars-admin',
  pending: 'aars-admin-pending',
  challenge: 'aars-admin-challenge',
};

/** Le nom réel du cookie : `__Host-` en HTTPS, qui l'attache à cet hôte seul. */
export function cookieName(kind: TokenKind): string {
  return env.secure ? `__Host-${COOKIE[kind]}` : COOKIE[kind];
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    return null;
  }
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(data: string): Promise<Uint8Array> {
  const secret = env.sessionSecret;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET manque.');
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** Comparaison en temps constant : la durée ne dit pas où les octets divergent. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

/** Empreinte courte du mot de passe, pour lier les jetons à sa valeur du moment. */
async function passwordVersion(): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(env.password ?? '')));
  return toBase64Url(digest).slice(0, 16);
}

export async function seal(kind: TokenKind, data: Record<string, string> = {}): Promise<string> {
  const payload = { ...data, k: kind, exp: Math.floor(Date.now() / 1000) + TTL[kind], pv: await passwordVersion() };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${toBase64Url(await sign(body))}`;
}

/** La charge d'un jeton valide de ce type, ou `null` : signature, type, échéance, mot de passe. */
export async function unseal(token: string | undefined, kind: TokenKind): Promise<Record<string, string> | null> {
  if (!token || !env.configured) {
    return null;
  }
  const [body, signature, extra] = token.split('.');
  const given = signature === undefined ? null : fromBase64Url(signature);
  if (!body || !given || extra !== undefined || !sameBytes(given, await sign(body))) {
    return null;
  }
  const raw = fromBase64Url(body);
  if (!raw) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.k !== kind || typeof record.exp !== 'number' || record.exp < Date.now() / 1000) {
    return null;
  }
  if (record.pv !== (await passwordVersion())) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}
