import { z } from 'zod';
import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { adminPasskeys, insertAdminPasskey } from '@/server/db/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Les passkeys du tableau de bord. Le serveur ne fait que les ranger : la
 * cérémonie WebAuthn (défi, vérification de signature) se joue dans
 * `apps/admin`, dont l'origine est celle que la passkey connaît.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const rows = await adminPasskeys();
  return Response.json({
    passkeys: rows.map((row) => ({
      id: row.id,
      publicKey: row.publicKey,
      counter: row.counter,
      transports: row.transports,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    })),
  });
}

const insertSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{16,1024}$/),
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{16,4096}$/),
  counter: z.number().int().min(0),
  transports: z.array(z.string().max(32)).max(10),
  name: z.string().trim().min(1).max(60),
});

export async function POST(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }
  const parsed = insertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }
  const created = await insertAdminPasskey(parsed.data);
  return created ? Response.json({ ok: true }, { status: 201 }) : apiError('invalid_input', 'Cette passkey est déjà enregistrée.');
}
