import 'server-only';
import { del, put } from '@vercel/blob';
import { env } from '../env';

/**
 * Photos posées depuis le tableau de bord, sur une recette ou un plat du
 * catalogue, et effacées avec ce qui les porte. Même traitement que `npm run upload:photos` : redressée selon
 * l'EXIF, 1200 px au plus grand côté, WebP qualité 80, dans Vercel Blob.
 */

/** Au-delà, l'image n'est pas lue : le tableau de bord la réduit avant l'envoi. */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const MAX_SIDE = 1200;

export class PhotoStoreMissing extends Error {
  constructor() {
    super('BLOB_READ_WRITE_TOKEN manque : impossible de ranger la photo.');
  }
}

/** Rend le WebP prêt à ranger, ou `null` si ce n'est pas une image lisible. */
export async function toWebp(bytes: Uint8Array): Promise<Buffer | null> {
  // Chargé à la demande : la suppression d'une recette passe par ce module et
  // n'a pas à charger une bibliothèque d'images native.
  const { default: sharp } = await import('sharp');
  try {
    return await sharp(bytes)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Range la photo et rend son adresse publique. */
export async function storePhoto(folder: 'recipes' | 'catalog', name: string, webp: Buffer): Promise<string> {
  const token = env.blobToken;
  if (!token) {
    throw new PhotoStoreMissing();
  }
  const blob = await put(`${folder}/${name}.webp`, webp, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'image/webp',
    token,
  });
  return blob.url;
}

/**
 * Efface une ancienne photo. Un échec n'empêche rien : la nouvelle est en
 * place, l'ancienne n'est plus référencée et ne coûte que sa place.
 */
export async function forgetPhoto(url: string | null | undefined): Promise<void> {
  const token = env.blobToken;
  if (!url || !token || !url.includes('.blob.vercel-storage.com/')) {
    return;
  }
  try {
    await del(url, { token });
  } catch {
    // Voir plus haut : rien à faire de plus.
  }
}
