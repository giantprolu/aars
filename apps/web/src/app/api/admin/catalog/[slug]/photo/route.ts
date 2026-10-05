import { apiError } from '@/server/errors';
import { isAdminRequest } from '@/server/admin';
import { setCatalogPhoto } from '@/server/db/queries/admin';
import { MAX_PHOTO_BYTES, PhotoStoreMissing, forgetPhoto, storePhoto, toWebp } from '@/server/services/photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pose la photo d'un plat du catalogue : le corps est l'image elle-même. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  if (!isAdminRequest(request)) {
    return apiError('not_found');
  }
  const { slug } = await context.params;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !request.headers.get('content-type')?.startsWith('image/') || declared > MAX_PHOTO_BYTES) {
    return apiError('invalid_input');
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const webp = bytes.byteLength > MAX_PHOTO_BYTES ? null : await toWebp(bytes);
  if (webp === null) {
    return apiError('invalid_input', 'Image illisible ou trop lourde.');
  }

  let url: string;
  try {
    url = await storePhoto('catalog', slug, webp);
  } catch (error) {
    if (error instanceof PhotoStoreMissing) {
      return apiError('invalid_input', error.message);
    }
    throw error;
  }
  const previous = await setCatalogPhoto(slug, url);
  if (previous === undefined) {
    await forgetPhoto(url);
    return apiError('not_found');
  }
  await forgetPhoto(previous);
  return Response.json({ imageUrl: url });
}
