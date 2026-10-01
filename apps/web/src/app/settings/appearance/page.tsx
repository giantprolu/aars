import { cookies } from 'next/headers';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { THEME_COOKIE, readAppearance } from '@/lib/theme';
import { AppearanceForm } from './AppearanceForm';

export const dynamic = 'force-dynamic';

/**
 * Apparence claire ou sombre.
 *
 * Le même réglage se fait sur place, depuis la rangée « Thème » des réglages ;
 * cet écran reste pour les liens déjà posés.
 *
 * « Auto » est le défaut et le reste : c'est le seul réglage qui suit la
 * personne d'une application à l'autre, et qui bascule tout seul le soir sur
 * les téléphones réglés ainsi.
 */
export default async function AppearancePage() {
  const store = await cookies();
  const appearance = readAppearance(store.get(THEME_COOKIE)?.value);

  return (
    <>
      <NavHeader label="Réglages" href="/settings" />
      <PageTitle
        title="Apparence"
        description="Par défaut, l'application suit le réglage clair ou sombre de ton téléphone."
        className="mb-5"
      />
      <AppearanceForm initial={appearance} />
    </>
  );
}
