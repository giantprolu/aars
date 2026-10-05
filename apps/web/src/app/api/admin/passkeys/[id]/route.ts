import { z } from 'zod';
import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { deleteAdminPasskey, touchAdminPasskey } from '@/server/db/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const touchSchema = z.object({ counter: z.number().int().min(0) });

/** Après une connexion : le compteur de signature et l'heure d'usage. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const { id } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }
  const parsed = touchSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }
  return (await touchAdminPasskey(id, parsed.data.counter)) ? Response.json({ ok: true }) : apiError('not_found');
}

/** Révoque une passkey (appareil perdu ou remplacé). */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const { id } = await context.params;
  return (await deleteAdminPasskey(id)) ? new Response(null, { status: 204 }) : apiError('not_found');
}
