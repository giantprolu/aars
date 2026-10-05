import 'server-only';
import { env } from './env';

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

async function call(method: string, path: string, init: { body?: BodyInit; contentType?: string } = {}): Promise<Response> {
  const key = env.apiKey;
  if (!key) {
    throw new ApiError(500, 'ADMIN_API_KEY manque.');
  }
  const response = await fetch(`${env.apiUrl}/api/admin${path}`, {
    method,
    headers: { 'x-admin-key': key, ...(init.contentType ? { 'content-type': init.contentType } : {}) },
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
