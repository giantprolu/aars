import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { InstallGuide } from './InstallGuide';

/**
 * Installation sur l'écran d'accueil (FR-24).
 *
 * La page ne porte plus la marche à suivre : celle-ci dépend du navigateur, et
 * un texte unique se trompait deux fois sur trois — il parlait de Safari à
 * quelqu'un sur Android, et de quatre étapes à qui a déjà installé
 * l'application. Tout ce qui varie est descendu dans `InstallGuide`, qui sait
 * où il tourne.
 *
 * Elle reste permanente et non rejetable : il n'existe aucune invite
 * automatique sur iOS, et le chemin est assez obscur pour mériter un écran.
 */
export default function InstallPage() {
  return (
    <>
      <NavHeader label="Réglages" href="/settings" />
      <PageTitle
        title="Installer sur l'écran d'accueil"
        description="Une fois installée, l'application s'ouvre en plein écran, sans barre d'adresse, et garde sa session plus longtemps."
      />

      <InstallGuide />
    </>
  );
}
