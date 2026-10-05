import { z } from 'zod';
import { apiError } from '@/server/errors';
import { adminActor, isAdminRequest } from '@/server/admin';
import { liftSanctionAs } from '@/server/moderation/decisions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const liftSchema = z.object({
  action: z.literal('lift'),
  /** Annule aussi le strike : la sanction était une erreur, elle ne doit plus compter. */
  void: z.boolean().default(false),
  reason: z.string().max(500).nullable().default(null),
});

/** Lève une sanction encore en place. Une sanction déjà levée répond 404. */
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
  const parsed = liftSchema.safeParse(payload);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    return apiError('invalid_input');
  }
  const result = await liftSanctionAs(adminActor(request), id, parsed.data.reason, parsed.data.void);
  switch (result.kind) {
    case 'done':
      return Response.json({ ok: true });
    case 'forbidden':
      return apiError('forbidden');
    case 'not_found':
    case 'conflict':
      return apiError('not_found');
    case 'invalid':
      return apiError('invalid_input', result.message);
  }
}
