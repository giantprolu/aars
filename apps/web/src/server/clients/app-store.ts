import 'server-only';
import { z } from 'zod';
import { appleSubscriptionState, type StoreState } from '@/lib/premium';
import { env, requireEnv } from '../env';

/**
 * Lecture des achats auprès de l'App Store Server API (achat intégré iOS).
 *
 * Appelée en REST, comme Google Play : quatre requêtes ne justifient pas la
 * bibliothèque d'Apple, et la signature de la clé tient en Web Crypto.
 *
 * Le téléphone ne dit jamais au serveur qu'il a payé. Il donne un identifiant
 * de transaction, et c'est Apple qui dit ce qu'elle vaut. Les réponses
 * d'Apple portent des JWS : leur contenu est lu sans en vérifier la
 * signature, parce qu'il arrive par une connexion TLS à l'API d'Apple,
 * authentifiée par notre clé. Il vaut ce que vaut cette connexion, comme la
 * réponse JSON de Google.
 */

const PRODUCTION = 'https://api.storekit.itunes.apple.com';
const SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';
const TIMEOUT_MS = 15_000;

/** Une transaction, dans les termes du serveur. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  expiresAt: Date | null;
  /** Vrai si Apple a remboursé ou retiré l'achat. */
  revoked: boolean;
  /** L'`appAccountToken` passé par l'app à l'achat, en minuscules. */
  appAccountToken: string | null;
}

/** L'état courant d'un abonnement. */
export interface AppleSubscription {
  productId: string;
  state: StoreState;
  expiresAt: Date | null;
  autoRenewing: boolean;
  appAccountToken: string | null;
}

export type AppleLookup<T> = { kind: 'found'; value: T } | { kind: 'not_found' } | { kind: 'unavailable' };

const transactionSchema = z.object({
  transactionId: z.string(),
  originalTransactionId: z.string(),
  bundleId: z.string(),
  productId: z.string(),
  expiresDate: z.number().optional(),
  revocationDate: z.number().optional(),
  appAccountToken: z.string().optional(),
});

const renewalSchema = z.object({ autoRenewStatus: z.number().optional() });

