import { AddModes } from '@/components/AddModes';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';

/**
 * Choix du mode d'ajout, en pleine page.
 *
 * Le chemin ordinaire est la feuille qui s'ouvre depuis le bouton du journal ;
 * cet écran reste la même liste pour les entrées qui ne passent pas par elle :
 * le bouton du journal vide, un signet, un retour arrière depuis un mode.
 */
export default function AddPage() {
  return (
    <>
      <NavHeader label="Journal" href="/" />
      <PageTitle title="Ajouter un aliment" description="Cinq façons, au choix." />
      <div className="mt-5">
        <AddModes />
      </div>
    </>
  );
}
