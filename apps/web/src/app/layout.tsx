import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Geist_Mono, Instrument_Sans } from 'next/font/google';
import { TabBar } from '@/components/TabBar';
import { INSTALL_PROMPT_KEY, INSTALL_READY_EVENT } from '@/lib/client/install';
import {
  THEME_COLORS,
  THEME_COOKIE,
  readAppearance,
  themeAttribute,
} from '@/lib/theme';
import './globals.css';

/**
 * Instrument Sans, la police des maquettes de la refonte, et Geist Mono pour
 * les codes-barres saisis à la main.
 *
 * `next/font` la sert depuis notre propre domaine plutôt que depuis Google :
 * aucune requête vers un tiers au chargement, donc pas de fuite d'adresse IP,
 * et la substitution de police est calculée à la compilation, ce qui évite le
 * décalage de mise en page à l'affichage.
 */
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-instrument-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Aars',
  description: 'Registre alimentaire personnel.',
  manifest: '/manifest.json',
  applicationName: 'Aars',
  appleWebApp: {
    capable: true,
    title: 'Aars',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

/**
 * La barre d'état suit le thème rendu, et non un thème figé.
 *
 * En mode auto, deux déclarations sous condition de média laissent le système
 * trancher. Avec un choix explicite, une seule couleur est émise : sans cela,
 * une personne ayant forcé le thème clair sur un téléphone en mode sombre
 * verrait une barre d'état noire au-dessus d'une page claire.
 */
export async function generateViewport(): Promise<Viewport> {
  const store = await cookies();
  const appearance = readAppearance(store.get(THEME_COOKIE)?.value);

  const themeColor =
    appearance === 'auto'
      ? [
          { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
          { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
        ]
      : THEME_COLORS[appearance];

  return {
    themeColor,
    colorScheme: appearance === 'auto' ? 'light dark' : appearance,
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

/**
 * Capture de `beforeinstallprompt`, posée avant tout le reste.
 *
 * Chromium émet cet événement une seule fois, tôt, et souvent avant que React
 * n'ait pris la main. Un écouteur monté dans un composant arriverait après la
 * fête neuf fois sur dix, et le bouton d'installation ne s'afficherait jamais
 * sur Android — panne parfaitement muette, puisque rien n'échoue.
 *
 * `preventDefault` empêche la bannière spontanée du navigateur : l'invite
 * s'ouvrira au geste de l'utilisateur, depuis l'écran qui l'explique, et non
 * par surprise au milieu d'une saisie de repas.
 *
 * Quatre lignes en clair dans le document plutôt qu'un module chargé : tout ce
 * qui passe par le graphe de modules arrive, par construction, trop tard.
 */
const CAPTURE_SCRIPT = `window.${INSTALL_PROMPT_KEY}=null;addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.${INSTALL_PROMPT_KEY}=e;dispatchEvent(new Event('${INSTALL_READY_EVENT}'))});addEventListener('appinstalled',function(){window.${INSTALL_PROMPT_KEY}=null});`;

/**
 * Relevé de la hauteur de fenêtre, dans `--app-height`.
 *
 * Voir `--viewport-height` dans globals.css pour ce qu'il répare. Trois
 * raisons de l'écrire en clair dans le document plutôt que dans un composant :
 * il doit s'exécuter avant le premier rendu, il ne dépend de rien, et une
 * hauteur qui arriverait après coup ferait sauter la mise en page sous les
 * yeux.
 *
 * L'écoute des redimensionnements est ce qui rend la valeur auto-réparatrice :
 * même si le premier relevé est pris de court lui aussi, iOS finit par dire la
 * vraie taille, et la barre se replace sans que personne n'ait à naviguer.
 */
const VIEWPORT_SCRIPT = `(function(){function m(){document.documentElement.style.setProperty('--app-height',window.innerHeight+'px')}m();addEventListener('resize',m);addEventListener('orientationchange',m);addEventListener('pageshow',m)})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const store = await cookies();
  const theme = themeAttribute(readAppearance(store.get(THEME_COOKIE)?.value));

  return (
    <html
      lang="fr"
      // Rien en mode auto : l'absence d'attribut rend la main au système.
      {...(theme === undefined ? {} : { 'data-theme': theme })}
      className={`${instrumentSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIEWPORT_SCRIPT }} />
      </head>
      {/*
        Colonne haute d'au moins un écran — la hauteur est posée sur `body`
        dans globals.css, parce qu'elle se calcule. Le contenu pousse, la barre
        d'onglets se range en dernier : c'est cette mise en page qui la tient au
        bas de l'écran, et non un positionnement fixe — voir `TabBar`.
      */}
      <body className="flex flex-col font-sans">
        {/*
          Le retrait haut n'est pas seulement la zone sûre : celle-ci s'arrête
          au ras de l'encoche, et un titre posé dessus paraît collé au bord.
          La demi-marge qui s'y ajoute donne l'air que le matériel ne donne pas.
        */}
        <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-[calc(var(--safe-top)+0.5rem)] pb-6">
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  );
}
