import { requireUserId } from '@/server/guard';
import { gymCatalog, preferencesFor } from '@/server/services/workouts';
import { PreferencesForm } from './PreferencesForm';

export const dynamic = 'force-dynamic';

/**
 * Les trois questions qui composent le programme.
 *
 * Composant serveur, aucun import client (AD-10). Les deux lectures partent
 * ensemble : la liste des salles ne dépend pas des réponses de l'utilisateur.
 */
export default async function TrainingPreferencesPage() {
  const userId = await requireUserId();
  const [preferences, gyms] = await Promise.all([preferencesFor(userId), gymCatalog()]);

  return <PreferencesForm preferences={preferences} gyms={gyms} />;
}
