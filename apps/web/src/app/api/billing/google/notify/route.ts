import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/server/env';
import { refreshFromNotification } from '@/server/services/premium';

export const runtime = 'nodejs';

/**
 * Notifications en temps réel de Google Play, poussées par Pub/Sub.
 *
 * Google prévient ici d'un renouvellement, d'une résiliation, d'un
 * remboursement. La route n'a pas de session : elle est authentifiée par le
 * secret ajouté à l'URL d'abonnement Pub/Sub
 * (`/api/billing/google/notify?secret=…`).
 *
 * Le contenu du message n'est pas cru : seul le jeton d'achat en est tiré, et
 * l'état est relu chez Google. Une réponse en erreur fait réessayer Pub/Sub,
 * c'est voulu quand Google n'a pas répondu ; un message illisible ou sans
 * jeton est acquitté, il ne deviendrait pas lisible en réessayant.
 */

const pushSchema = z.object({
  message: z.object({ data: z.string().optional() }),
});

const notificationSchema = z.object({
  subscriptionNotification: z.object({ purchaseToken: z.string().min(1) }).optional(),
});

function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) {
    return false;
  }
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const expected = env.googlePlayRtdnSecret;
  if (expected === undefined) {
    // Non configurée : on refuse plutôt que d'accepter sans contrôle.
    return new Response(null, { status: 503 });
  }
  if (!secretMatches(new URL(request.url).searchParams.get('secret'), expected)) {
    return new Response(null, { status: 401 });
  }

  let token: string | undefined;
  try {
    const push = pushSchema.parse(await request.json());
    const decoded: unknown = JSON.parse(
      Buffer.from(push.message.data ?? '', 'base64').toString('utf8') || '{}',
    );
    token = notificationSchema.parse(decoded).subscriptionNotification?.purchaseToken;
  } catch {
    return new Response(null, { status: 204 });
  }

  // Message de test de la Play Console, ou notification d'un achat unique.
  if (token === undefined) {
    return new Response(null, { status: 204 });
  }

  try {
    await refreshFromNotification(token);
  } catch (error) {
    console.error('[billing] notification non traitee :', error instanceof Error ? error.message : error);
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204 });
}
