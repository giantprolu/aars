import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { KITCHEN_PLUS_ON_SALE, KITCHEN_PLUS_PRODUCT, SALES_OPEN, SUBSCRIPTION_PRODUCTS } from '@/lib/premium';
import { accountRef, appAccountToken, premiumStatus } from '@/server/services/premium';

export const runtime = 'nodejs';

/**
 * Les achats du compte : abonnement actif ou non, Cuisine+, limites gratuites
 * et usage, et ce que les apps proposent à la vente.
 *
 * `accountRef` est ce que l'app Android passe à Google Play au moment de
 * l'achat (`setObfuscatedAccountId`), `appAccountToken` ce que l'app iOS passe
 * à l'App Store : l'achat reste lié à ce compte. `salesOpen` à faux, les apps
 * ne montrent ni abonnement ni offre.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const [status, ref, token] = await Promise.all([
    premiumStatus(userId),
    accountRef(userId),
    appAccountToken(userId),
  ]);
  return Response.json({
    premium: status.premium,
    kitchenPlus: status.kitchenPlus,
    expiresAt: status.expiresAt?.toISOString() ?? null,
    limits: status.limits,
    usage: status.usage,
    accountRef: ref,
    appAccountToken: token,
    products: {
      subscription: SUBSCRIPTION_PRODUCTS,
      kitchenPlus: KITCHEN_PLUS_PRODUCT,
      kitchenPlusOnSale: SALES_OPEN && KITCHEN_PLUS_ON_SALE,
      salesOpen: SALES_OPEN,
    },
  });
}
