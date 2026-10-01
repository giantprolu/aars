/**
 * Préparation d'une photo avant envoi (FR-17).
 *
 * Le redimensionnement se fait dans le navigateur : envoyer une photo
 * d'iPhone brute, souvent quatre mégaoctets et plus, coûterait du temps de
 * téléversement pour aucun gain de reconnaissance.
 */

/** Plus grande dimension après redimensionnement (FR-17). */
export const MAX_DIMENSION = 1024;

const JPEG_QUALITY = 0.82;

export type PrepareResult =
  | { kind: 'ready'; dataUrl: string }
  | { kind: 'unreadable' };

export async function prepareImage(file: File): Promise<PrepareResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { kind: 'unreadable' };
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { kind: 'unreadable' };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return { kind: 'ready', dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY) };
}
