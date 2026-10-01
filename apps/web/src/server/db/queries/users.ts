import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../client';

/**
 * Accès aux comptes.
 *
 * L'adresse est toujours ramenée en minuscules avant lecture comme avant
 * écriture, et l'unicité en base porte sur cette forme. Sans cela, deux
 * inscriptions différant d'une majuscule créeraient deux comptes distincts
 * que leur propriétaire croirait être le même.
 */

/** Forme canonique d'une adresse, seule stockée et seule comparée. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface UserAccount {
  id: number;
  email: string;
  passwordHash: string;
  ingestToken: string | null;
}

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  const [row] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export type CreateUserResult =
  | { kind: 'created'; user: UserAccount }
  | { kind: 'email_taken' };

/**
 * Crée un compte. Le doublon est détecté par la contrainte d'unicité plutôt
 * que par une lecture préalable : entre le test et l'écriture, une seconde
 * inscription pourrait passer. C'est la base qui tranche, pas le code.
 */
export async function createUser(
  email: string,
  passwordHash: string,
): Promise<CreateUserResult> {
  const [row] = await db()
    .insert(schema.users)
    .values({ email: normalizeEmail(email), passwordHash })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  return row ? { kind: 'created', user: row } : { kind: 'email_taken' };
}

/**
 * L'utilisateur désigné par un jeton d'ingestion.
 *
 * Le jeton est comparé en base et non en mémoire : une comparaison de chaînes
 * côté application sortirait au premier caractère différent, et l'index
 * unique de Postgres ne dépend pas du contenu comparé.
 */
export async function findUserByIngestToken(token: string): Promise<UserAccount | null> {
  const [row] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.ingestToken, token))
    .limit(1);
  return row ?? null;
}

/**
 * Fabrique un jeton pour l'utilisateur et remplace celui qui existait.
 * Remplacer plutôt que conserver : c'est ce qui rend la révocation possible
 * quand un raccourci a été partagé par erreur.
 */
export async function rotateIngestToken(userId: number): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const token = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

  await db().update(schema.users).set({ ingestToken: token }).where(eq(schema.users.id, userId));
  return token;
}

/** Vrai si un jeton existe déjà, sans le révéler. */
export async function hasIngestToken(userId: number): Promise<boolean> {
  const [row] = await db()
    .select({ token: schema.users.ingestToken })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.token != null;
}

export async function findUserById(userId: number): Promise<UserAccount | null> {
  const [row] = await db().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return row ?? null;
}

/** L'empreinte du code de secours d'un compte, repérée par son adresse. */
export async function findRecoveryByEmail(
  email: string,
): Promise<{ id: number; recoveryCodeHash: string | null } | null> {
  const [row] = await db()
    .select({ id: schema.users.id, recoveryCodeHash: schema.users.recoveryCodeHash })
    .from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function hasRecoveryCode(userId: number): Promise<boolean> {
  const [row] = await db()
    .select({ hash: schema.users.recoveryCodeHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.hash != null;
}

/** Pose, remplace ou efface (`null`) l'empreinte du code de secours. */
export async function setRecoveryCodeHash(userId: number, hash: string | null): Promise<void> {
  await db().update(schema.users).set({ recoveryCodeHash: hash }).where(eq(schema.users.id, userId));
}

/**
 * Change le mot de passe et consomme le code de secours s'il a servi.
 *
 * Une seule instruction pour les deux : un code qui aurait ouvert un nouveau
 * mot de passe sans être effacé resterait utilisable par qui l'a trouvé.
 */
export async function updatePassword(
  userId: number,
  passwordHash: string,
  options: { consumeRecoveryCode: boolean },
): Promise<void> {
  await db()
    .update(schema.users)
    .set({
      passwordHash,
      ...(options.consumeRecoveryCode ? { recoveryCodeHash: null } : {}),
    })
    .where(eq(schema.users.id, userId));
}

export async function insertResetToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db().insert(schema.passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

/**
 * Consomme un jeton de réinitialisation valide et rend son utilisateur.
 *
 * La consommation est la condition de l'écriture elle-même (`used_at is
 * null`) : deux requêtes simultanées avec le même lien ne peuvent pas
 * réussir toutes les deux.
 */
export async function consumeResetToken(tokenHash: string, now: Date): Promise<number | null> {
  const [row] = await db()
    .update(schema.passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, now),
      ),
    )
    .returning({ userId: schema.passwordResetTokens.userId });
  return row?.userId ?? null;
}

/**
 * Supprime le compte. Toutes les tables qui portent l'utilisateur le
 * référencent avec `on delete cascade` : journal, profil, pesées, recettes,
 * séances, favoris et abonnements partent avec lui, en une instruction.
 */
export async function deleteUser(userId: number): Promise<boolean> {
  const rows = await db()
    .delete(schema.users)
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id });
  return rows.length > 0;
}
