import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';
import { cookieName, unseal } from './session';

/**
 * Le client du serveur Aars (`/api/admin/*`). La clé ne quitte jamais le
 * serveur du tableau de bord : le navigateur ne parle qu'à lui.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * L'appareil qui a ouvert la session (le nom de sa passkey), transmis au
 * serveur pour signer les décisions dans l'audit. Vide hors session, ou pour
 * une session ouverte avant que la session ne le retienne.
 */
async function actor(): Promise<string> {
  try {
    const session = await unseal((await cookies()).get(cookieName('session'))?.value, 'session');
    return session?.device ?? '';
  } catch {
    return '';
  }
}

async function call(method: string, path: string, init: { body?: BodyInit; contentType?: string } = {}): Promise<Response> {
  const key = env.apiKey;
  if (!key) {
    throw new ApiError(500, 'ADMIN_API_KEY manque.');
  }
  const device = await actor();
  const response = await fetch(`${env.apiUrl}/api/admin${path}`, {
    method,
    headers: {
      'x-admin-key': key,
      // En-tête HTTP : seulement de l'ASCII ; le serveur nettoie le reste.
      ...(device ? { 'x-admin-actor': encodeURIComponent(device) } : {}),
      ...(init.contentType ? { 'content-type': init.contentType } : {}),
    },
    body: init.body,
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = `Le serveur Aars a répondu ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Pas de JSON : le message par défaut suffit.
    }
    throw new ApiError(response.status, message);
  }
  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  return (await (await call('GET', path)).json()) as T;
}

export async function apiSend(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<void> {
  await call(method, path, body === undefined ? {} : { body: JSON.stringify(body), contentType: 'application/json' });
}

export async function apiUpload(path: string, bytes: ArrayBuffer, contentType: string): Promise<{ imageUrl: string }> {
  return (await (await call('POST', path, { body: bytes, contentType })).json()) as { imageUrl: string };
}
