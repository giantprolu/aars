import { env, requireEnv } from './env';

/**
 * Sessions et mots de passe.
 *
 * Le cookie porte l'identifiant de l'utilisateur et l'horodatage d'émission,
 * signés ensemble en HMAC-SHA-256. Signer le couple et non chaque moitié
 * empêche de recoller l'identifiant d'un compte à l'horodatage d'un autre.
 *
 * Tout passe par Web Crypto plutôt que node:crypto : le middleware tourne en
 * Edge runtime, où node:crypto n'est pas disponible. C'est aussi ce qui dicte
 * PBKDF2 pour les mots de passe, faute de bcrypt ou d'argon2 dans cet
 * environnement.
 */

export const SESSION_COOKIE = 'nutriperso_session';

/** 30 jours : un usage quotidien ne doit jamais redemander le mot de passe (FR-3). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return new Uint8Array(signature);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Comparaison en temps constant (FR-1).
 * La boucle parcourt toujours la longueur maximale : sortir tôt sur la première
 * différence rendrait le temps de réponse dépendant du préfixe correct.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Coût du hachage de mot de passe. PBKDF2-HMAC-SHA256 à 210 000 tours est la
 * valeur recommandée par l'OWASP pour cet algorithme. Le nombre est écrit dans
 * l'empreinte : le relever plus tard n'invalidera pas les comptes existants,
 * qui se rehâcheront à leur prochaine connexion réussie.
 */
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEY_BITS = 256;
const SALT_BYTES = 16;

/** Longueur minimale exigée à l'inscription. */
export const MIN_PASSWORD_LENGTH = 10;

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    PBKDF2_KEY_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Empreinte d'un mot de passe, au format `pbkdf2$sha256$tours$sel$empreinte`.
 * Le sel et le nombre de tours voyagent avec l'empreinte : rien d'autre n'est
 * nécessaire pour la vérifier, et rien ne dépend d'une constante du code.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

/**
 * Vérifie un mot de passe contre son empreinte stockée.
 * La comparaison est en temps constant : sortir tôt sur la première différence
 * rendrait le temps de réponse dépendant du préfixe correct.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return false;
  }
  const iterations = Number(parts[2]);
  if (!Number.isSafeInteger(iterations) || iterations <= 0) {
    return false;
  }
  const derived = await pbkdf2(password, fromBase64Url(parts[3] ?? ''), iterations);
  return timingSafeEqual(toBase64Url(derived), parts[4] ?? '');
}

/**
 * Fabrique la valeur du cookie : `utilisateur.horodatage.signature`.
 * La signature couvre les deux premiers champs ensemble, de sorte qu'aucun
 * fragment d'un cookie valide ne puisse être recollé à celui d'un autre compte.
 */
export async function issueSessionToken(
  userId: number,
  now: number = Date.now(),
): Promise<string> {
  const secret = requireEnv('SESSION_SECRET');
  const payload = `${userId}.${now}`;
  return `${payload}.${toBase64Url(await hmac(secret, payload))}`;
}

/**
 * Lit un cookie de session et rend l'identifiant qu'il porte.
 * Rend `null` plutôt que de lever, la session absente étant un cas nominal et
 * non une erreur (AD-12). Signature intacte et âge sous la limite sont exigés.
 */
export async function readSessionToken(
  token: string | undefined,
  now: number = Date.now(),
): Promise<number | null> {
  if (!token) {
    return null;
  }
  const secret = env.sessionSecret;
  if (!secret) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [rawUserId, rawIssuedAt, signature] = parts as [string, string, string];

  const userId = Number(rawUserId);
  const issuedAtMs = Number(rawIssuedAt);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs > now) {
    return null;
  }
  if ((now - issuedAtMs) / 1000 > SESSION_MAX_AGE_SECONDS) {
    return null;
  }

  const expected = toBase64Url(await hmac(secret, `${rawUserId}.${rawIssuedAt}`));
  return timingSafeEqual(signature, expected) ? userId : null;
}

/**
 * Vrai si le cookie est exploitable. Le middleware n'a pas besoin de savoir
 * qui est connecté, seulement que quelqu'un l'est.
 */
export async function isValidSessionToken(
  token: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  return (await readSessionToken(token, now)) !== null;
}

/**
 * Attributs du cookie, identiques à la pose et à la suppression (FR-1).
 *
 * `secure` est laissé tomber en développement. Chrome accepte un cookie
 * `Secure` sur `localhost`, qu'il traite comme une origine de confiance, mais
 * le jette sur toute autre origine en clair. Or l'application s'essaie depuis
 * un téléphone, donc sur l'IP du poste : le cookie était alors refusé en
 * silence, la session n'existait pas, et le déverrouillage renvoyait
 * indéfiniment vers /unlock sans message d'erreur. En production le déploiement
 * est en HTTPS et l'attribut reste posé.
 */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/**
 * Alphabet des codes de secours : base 32 de Crockford, sans I, L, O ni U.
 * Un code se recopie à la main depuis un papier, et « 0 » contre « O » ou
 * « 1 » contre « l » sont exactement les erreurs qu'on y fait.
 */
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_GROUPS = 4;
const RECOVERY_GROUP_LENGTH = 4;

/**
 * Tire un code de secours : seize caractères en quatre groupes, 80 bits.
 *
 * C'est assez pour qu'aucune suite d'essais ne le trouve, même sans limite de
 * tentatives, et assez court pour se recopier sans erreur. Le tirage rejette
 * les octets hors de la plage utile plutôt que de prendre un modulo, qui
 * favoriserait les premiers caractères de l'alphabet.
 */
export function generateRecoveryCode(): string {
  const length = RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH;
  const limit = 256 - (256 % RECOVERY_ALPHABET.length);
  let code = '';
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && code.length < length) {
        code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
      }
    }
  }
  return code.match(new RegExp(`.{${RECOVERY_GROUP_LENGTH}}`, 'g'))?.join('-') ?? code;
}

/**
 * La forme canonique d'un code saisi : majuscules, sans tirets ni espaces, et
 * les confusions usuelles corrigées (O en 0, I et L en 1). C'est elle qu'on
 * hache, à la création comme à la vérification.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replaceAll('O', '0')
    .replaceAll('I', '1')
    .replaceAll('L', '1');
}

/** Un jeton aléatoire de 256 bits, en base64url, pour les liens de réinitialisation. */
export function generateResetToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** L'empreinte SHA-256 d'un jeton, en base64url. Seule elle est stockée. */
export async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return toBase64Url(new Uint8Array(digest));
}
