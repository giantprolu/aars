import 'server-only';
import { z } from 'zod';
import { parseStoreState, type StoreState } from '@/lib/premium';
import { env, requireEnv } from '../env';

/**
 * Lecture des achats auprès de l'API Google Play Developer.
 *
 * Appelée en REST, comme Gemini et Open Food Facts : trois requêtes ne
 * justifient pas le SDK Google, et la signature du compte de service tient en
 * Web Crypto, déjà utilisé pour les sessions.
 *
 * Le téléphone ne dit jamais au serveur qu'il a payé. Il donne un jeton
 * d'achat, et c'est Google qui dit ce que ce jeton vaut.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const TIMEOUT_MS = 15_000;

const serviceAccountSchema = z.object({
  client_email: z.email(),
  private_key: z.string().min(1),
});

/** Ce que le serveur retient d'un achat, dans ses propres termes. */
export interface StorePurchase {
  productId: string;
  state: StoreState;
  expiresAt: Date | null;
  autoRenewing: boolean;
  acknowledged: boolean;
  /** Ce que l'app a passé à `setObfuscatedAccountId` au moment de l'achat. */
  accountRef: string | null;
}

export type PurchaseLookup =
  | { kind: 'found'; purchase: StorePurchase }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

const subscriptionSchema = z.object({
  subscriptionState: z.string().optional(),
  acknowledgementState: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.string(),
        expiryTime: z.string().optional(),
        autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean().optional() }).optional(),
      }),
    )
    .default([]),
  externalAccountIdentifiers: z
    .object({ obfuscatedExternalAccountId: z.string().optional() })
    .optional(),
});

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(array).toString('base64url');
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Jeton d'accès OAuth du compte de service, gardé jusqu'à une minute de son
 * échéance : une fonction Vercel chaude ne le redemande pas à chaque achat.
 */
async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }

  const account = serviceAccountSchema.parse(JSON.parse(requireEnv('GOOGLE_PLAY_SERVICE_ACCOUNT')));
  const issuedAt = Math.floor(now / 1000);
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  );

  const pem = account.private_key
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(pem, 'base64'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(`${header}.${claims}`),
  );

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64Url(signature)}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`jeton Google refuse : HTTP ${response.status}`);
  }
  const body = z
    .object({ access_token: z.string(), expires_in: z.number() })
    .parse(await response.json());
  cachedToken = { value: body.access_token, expiresAt: now + body.expires_in * 1000 };
  return body.access_token;
}

/** L'état d'un abonnement, tel que Google le connaît. */
export async function lookupSubscription(purchaseToken: string): Promise<PurchaseLookup> {
  let response: Response;
  try {
    const token = await accessToken();
    response = await fetch(
      `${API}/${encodeURIComponent(env.googlePlayPackageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (error) {
    // Compte de service absent ou illisible, réseau coupé : rien n'est décidé.
    console.error('[billing] lecture Google impossible :', error instanceof Error ? error.message : error);
    return { kind: 'unavailable' };
  }

  // 400 et 404 : jeton inconnu ou d'une autre application.
  if (response.status === 404 || response.status === 400 || response.status === 410) {
    return { kind: 'not_found' };
  }
  if (!response.ok) {
    console.error(`[billing] lecture Google refusee : HTTP ${response.status}`);
    return { kind: 'unavailable' };
  }

  const parsed = subscriptionSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error('[billing] reponse Google inattendue');
    return { kind: 'unavailable' };
  }

  const data = parsed.data;
  // Un abonnement simple n'a qu'une ligne. S'il en avait plusieurs, la plus
  // lointaine échéance est celle qui dit jusqu'à quand l'accès est payé.
  const line = [...data.lineItems].sort(
    (a, b) => Date.parse(b.expiryTime ?? '') - Date.parse(a.expiryTime ?? ''),
  )[0];
  if (!line) {
    return { kind: 'not_found' };
  }
  const expiry = line.expiryTime ? new Date(line.expiryTime) : null;

  return {
    kind: 'found',
    purchase: {
      productId: line.productId,
      state: parseStoreState(data.subscriptionState),
      expiresAt: expiry !== null && !Number.isNaN(expiry.getTime()) ? expiry : null,
      autoRenewing: line.autoRenewingPlan?.autoRenewEnabled ?? false,
      acknowledged: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      accountRef: data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    },
  };
}

/**
 * Accuse réception d'un achat.
 *
 * Obligatoire : Google rembourse et annule tout achat non confirmé sous trois
 * jours. Rend `false` en cas d'échec, sans lever : l'achat reste valable, et
 * la prochaine vérification ou notification réessaiera.
 */
export async function acknowledgeSubscription(
  productId: string,
  purchaseToken: string,
): Promise<boolean> {
  try {
    const token = await accessToken();
    const response = await fetch(
      `${API}/${encodeURIComponent(env.googlePlayPackageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: '{}',
      },
    );
    if (!response.ok) {
      console.error(`[billing] accuse de reception refuse : HTTP ${response.status}`);
    }
    return response.ok;
  } catch (error) {
    console.error('[billing] accuse de reception impossible :', error instanceof Error ? error.message : error);
    return false;
  }
}
