import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { setRecipePhoto } from '@/server/db/queries/admin';
import { MAX_PHOTO_BYTES, PhotoStoreMissing, forgetPhoto, storePhoto, toWebp } from '@/server/services/photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function recipeId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Pose la photo d'une recette : le corps est l'image elle-même (`image/*`). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const id = recipeId((await context.params).id);
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (id === null || !request.headers.get('content-type')?.startsWith('image/') || declared > MAX_PHOTO_BYTES) {
    return apiError('invalid_input');
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const webp = bytes.byteLength > MAX_PHOTO_BYTES ? null : await toWebp(bytes);
  if (webp === null) {
    return apiError('invalid_input', 'Image illisible ou trop lourde.');
  }

  let url: string;
  try {
    url = await storePhoto('recipes', String(id), webp);
  } catch (error) {
    if (error instanceof PhotoStoreMissing) {
      return apiError('invalid_input', error.message);
    }
    throw error;
  }
  const previous = await setRecipePhoto(id, url);
  if (previous === undefined) {
    await forgetPhoto(url);
    return apiError('not_found');
  }
  await forgetPhoto(previous);
  return Response.json({ imageUrl: url });
}

/** Retire la photo posée : la recette retrouve le motif. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const id = recipeId((await context.params).id);
  if (id === null) {
    return apiError('invalid_input');
  }
  const previous = await setRecipePhoto(id, null);
  if (previous === undefined) {
    return apiError('not_found');
  }
  await forgetPhoto(previous);
  return new Response(null, { status: 204 });
}
