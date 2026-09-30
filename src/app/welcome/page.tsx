import { requireUserId } from '@/server/guard';
import { profileFor } from '@/server/services/profile';
import { identityFor } from '@/server/services/social';
import { gymCatalog, preferencesFor } from '@/server/services/workouts';
import { WelcomeFlow } from './WelcomeFlow';

export const dynamic = 'force-dynamic';

/**
 * Le premier lancement, après l'inscription (maquette 5b) : l'objectif, le
 * profil Communauté, puis les séances. Trois étapes, chacune se modifie
 * ensuite depuis son écran.
 *
 * Les réponses déjà données pré-remplissent les champs : on peut revenir ici
 * sans rien perdre.
 */
export default async function WelcomePage() {
  const userId = await requireUserId();
  const [profile, identity, preferences, gyms] = await Promise.all([
    profileFor(userId),
    identityFor(userId),
    preferencesFor(userId),
    gymCatalog(),
  ]);
  return (
    <WelcomeFlow
      profile={profile}
      identity={identity}
      preferences={preferences}
      gyms={gyms.map((gym) => ({ id: gym.id, name: gym.name }))}
    />
  );
}
