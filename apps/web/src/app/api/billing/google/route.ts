import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { verifyGooglePurchase } from '@/server/services/premium';

export const runtime = 'nodejs';

const bodySchema = z.object({
  // Les jetons Google font quelques centaines de caractères ; la borne évite
  // seulement qu'un corps démesuré parte vers l'API de Google.
  purchaseToken: z.string().min(10).max(4096),
});

/**
 * Rattache un achat Google Play au compte (abonnement).
 *
 * L'app l'appelle après chaque achat et à chaque démarrage pour les achats en
 * attente. Le serveur ne croit pas le téléphone : il fait lire le jeton à
 * Google, puis confirme l'achat, faute de quoi Google le rembourserait sous
 * trois jours.
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
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const result = await verifyGooglePurchase(userId, parsed.data.purchaseToken);
  switch (result.kind) {
    case 'invalid':
      return apiError('purchase_invalid');
    case 'unavailable':
      return apiError('upstream_unavailable');
    case 'verified':
      return Response.json({
        premium: result.status.premium,
        expiresAt: result.status.expiresAt?.toISOString() ?? null,
      });
  }
}
