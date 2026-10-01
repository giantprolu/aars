import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { deleteAccount } from '@/server/services/account';

export const runtime = 'nodejs';

const deleteSchema = z.object({ password: z.string().min(1).max(512) });

/**
 * Supprime le compte et toutes ses données. Le mot de passe est exigé, et la
 * session fermée dans la foulée : elle désignerait un compte qui n'existe plus.
 */
export async function DELETE(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await deleteAccount(userId, parsed.data.password);
  if (result.kind === 'wrong_password') {
    return apiError('unauthorized', 'Mot de passe incorrect.');
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return new Response(null, { status: 204 });
}
