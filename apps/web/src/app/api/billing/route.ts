import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { accountRef, premiumStatus } from '@/server/services/premium';

export const runtime = 'nodejs';

/**
 * L'abonnement du compte : actif ou non, limites gratuites et usage.
 *
 * `accountRef` est ce que l'app passe à Google Play au moment de l'achat
 * (`setObfuscatedAccountId`), pour que l'achat reste lié à ce compte.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const [status, ref] = await Promise.all([premiumStatus(userId), accountRef(userId)]);
  return Response.json({
    premium: status.premium,
    expiresAt: status.expiresAt?.toISOString() ?? null,
    limits: status.limits,
    usage: status.usage,
    accountRef: ref,
  });
}
