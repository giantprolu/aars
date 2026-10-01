import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, readSessionToken } from './auth';

/**
 * Garde partagé des routes serveur (FR-2, AD-7).
 * Le middleware couvre les navigations ; les routes sous /api l'appellent
 * elles-mêmes pour répondre 401 plutôt que de rediriger.
 */

/**
 * L'utilisateur de la session, ou `null`. C'est le seul point d'entrée du
 * cloisonnement : tout ce qui lit ou écrit des données personnelles part de
 * cet identifiant, jamais d'un paramètre fourni par le client.
 */
export async function currentUserId(): Promise<number | null> {
  // Les apps natives portent le même jeton signé, en en-tête plutôt qu'en
  // cookie. Un en-tête présent mais invalide ne retombe pas sur le cookie :
  // le client a dit qui il était, et ce n'est pas vérifiable.
  const authorization = (await headers()).get('authorization');
  if (authorization !== null) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    return readSessionToken(match?.[1]);
  }
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Vrai pour une app native, qui s'annonce par `X-Client: mobile`. */
export function isMobileClient(request: Request): boolean {
  return request.headers.get('x-client') === 'mobile';
}

/** Vrai si une session est ouverte, sans se soucier de qui. */
export async function hasSession(): Promise<boolean> {
  return (await currentUserId()) !== null;
}

/**
 * L'utilisateur d'une page, ou une redirection vers le déverrouillage.
 *
 * Réservé aux composants serveur : `redirect` lève une exception que seul le
 * rendu d'une page sait intercepter. Une route sous /api doit répondre 401 et
 * appelle donc `currentUserId` directement.
 *
 * En pratique le middleware a déjà filtré la navigation. La redirection reste
 * le filet en cas de cookie expiré entre le middleware et le rendu.
 */
export async function requireUserId(): Promise<number> {
  const userId = await currentUserId();
  if (userId === null) {
    redirect('/unlock');
  }
  return userId;
}
