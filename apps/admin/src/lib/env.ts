import { z } from 'zod';

/**
 * Seule lecture de process.env du tableau de bord. Aucune variable n'a le
 * préfixe NEXT_PUBLIC_ : rien d'ici n'atteint le navigateur. Ce module est lu
 * par le middleware (runtime Edge) et par le serveur, jamais par un composant
 * client.
 *
 * Sans mot de passe, secret de session ou clé d'API, personne n'entre : le
 * tableau de bord échoue fermé.
 */
const schema = z.object({
  /** Premier facteur. 16 caractères au moins ; une phrase de passe est mieux. */
  ADMIN_PASSWORD: z.string().min(16).optional(),
  /** Signe les cookies de session (HMAC-SHA256). `openssl rand -hex 32`. */
  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
  /** Présentée au serveur Aars (`/api/admin/*`), même valeur des deux côtés. */
  ADMIN_API_KEY: z.string().min(32).optional(),
  /** Le serveur Aars. */
  API_URL: z.string().url().default('https://aars-app.vercel.app'),
  /**
   * L'adresse exacte du tableau de bord : c'est elle que les passkeys
   * connaissent (origine et RP ID de WebAuthn). Ne pas la changer après avoir
   * enregistré des passkeys, elles ne serviraient plus.
   */
  ADMIN_ORIGIN: z.string().url().default('http://localhost:3200'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function read(): Env {
  if (cached === null) {
    const source: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && value.trim() !== '') {
        source[key] = value;
      }
    }
    cached = schema.parse(source);
  }
  return cached;
}

export const env = {
  get password(): string | undefined {
    return read().ADMIN_PASSWORD;
  },
  get sessionSecret(): string | undefined {
    return read().ADMIN_SESSION_SECRET;
  },
  get apiKey(): string | undefined {
    return read().ADMIN_API_KEY;
  },
  get apiUrl(): string {
    return read().API_URL.replace(/\/$/, '');
  },
  get origin(): string {
    return read().ADMIN_ORIGIN.replace(/\/$/, '');
  },
  /** Le RP ID de WebAuthn : le nom d'hôte de l'origine. */
  get rpId(): string {
    return new URL(read().ADMIN_ORIGIN).hostname;
  },
  /** HTTPS : cookies `Secure` et préfixe `__Host-`. */
  get secure(): boolean {
    return read().ADMIN_ORIGIN.startsWith('https://');
  },
  /** `next dev` : la CSP tolère l'évaluation de code qu'il utilise. */
  get development(): boolean {
    return read().NODE_ENV === 'development';
  },
  get configured(): boolean {
    const value = read();
    return Boolean(value.ADMIN_PASSWORD && value.ADMIN_SESSION_SECRET && value.ADMIN_API_KEY);
  },
};
