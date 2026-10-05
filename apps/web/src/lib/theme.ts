/**
 * Apparence claire ou sombre. Module pur, sans dépendance.
 *
 * Par défaut l'application suit le réglage du système : c'est `auto`, et rien
 * n'est alors posé sur <html> — la feuille de style bascule seule sur
 * `prefers-color-scheme`, qu'iOS et Android renseignent tous les deux.
 *
 * Le choix explicite est rangé dans un cookie et non dans `localStorage` :
 * iOS purge le stockage local au bout de sept jours (interdits du projet), et
 * surtout le serveur doit connaître le thème pour rendre la bonne valeur dès
 * la première réponse. Sans cela, la page s'afficherait une fraction de
 * seconde dans le mauvais thème avant que le navigateur ne corrige.
 */

// Nom d'avant Aars, gardé : le changer ferait oublier le thème choisi.
export const THEME_COOKIE = 'nutriperso_appearance';

export const APPEARANCES = ['auto', 'light', 'dark'] as const;

export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  auto: 'Auto',
  light: 'Clair',
  dark: 'Sombre',
};

export const APPEARANCE_HINTS: Record<Appearance, string> = {
  auto: 'Suit le réglage du système',
  light: 'Toujours clair',
  dark: 'Toujours sombre',
};

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value);
}

export function readAppearance(value: string | undefined): Appearance {
  return isAppearance(value) ? value : 'auto';
}

/**
 * La valeur de `data-theme` à poser sur <html>, ou `undefined` en mode auto.
 *
 * L'absence d'attribut est significative : c'est elle qui rend la main à
 * `prefers-color-scheme`. Poser ici le thème clair par défaut reviendrait à
 * ignorer le réglage du système, ce que l'utilisateur n'a pas demandé.
 */
export function themeAttribute(appearance: Appearance): string | undefined {
  if (appearance === 'light') {
    return 'light';
  }
  if (appearance === 'dark') {
    return 'dark';
  }
  return undefined;
}

/** Couleur de fond des deux thèmes, pour la barre d'état du système. */
export const THEME_COLORS = { light: '#f4f1eb', dark: '#15120f' } as const;
