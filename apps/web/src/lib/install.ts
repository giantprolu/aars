/**
 * Installation sur l'écran d'accueil : détection du contexte. Module pur (AD-8).
 *
 * Le fait central est qu'il n'existe aucune façon d'installer une application
 * web par programme sur iOS. Apple ne fournit pas `beforeinstallprompt`, et le
 * geste reste entièrement à la main de l'utilisateur : Partager, « Sur l'écran
 * d'accueil », Ajouter. Aucune bibliothèque ni astuce ne contourne cela — le
 * seul service qu'on puisse rendre est de montrer le bon chemin, au bon moment,
 * à la bonne personne.
 *
 * Sur Android et sur les navigateurs de bureau fondés sur Chromium, en
 * revanche, `beforeinstallprompt` permet un vrai bouton qui ouvre la boîte de
 * dialogue native. Les deux mondes coexistent, et l'écran doit donc savoir où
 * il tourne avant de dire quoi que ce soit.
 *
 * La détection se fait sur la chaîne d'agent, ce qui est fragile par nature.
 * Elle ne décide ici que d'un texte d'aide : une erreur affiche la mauvaise
 * marche à suivre, elle ne casse rien et ne fait rien perdre.
 */

/**
 * Le contexte d'exécution, du point de vue de l'installation.
 *
 * `ios-other` existe parce qu'iOS 16.4 a ouvert l'installation aux navigateurs
 * tiers : Chrome et Firefox sur iPhone savent désormais poser une icône sur
 * l'écran d'accueil, mais par leur propre menu, qui n'est pas celui de Safari.
 * Les confondre ferait chercher un bouton Partager qui n'est pas là.
 *
 * `in-app` désigne les vues web intégrées à une autre application — Instagram,
 * Facebook, LinkedIn. L'installation y est purement et simplement absente, et
 * la seule chose utile à dire est d'ouvrir la page dans un vrai navigateur.
 */
export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'desktop' | 'in-app';

/**
 * Navigateurs intégrés à une autre application.
 *
 * Testés en premier : la vue web d'Instagram sur iPhone porte aussi « iPhone »
 * dans son agent, et la reconnaître comme Safari enverrait chercher un bouton
 * Partager qui n'existe pas dans cette barre d'outils.
 */
const IN_APP_PATTERN = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|MicroMessenger|Snapchat/i;

/** Navigateurs tiers sur iOS, qui portent tous un suffixe propre. */
const IOS_THIRD_PARTY_PATTERN = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i;

/**
 * Le contexte, déduit de l'agent utilisateur.
 *
 * `maxTouchPoints` sert à reconnaître un iPad récent : depuis iPadOS 13, il
 * s'annonce « Macintosh » et serait pris pour un ordinateur de bureau, à qui
 * l'on proposerait un bouton d'installation qui ne ferait jamais rien. Le
 * nombre de points de contact est le seul indice qui reste.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (IN_APP_PATTERN.test(userAgent)) {
    return 'in-app';
  }

  const isIpadOS = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(userAgent) || isIpadOS) {
    return IOS_THIRD_PARTY_PATTERN.test(userAgent) ? 'ios-other' : 'ios-safari';
  }

  if (/Android/i.test(userAgent)) {
    return 'android';
  }

  return 'desktop';
}

/**
 * Les étapes à suivre, quand aucun bouton natif n'est disponible.
 *
 * Écrites ici et non dans l'écran pour la même raison que la liste des repas :
 * ce sont des données, elles se relisent d'un bloc, et le composant n'a pas à
 * porter quatre variantes de texte en plein milieu de son balisage.
 */
export const INSTALL_STEPS: Record<InstallPlatform, readonly string[]> = {
  'ios-safari': [
    'Touche le bouton Partager — le carré surmonté d’une flèche.',
    'Fais défiler le menu, puis choisis « Sur l’écran d’accueil ».',
    'Touche « Ajouter », en haut à droite.',
  ],
  'ios-other': [
    'Ouvre le menu du navigateur — les trois points, ou le bouton Partager.',
    'Choisis « Ajouter à l’écran d’accueil ».',
    'Valide. Sur iPhone, Safari reste le chemin le plus sûr si tu ne le trouves pas.',
  ],
  android: [
    'Ouvre le menu du navigateur — les trois points, en haut à droite.',
    'Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
    'Valide.',
  ],
  desktop: [
    'Cherche l’icône d’installation dans la barre d’adresse, à droite.',
    'À défaut, ouvre le menu du navigateur et cherche « Installer NutriPerso ».',
  ],
  'in-app': [
    'Touche les trois points, en haut de cet écran.',
    'Choisis « Ouvrir dans le navigateur ».',
    'Reprends l’installation depuis là.',
  ],
};

/** Ce que l'écran annonce en titre, selon l'endroit où il tourne. */
export const INSTALL_HEADLINES: Record<InstallPlatform, string> = {
  'ios-safari': 'Trois gestes dans Safari',
  'ios-other': 'Trois gestes dans ce navigateur',
  android: 'Trois gestes dans ce navigateur',
  desktop: 'Depuis la barre d’adresse',
  'in-app': 'Ouvre d’abord un vrai navigateur',
};

/**
 * Vrai quand la page tourne déjà depuis l'écran d'accueil.
 *
 * Les deux épreuves ne sont pas redondantes. `display-mode: standalone` est la
 * façon standard, comprise partout ; `navigator.standalone` est la propriété
 * propriétaire d'Apple, seule fiable sur les anciennes versions d'iOS. Se
 * contenter de la première afficherait la marche à suivre à quelqu'un qui a
 * déjà installé l'application, ce qui est le meilleur moyen de lui faire
 * croire que l'installation a échoué.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia('(display-mode: standalone)').matches || legacy === true;
}
