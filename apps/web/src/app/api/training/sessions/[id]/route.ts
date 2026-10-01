import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { discardSession, endSession, sessionFor } from '@/server/services/workouts';

export const runtime = 'nodejs';

const actionSchema = z.object({ action: z.literal('finish') });

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  const session = await sessionFor(userId, id);
  return session === null ? apiError('not_found') : Response.json({ session });
}

/** Termine une séance. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  if (!actionSchema.safeParse(payload).success) {
    return apiError('invalid_input');
  }

  const finished = await endSession(userId, id);
  return finished ? Response.json({ ok: true }) : apiError('not_found');
}

/** Abandonne une séance. Ses séries partent avec elle, par cascade. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }

  const removed = await discardSession(userId, id);
  return removed ? new Response(null, { status: 204 }) : apiError('not_found');
}
