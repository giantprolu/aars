import 'server-only';
import { z } from 'zod';

/**
 * Unique lecture de process.env de l'application (spine, conventions).
 * Validée au premier accès : une variable manquante casse tôt et clairement,
 * plutôt que de produire une erreur obscure au fond d'une requête.
 *
 * Aucune de ces valeurs ne porte le préfixe NEXT_PUBLIC_ : rien de ce fichier
 * ne doit atteindre le navigateur (AD-4, NFR-2).
 */

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  MISTRAL_API_KEY: z.string().min(1).optional(),
  // Fournisseur du modele de vision. Mistral par defaut, pour ne rien changer
  // aux installations existantes ; « gemini » bascule sur l'API Google.
  VISION_PROVIDER: z.enum(['mistral', 'gemini']).default('mistral'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // gemini-2.5-flash repond 404 aux comptes crees recemment, Google renvoyant
  // explicitement vers gemini-3.6-flash (verifie le 14/09/2026). Les modeles
  // les plus recents, eux, repondent souvent 503 sur le palier gratuit.
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  // pixtral-12b-2409 a disparu du catalogue Mistral, vérifié le 11/09/2026
  // sur /v1/models. mistral-small-latest reste le modèle de vision le moins
  // cher, mais il nomme grossièrement une assiette composée : le défaut est
  // mistral-medium-latest, dont la lecture d'image est nettement meilleure et
  // dont le coût reste négligeable à quelques photos par jour. Repasser au
  // petit modèle ne demande que cette variable.
  MISTRAL_MODEL: z.string().min(1).default('mistral-medium-latest'),
  /**
   * Lien iCloud du raccourci Santé tout fait, s'il en existe un.
   *
   * Sans préfixe NEXT_PUBLIC_, comme tout ce fichier : la valeur n'a rien de
   * secret — c'est un lien de partage — mais elle descend au navigateur par
   * une propriété de composant, depuis un composant serveur, et non par une
   * variable inlinée à la compilation. Une seule porte vers process.env.
   */
  HEALTH_SHORTCUT_URL: z.string().url().optional(),
  /**
   * Envoi du courriel de réinitialisation, par l'API de Resend.
   *
   * Les trois vont ensemble : sans l'un d'eux, la réinitialisation par
   * courriel disparaît de l'écran et seul le code de secours reste proposé.
   * `APP_URL` est l'adresse publique de l'application, écrite ici et non lue
   * dans la requête : un lien bâti sur l'en-tête Host enverrait le jeton vers
   * le domaine de qui a forgé la requête.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  /**
   * Adresse de contact affichée par la politique de confidentialité et la
   * page de suppression de compte, que Google Play exige publiques. Absente,
   * les pages renvoient vers le formulaire du compte sans adresse.
   */
  LEGAL_CONTACT_EMAIL: z.string().email().optional(),
  MAIL_FROM: z.string().min(3).optional(),
  APP_URL: z.string().url().optional(),
  /**
   * Notifications. La clé publique descend au navigateur, qui en a besoin
   * pour s'abonner ; la privée signe les envois et ne quitte pas le serveur.
   * `VAPID_SUBJECT` est le contact que les services de notification exigent.
   */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
  /** Secret que Vercel joint aux appels de ses tâches planifiées. */
  CRON_SECRET: z.string().min(16).optional(),
  /**
   * Abonnement vendu par Google Play.
   *
   * Le compte de service est la clé JSON entière, telle que Google Cloud la
   * télécharge, collée sur une ligne. Il lit l'état des achats auprès de
   * l'API Google Play Developer : le serveur ne croit jamais un téléphone qui
   * dit avoir payé. Absent, l'abonnement ne peut pas s'activer, et l'app reste
   * gratuite pour tout le monde.
   *
   * Le secret des notifications est ajouté à l'URL de push que Pub/Sub
   * appelle à chaque renouvellement ou résiliation : sans lui, n'importe qui
   * pourrait déclencher des relectures.
   */
  GOOGLE_PLAY_PACKAGE_NAME: z.string().min(1).default('fr.aars.app'),
  GOOGLE_PLAY_SERVICE_ACCOUNT: z.string().min(1).optional(),
  GOOGLE_PLAY_RTDN_SECRET: z.string().min(16).optional(),
  /**
   * App Store (achat intégré iOS, 05/10/2026). La clé « In-App Purchase »
   * d'App Store Connect (Utilisateurs et accès › Intégrations) : son
   * identifiant, celui de l'émetteur, et le contenu du fichier `.p8`. Sans
   * elles, aucun achat iOS n'est rattaché, et l'app reste gratuite sur iPhone
   * comme ailleurs. Le secret protège l'URL des notifications App Store.
   */
  APPLE_BUNDLE_ID: z.string().min(1).default('fr.aars.app'),
  APPLE_IAP_ISSUER_ID: z.string().min(1).optional(),
  APPLE_IAP_KEY_ID: z.string().min(1).optional(),
  APPLE_IAP_PRIVATE_KEY: z.string().min(1).optional(),
  APPLE_NOTIFY_SECRET: z.string().min(16).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OFF_USER_AGENT: z
    .string()
    .min(1)
    .default('Aars/0.1 (usage personnel; https://github.com/giantprolu/aars)'),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Une variable déclarée sans valeur arrive comme chaîne vide, pas comme
 * absente. C'est le cas courant sur Vercel, où la case existe dès que le nom
 * est saisi. Sans ce nettoyage, `.default()` ne s'applique jamais et une seule
 * case laissée vide fait échouer toute la configuration, donc la connexion.
 */
function withoutEmpty(source: Record<string, string | undefined>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function read(): Env {
  if (cached) {
    return cached;
  }
  const parsed = schema.safeParse(withoutEmpty(process.env));
  if (!parsed.success) {
    throw new Error(
      `Configuration invalide : ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join(', ')}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export const env = {
  get databaseUrl(): string | undefined {
    return read().DATABASE_URL;
  },
  get sessionSecret(): string | undefined {
    return read().SESSION_SECRET;
  },
  get mistralApiKey(): string | undefined {
    return read().MISTRAL_API_KEY;
  },
  get mistralModel(): string {
    return read().MISTRAL_MODEL;
  },
  get visionProvider(): 'mistral' | 'gemini' {
    return read().VISION_PROVIDER;
  },
  get geminiApiKey(): string | undefined {
    return read().GEMINI_API_KEY;
  },
  get geminiModel(): string {
    return read().GEMINI_MODEL;
  },
  get offUserAgent(): string {
    return read().OFF_USER_AGENT;
  },
  get healthShortcutUrl(): string | undefined {
    return read().HEALTH_SHORTCUT_URL;
  },
  get legalContactEmail(): string | undefined {
    return read().LEGAL_CONTACT_EMAIL;
  },
  /** La configuration du courriel, ou `null` si elle est incomplète. */
  get mail(): { apiKey: string; from: string; appUrl: string } | null {
    const { RESEND_API_KEY, MAIL_FROM, APP_URL } = read();
    return RESEND_API_KEY && MAIL_FROM && APP_URL
      ? { apiKey: RESEND_API_KEY, from: MAIL_FROM, appUrl: APP_URL.replace(/\/$/, '') }
      : null;
  },
  /** La configuration des notifications, ou `null` si elle est incomplète. */
  get push(): { publicKey: string; privateKey: string; subject: string } | null {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = read();
    return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
      ? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT }
      : null;
  },
  get cronSecret(): string | undefined {
    return read().CRON_SECRET;
  },
  get googlePlayPackageName(): string {
    return read().GOOGLE_PLAY_PACKAGE_NAME;
  },
  get googlePlayRtdnSecret(): string | undefined {
    return read().GOOGLE_PLAY_RTDN_SECRET;
  },
  get appleBundleId(): string {
    return read().APPLE_BUNDLE_ID;
  },
  get appleNotifySecret(): string | undefined {
    return read().APPLE_NOTIFY_SECRET;
  },
  /** Vrai sur Vercel, faux sous `next dev`. Sert aux attributs du cookie. */
  get isProduction(): boolean {
    return read().NODE_ENV === 'production';
  },
};

/**
 * Exigée à l'usage, pas au démarrage : le build doit passer sans secret
 * (B-2, B-3 de BLOCKERS.md), la requête qui en a besoin échoue explicitement.
 */
export function requireEnv(
  name:
    | 'DATABASE_URL'
    | 'SESSION_SECRET'
    | 'MISTRAL_API_KEY'
    | 'GEMINI_API_KEY'
    | 'GOOGLE_PLAY_SERVICE_ACCOUNT'
    | 'APPLE_IAP_ISSUER_ID'
    | 'APPLE_IAP_KEY_ID'
    | 'APPLE_IAP_PRIVATE_KEY',
): string {
  const value = read()[name];
  if (!value) {
    throw new Error(`${name} n'est pas configurée.`);
  }
  return value;
}
