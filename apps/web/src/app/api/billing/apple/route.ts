import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { verifyAppleTransaction } from '@/server/services/premium';

export const runtime = 'nodejs';

const bodySchema = z.object({
  // Un identifiant de transaction App Store : des chiffres.
  transactionId: z.string().regex(/^\d{1,40}$/),
});

/**
 * Rattache un achat App Store au compte : l'abonnement mensuel ou Cuisine+.
 *
 * L'app l'appelle après chaque achat, à chaque transaction reçue au démarrage
 * (renouvellement, achat fait sur un autre appareil) et à la restauration. Le
 * serveur ne croit pas le téléphone : il fait relire la transaction à Apple.
 * L'app ne termine la transaction qu'après cette réponse.
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

  const result = await verifyAppleTransaction(userId, parsed.data.transactionId);
  switch (result.kind) {
    case 'invalid':
      return apiError('purchase_invalid');
    case 'unavailable':
      return apiError('upstream_unavailable');
    case 'verified':
      return Response.json({
        premium: result.status.premium,
        kitchenPlus: result.status.kitchenPlus,
        expiresAt: result.status.expiresAt?.toISOString() ?? null,
      });
  }
}
