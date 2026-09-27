import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { subscribe, unsubscribe } from '@/server/services/reminders';

export const runtime = 'nodejs';

/** L'abonnement tel que `PushSubscription.toJSON()` le rend. */
const subscribeSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

/** Active les rappels sur cet appareil. */
export async function POST(request: Request): Promise<Response> {
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

  const parsed = subscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  await subscribe(userId, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  return Response.json({ ok: true }, { status: 201 });
}

const unsubscribeSchema = z.object({ endpoint: z.url().max(1000) });

/** Coupe les rappels sur cet appareil. */
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

  const parsed = unsubscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  await unsubscribe(userId, parsed.data.endpoint);
  return new Response(null, { status: 204 });
}
