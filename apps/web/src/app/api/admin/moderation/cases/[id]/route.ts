import { z } from 'zod';
import { apiError } from '@/server/errors';
import { adminActor, isAdminRequest } from '@/server/admin';
import { caseView, decideCase, type CaseDecision } from '@/server/moderation/decisions';
import { can } from '@/lib/moderation/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function caseId(context: Params): Promise<number | null> {
  const id = Number((await context.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Un dossier : ce qui est en cause, ses signaux, ses signalements, ses sanctions, son historique. */
export async function GET(request: Request, context: Params): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const actor = adminActor(request);
  if (!can(actor.role, 'case.read')) {
    return apiError('forbidden');
  }
  const id = await caseId(context);
  const view = id === null ? null : await caseView(actor, id);
  return view === null ? apiError('not_found') : Response.json(view);
}

const note = z.string().max(500).nullable().default(null);
const decisionSchema = z.object({
  /** La version du dossier lue avant de décider (`version`). */
  version: z.string().min(10).max(40),
  decision: z.discriminatedUnion('action', [
    z.object({ action: z.literal('take') }),
    z.object({ action: z.literal('confirm'), note }),
    z.object({ action: z.literal('dismiss'), note }),
    z.object({ action: z.literal('hide') }),
    z.object({ action: z.literal('restore') }),
    z.object({ action: z.literal('reset_identity') }),
    z.object({
      action: z.literal('sanction'),
      sanction: z.enum(['warning', 'restriction', 'suspension', 'ban']),
      days: z.number().int().nullable().default(null),
    }),
  ]),
});

/**
 * Une décision humaine sur un dossier. Refusée (409) si le dossier a changé
 * depuis la version envoyée : rien n'est écrit, il faut le relire.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const id = await caseId(context);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }
  const parsed = decisionSchema.safeParse(payload);
  if (id === null || !parsed.success) {
    return apiError('invalid_input');
  }
  const decision: CaseDecision = parsed.data.decision;
  const result = await decideCase(adminActor(request), id, parsed.data.version, decision);
  switch (result.kind) {
    case 'done':
      return Response.json({ ok: true });
    case 'not_found':
      return apiError('not_found');
    case 'forbidden':
      return apiError('forbidden');
    case 'conflict':
      return apiError('conflict');
    case 'invalid':
      return apiError('invalid_input', result.message);
  }
}
