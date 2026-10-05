import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { notifiedOriginalTransaction } from '@/server/clients/app-store';
import { env } from '@/server/env';
import { refreshAppleFromNotification } from '@/server/services/premium';

export const runtime = 'nodejs';

/**
 * Notifications App Store Server (version 2) : renouvellement, expiration,
 * remboursement, résiliation.
 *
 * La route n'a pas de session : elle est authentifiée par le secret ajouté à
 * l'URL déclarée dans App Store Connect
 * (`/api/billing/apple/notify?secret=…`). Le contenu de la notification n'est
 * pas cru : seule la transaction d'origine en est tirée, et l'état est relu
 * chez Apple. Une réponse en erreur fait réessayer Apple, c'est voulu quand
 * Apple n'a pas répondu ; une notification illisible est acquittée.
 */

const bodySchema = z.object({ signedPayload: z.string().min(1) });

function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) {
    return false;
  }
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const expected = env.appleNotifySecret;
  if (expected === undefined) {
    // Non configurée : on refuse plutôt que d'accepter sans contrôle.
    return new Response(null, { status: 503 });
  }
  if (!secretMatches(new URL(request.url).searchParams.get('secret'), expected)) {
    return new Response(null, { status: 401 });
  }

  let original: string | null = null;
  try {
    original = notifiedOriginalTransaction(bodySchema.parse(await request.json()).signedPayload);
  } catch {
    return new Response(null, { status: 200 });
  }
  // Notification de test d'App Store Connect, ou sans transaction.
  if (original === null) {
    return new Response(null, { status: 200 });
  }

  try {
    await refreshAppleFromNotification(original);
  } catch (error) {
    console.error('[billing] notification App Store non traitee :', error instanceof Error ? error.message : error);
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 200 });
}
