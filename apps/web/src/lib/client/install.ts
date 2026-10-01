/**
 * L'invite d'installation native, là où elle existe.
 *
 * Chromium — Chrome et Edge sur Android comme sur ordinateur — émet
 * `beforeinstallprompt` quand il juge le site installable, et cet événement
 * est la seule façon d'ouvrir la boîte de dialogue native. Safari n'en émet
 * aucun, sur iOS comme sur macOS : là-bas, il n'y a rien à déclencher, et
 * l'écran se rabat sur la marche à suivre.
 *
 * L'événement arrive une fois, tôt, et sans prévenir. Il est capté dès le
 * chargement du document par un court script posé dans la page (voir
 * `layout.tsx`), et retenu jusqu'à ce qu'un écran en ait besoin : le capter
 * seulement à l'ouverture des réglages reviendrait à l'avoir manqué neuf fois
 * sur dix, et le bouton d'installation ne s'afficherait jamais.
 */

/** L'événement de Chromium, absent de la bibliothèque standard du DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Nom de la boîte où le script du document dépose l'événement, et de
 * l'événement qu'il émet ensuite.
 *
 * Partagés mot pour mot avec `layout.tsx`. Ils sont exportés plutôt que
 * réécrits là-bas : deux chaînes identiques à deux endroits finissent par
 * diverger, et la panne serait alors parfaitement muette — le bouton
 * n'apparaîtrait simplement plus.
 */
export const INSTALL_PROMPT_KEY = '__nutriInstallPrompt';
export const INSTALL_READY_EVENT = 'nutri:install-ready';

type PromptHolder = Window & { [INSTALL_PROMPT_KEY]?: BeforeInstallPromptEvent | null };

function held(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as PromptHolder)[INSTALL_PROMPT_KEY] ?? null;
}

function release(): void {
  if (typeof window !== 'undefined') {
    (window as PromptHolder)[INSTALL_PROMPT_KEY] = null;
  }
}

/** Vrai si une invite native est disponible à cet instant. */
export function hasNativePrompt(): boolean {
  return held() !== null;
}

/**
 * Prévient quand l'invite devient disponible, ou quand elle est consommée.
 *
 * Rend de quoi se désabonner, comme tout abonnement : un écran démonté qui
 * garderait son écouteur ferait fuir un rendu React à chaque navigation.
 */
export function watchNativePrompt(onChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(INSTALL_READY_EVENT, onChange);
  window.addEventListener('appinstalled', onChange);
  return () => {
    window.removeEventListener(INSTALL_READY_EVENT, onChange);
    window.removeEventListener('appinstalled', onChange);
  };
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Ouvre la boîte de dialogue native et rend la décision de l'utilisateur.
 *
 * L'événement est relâché quoi qu'il arrive : Chromium n'admet qu'un seul
 * appel à `prompt()` par événement, et le garder laisserait un bouton qui ne
 * fait plus rien. Un refus n'est pas une erreur — c'est une réponse, et la
 * marche à suivre reste affichée dessous pour qui voudrait y revenir.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = held();
  if (event === null) {
    return 'unavailable';
  }

  release();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return 'unavailable';
  } finally {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(INSTALL_READY_EVENT));
    }
  }
}
