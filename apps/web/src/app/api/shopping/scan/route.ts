import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { resolveBarcodeOnServer } from '@/server/services/products';
import { listForWeek } from '@/server/services/shopping';
import { isJournalDate, startOfWeek, todayInParis } from '@/lib/date';
import { bestMatch } from '@/lib/shopping';

export const runtime = 'nodejs';

const BARCODE = /^\d{8}$|^\d{12}$|^\d{13}$/;

/**
 * « Scanner pour cocher » pour les apps natives : le produit scanné, et
 * l'article de la liste qu'il vient probablement cocher (`bestMatch`, comme
 * `ScanToCheck` sur la PWA). Rien n'est coché ici : l'utilisateur confirme,
 * puis l'app envoie `PATCH /api/shopping/items/[id]` avec le code.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const params = new URL(request.url).searchParams;
  const barcode = params.get('barcode') ?? '';
  if (!BARCODE.test(barcode)) {
    return apiError('invalid_input');
  }
  const from = params.get('from');
  const weekStart = startOfWeek(from !== null && isJournalDate(from) ? from : todayInParis());

  const [resolved, list] = await Promise.all([resolveBarcodeOnServer(barcode), listForWeek(userId, weekStart)]);
  const productName = resolved.kind === 'found' ? resolved.product.name : null;
  const match = productName === null || list === null ? null : bestMatch(productName, list.items);
  return Response.json({ barcode, productName, suggestedItemId: match?.item.id ?? null });
}
