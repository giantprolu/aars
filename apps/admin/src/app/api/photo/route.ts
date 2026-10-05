import { z } from 'zod';
import { ApiError, apiSend, apiUpload } from '@/lib/api';
import { hasSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 6 Mo, comme le serveur : la photo arrive déjà réduite par le navigateur. */
const MAX_BYTES = 6 * 1024 * 1024;

const querySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recipe'), id: z.string().regex(/^[1-9][0-9]{0,15}$/) }),
  z.object({ kind: z.literal('catalog'), id: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
]);

function target(request: Request): { path: string; kind: 'recipe' | 'catalog' } | null {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ kind: params.get('kind'), id: params.get('id') });
  if (!parsed.success) {
    return null;
  }
  const { kind, id } = parsed.data;
  return { kind, path: kind === 'recipe' ? `/recipes/${id}/photo` : `/catalog/${id}/photo` };
}

function failure(error: unknown): Response {
  const status = error instanceof ApiError && error.status < 500 ? error.status : 502;
  const message = error instanceof ApiError ? error.message : 'Le serveur Aars ne répond pas.';
  return Response.json({ error: message }, { status });
}

/** Relaie une photo vers le serveur Aars, qui la range. Session exigée (et vérifiée deux fois). */
export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) {
    return new Response(null, { status: 401 });
  }
  const destination = target(request);
  const type = request.headers.get('content-type') ?? '';
  if (destination === null || !/^image\/(jpeg|png|webp)$/.test(type)) {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: 'Image vide ou trop lourde.' }, { status: 413 });
  }
  try {
    return Response.json(await apiUpload(destination.path, bytes, type));
  } catch (error) {
    return failure(error);
  }
}

/** Retire la photo posée sur une recette (les plats du catalogue gardent la leur). */
export async function DELETE(request: Request): Promise<Response> {
  if (!(await hasSession())) {
    return new Response(null, { status: 401 });
  }
  const destination = target(request);
  if (destination === null || destination.kind !== 'recipe') {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  try {
    await apiSend('DELETE', destination.path);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