const statusesSchema = z.object({
  data: z
    .array(
      z.object({
        lastTransactions: z
          .array(
            z.object({
              originalTransactionId: z.string(),
              status: z.number(),
              signedTransactionInfo: z.string(),
              signedRenewalInfo: z.string().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

const notificationSchema = z.object({
  data: z.object({ signedTransactionInfo: z.string().optional() }).optional(),
});

/** Le contenu d'un JWS, sans contrôle de signature (voir l'en-tête du module). */
function payloadOf(jws: string): unknown {
  const part = jws.split('.')[1];
  if (part === undefined) {
    throw new Error('JWS sans contenu');
  }
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function toTransaction(jws: string): AppleTransaction {
  const raw = transactionSchema.parse(payloadOf(jws));
  return {
    transactionId: raw.transactionId,
    originalTransactionId: raw.originalTransactionId,
    bundleId: raw.bundleId,
    productId: raw.productId,
    expiresAt: raw.expiresDate === undefined ? null : new Date(raw.expiresDate),
    revoked: raw.revocationDate !== undefined,
    appAccountToken: raw.appAccountToken?.toLowerCase() ?? null,
  };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Le jeton de l'API, signé par la clé « In-App Purchase » d'App Store
 * Connect et gardé un quart d'heure : Apple en refuse au-delà d'une heure.
 */
async function bearer(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }
  const issuedAt = Math.floor(now / 1000);
  const encoder = new TextEncoder();
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: requireEnv('APPLE_IAP_KEY_ID'), typ: 'JWT' }),
  ).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: requireEnv('APPLE_IAP_ISSUER_ID'),
      iat: issuedAt,
      exp: issuedAt + 20 * 60,
      aud: 'appstoreconnect-v1',
      bid: env.appleBundleId,
    }),
  ).toString('base64url');

  const pem = requireEnv('APPLE_IAP_PRIVATE_KEY')
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(pem, 'base64'),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // Web Crypto rend la signature ECDSA brute (r ‖ s), la forme qu'attend un JWS.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(`${header}.${claims}`),
  );
  const value = `${header}.${claims}.${Buffer.from(signature).toString('base64url')}`;
  cachedToken = { value, expiresAt: now + 15 * 60_000 };
  return value;
}

/**
 * Un appel à l'API. La production d'abord ; un achat qu'elle ne connaît pas
 * est cherché dans le bac à sable, où achètent les testeurs de TestFlight et
 * les examinateurs d'Apple, contre ce même serveur.
 */
async function call(
  path: string,
): Promise<{ kind: 'ok'; body: unknown } | { kind: 'not_found' } | { kind: 'unavailable' }> {
  let token: string;
  try {
    token = await bearer();
  } catch (error) {
    // Clé absente ou illisible : rien n'est décidé.
    console.error('[billing] cle App Store inutilisable :', error instanceof Error ? error.message : error);
    return { kind: 'unavailable' };
  }
  for (const base of [PRODUCTION, SANDBOX]) {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      console.error('[billing] lecture App Store impossible :', error instanceof Error ? error.message : error);
      return { kind: 'unavailable' };
    }
    if (response.status === 404) {
      continue;
    }
    // 400 : identifiant mal formé, inutile d'essayer ailleurs.
    if (response.status === 400) {
      return { kind: 'not_found' };
    }
    if (!response.ok) {
      console.error(`[billing] lecture App Store refusee : HTTP ${response.status}`);
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', body: await response.json() };
  }
  return { kind: 'not_found' };
}

/** Une transaction, telle qu'Apple la connaît. */
export async function lookupTransaction(transactionId: string): Promise<AppleLookup<AppleTransaction>> {
  const result = await call(`/inApps/v1/transactions/${encodeURIComponent(transactionId)}`);
  if (result.kind !== 'ok') {
    return result;
  }
  try {
    const body = z.object({ signedTransactionInfo: z.string() }).parse(result.body);
    return { kind: 'found', value: toTransaction(body.signedTransactionInfo) };
  } catch {
    console.error('[billing] reponse App Store inattendue (transaction)');
    return { kind: 'unavailable' };
  }
}

/** L'état courant de l'abonnement né de cette transaction d'origine. */
export async function lookupSubscription(originalTransactionId: string): Promise<AppleLookup<AppleSubscription>> {
  const result = await call(`/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`);
  if (result.kind !== 'ok') {
    return result;
  }
  try {
    const body = statusesSchema.parse(result.body);
    const last = body.data
      .flatMap((group) => group.lastTransactions)
      .find((item) => item.originalTransactionId === originalTransactionId);
    if (!last) {
      return { kind: 'not_found' };
    }
    const transaction = toTransaction(last.signedTransactionInfo);
    const renewal = last.signedRenewalInfo === undefined ? {} : renewalSchema.parse(payloadOf(last.signedRenewalInfo));
    const autoRenewing = renewal.autoRenewStatus === 1;
    return {
      kind: 'found',
      value: {
        productId: transaction.productId,
        state: appleSubscriptionState(last.status, autoRenewing),
        expiresAt: transaction.expiresAt,
        autoRenewing,
        appAccountToken: transaction.appAccountToken,
      },
    };
  } catch {
    console.error('[billing] reponse App Store inattendue (abonnement)');
    return { kind: 'unavailable' };
  }
}

/**
 * La transaction d'origine que désigne une notification App Store, ou `null`.
 * Le contenu n'est pas cru : il sert seulement à savoir quoi relire.
 */
export function notifiedOriginalTransaction(signedPayload: string): string | null {
  try {
    const signed = notificationSchema.parse(payloadOf(signedPayload)).data?.signedTransactionInfo;
    return signed === undefined ? null : toTransaction(signed).originalTransactionId;
  } catch {
    return null;
  }
}
