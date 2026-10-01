import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { generateProgram, removeTemplate, templatesFor } from '@/server/services/workouts';

export const runtime = 'nodejs';

/** Les séances modèles de l'utilisateur. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  return Response.json({ templates: await templatesFor(userId) });
}

const postSchema = z.object({ action: z.literal('generate') });

/**
 * Compose le programme à partir des préférences, et remplace le précédent.
 *
 * Rejouable sans risque : les séances remplacées sont archivées, pas
 * supprimées, et les séances déjà réalisées gardent donc leur nom.
 */
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

  if (!postSchema.safeParse(payload).success) {
    return apiError('invalid_input');
  }

  return Response.json(await generateProgram(userId), { status: 201 });
}

const deleteSchema = z.object({ templateId: z.number().int().positive() });

/** Archive une séance modèle. Les séances déjà faites gardent leur nom. */
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

  const archived = await removeTemplate(userId, parsed.data.templateId);
  return archived ? new Response(null, { status: 204 }) : apiError('not_found');
}
