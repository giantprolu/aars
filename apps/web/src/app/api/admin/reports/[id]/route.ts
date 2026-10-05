import { z } from 'zod';
import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { hideReportedSession, resolveReport } from '@/server/db/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ action: z.enum(['resolve', 'hide-session']) });

/**
 * Traite un signalement : le clore, ou rendre privée la séance signalée.
 * Supprimer un compte reste à `npm run moderation`, avec sa confirmation.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const id = Number((await context.params).id);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }
  const parsed = bodySchema.safeParse(payload);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    return apiError('invalid_input');
  }
  const done = parsed.data.action === 'resolve' ? await resolveReport(id) : await hideReportedSession(id);
  return done ? Response.json({ ok: true }) : apiError('not_found');
}
