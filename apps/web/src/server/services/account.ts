import 'server-only';
import {
  MIN_PASSWORD_LENGTH,
  generateRecoveryCode,
  generateResetToken,
  hashPassword,
  hashResetToken,
  normalizeRecoveryCode,
  verifyPassword,
} from '../auth';
import { isMailConfigured, sendMail } from '../clients/mail';
import { env } from '../env';
import { exportUserData } from '../db/queries/account';
import { recipePhotoUrls } from '../db/queries/recipes';
import { forgetPhoto } from './photos';
import {
  consumeResetToken,
  deleteUser,
  findRecoveryByEmail,
  findUserByEmail,
  findUserById,
  hasRecoveryCode,
  insertResetToken,
  setRecoveryCodeHash,
  updatePassword,
} from '../db/queries/users';

/**
 * Service du compte : récupération du mot de passe, export, suppression.
 *
 * Deux voies de récupération. Le code de secours, tiré à l'avance et noté par
 * l'utilisateur, ne dépend de rien d'extérieur. Le courriel, lui, n'existe que
 * si l'envoi est configuré : sans service d'envoi, proposer « recevoir un
 * lien » serait promettre un courriel qui n'arrivera jamais.
 *
 * Aucune réponse ne dit si une adresse a un compte. Un mauvais code, une
 * adresse inconnue et un compte sans code donnent la même erreur, dans le
 * même temps de réponse.
 */

/** Durée de validité d'un lien de réinitialisation. */
const RESET_TOKEN_MINUTES = 30;

/**
 * Empreinte factice, vérifiée quand le compte n'a pas de code : le temps de
 * réponse ne doit pas dire s'il en a un.
 */
const DUMMY_HASH =
  'pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function isValidNewPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= 512;
}

/** Tire un nouveau code de secours ; l'ancien cesse de valoir. Rendu une seule fois. */
export async function createRecoveryCode(userId: number): Promise<string> {
  const code = generateRecoveryCode();
  await setRecoveryCodeHash(userId, await hashPassword(normalizeRecoveryCode(code)));
  return code;
}

export function recoveryCodeExists(userId: number): Promise<boolean> {
  return hasRecoveryCode(userId);
}

export type RecoverResult = { kind: 'recovered'; userId: number } | { kind: 'refused' };

/**
 * Choisit un nouveau mot de passe avec le code de secours.
 *
 * Le code est consommé : il a été montré, peut-être photographié, et un code
 * qui resservirait après usage serait une seconde clé laissée sous le paillasson.
 */
export async function recoverWithCode(
  email: string,
  code: string,
  newPassword: string,
): Promise<RecoverResult> {
  if (!isValidNewPassword(newPassword)) {
    return { kind: 'refused' };
  }
  const account = await findRecoveryByEmail(email);
  const ok = await verifyPassword(
    normalizeRecoveryCode(code),
    account?.recoveryCodeHash ?? DUMMY_HASH,
  );
  if (account === null || account.recoveryCodeHash === null || !ok) {
    return { kind: 'refused' };
  }
  await updatePassword(account.id, await hashPassword(newPassword), {
    consumeRecoveryCode: true,
  });
  return { kind: 'recovered', userId: account.id };
}

export function emailRecoveryAvailable(): boolean {
  return isMailConfigured();
}

/**
 * Envoie un lien de réinitialisation, si l'adresse a un compte.
 *
 * Ne dit rien de l'issue : l'écran répond « si un compte existe, un courriel
 * est parti » dans tous les cas.
 */
export async function requestEmailReset(email: string, now: Date = new Date()): Promise<void> {
  const mail = env.mail;
  if (mail === null) {
    return;
  }
  const user = await findUserByEmail(email);
  if (user === null) {
    return;
  }

  const token = generateResetToken();
  await insertResetToken(
    user.id,
    await hashResetToken(token),
    new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000),
  );
  const link = `${mail.appUrl}/recover/reset?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: 'Aars — nouveau mot de passe',
    text: [
      'Bonjour,',
      '',
      'Pour choisir un nouveau mot de passe Aars, ouvre ce lien :',
      link,
      '',
      `Il vaut ${RESET_TOKEN_MINUTES} minutes et ne sert qu’une fois.`,
      'Si tu n’as rien demandé, ignore ce message : ton mot de passe ne change pas.',
    ].join('\n'),
  });
}

/** Choisit un nouveau mot de passe avec le lien reçu par courriel. */
export async function resetWithToken(token: string, newPassword: string): Promise<RecoverResult> {
  if (!isValidNewPassword(newPassword)) {
    return { kind: 'refused' };
  }
  const userId = await consumeResetToken(await hashResetToken(token), new Date());
  if (userId === null) {
    return { kind: 'refused' };
  }
  await updatePassword(userId, await hashPassword(newPassword), { consumeRecoveryCode: false });
  return { kind: 'recovered', userId };
}

/** Tout ce que l'application garde de l'utilisateur, prêt à sérialiser. */
export async function exportAccount(userId: number) {
  return {
    exportedAt: new Date().toISOString(),
    format: 'aars-export-1',
    ...(await exportUserData(userId)),
  };
}

export type DeleteAccountResult = { kind: 'deleted' } | { kind: 'wrong_password' };

/**
 * Supprime le compte et tout ce qu'il porte, après confirmation du mot de passe.
 *
 * Le mot de passe est redemandé même avec une session ouverte : un téléphone
 * laissé déverrouillé sur la table ne doit pas suffire à effacer des mois de
 * journal, et la suppression ne se rattrape pas.
 */
export async function deleteAccount(userId: number, password: string): Promise<DeleteAccountResult> {
  const user = await findUserById(userId);
  if (user === null || !(await verifyPassword(password, user.passwordHash))) {
    return { kind: 'wrong_password' };
  }
  // Les photos posées sur ses recettes vivent hors de la base : on les relève
  // avant que la cascade n'efface les recettes, puis on les efface aussi.
  const photos = await recipePhotoUrls(userId);
  await deleteUser(userId);
  await Promise.all(photos.map((url) => forgetPhoto(url)));
  return { kind: 'deleted' };
}
