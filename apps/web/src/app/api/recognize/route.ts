import { z } from 'zod';
import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { recognizeFoods } from '@/server/clients/vision';

export const runtime = 'nodejs';

/** Au-delà, l'image est rejetée (FR-17). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const bodySchema = z.object({
  image: z.string().startsWith('data:image/').max(MAX_IMAGE_BYTES * 2),
});

/**
 * Reconnaissance d'aliments sur une photo (FR-17).
 *
 * La photo n'est conservée ni sur disque ni en base : elle vit le temps de
 * l'appel, puis disparaît avec la requête (NFR-3).
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) {
    return apiError('unauthorized');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    return apiError('payload_too_large');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  // Une data URL base64 pèse environ 4/3 de l'image d'origine.
  if ((parsed.data.image.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return apiError('payload_too_large');
  }

  const result = await recognizeFoods(parsed.data.image);

  switch (result.kind) {
    case 'recognized':
      return Response.json({ names: result.names });
    case 'bad_format':
      return apiError('model_bad_format');
    case 'quota_exceeded':
      return apiError('model_quota_exceeded');
    case 'unavailable':
      return apiError('model_unavailable');
  }
}
