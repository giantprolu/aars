import { ScreenHeader } from '@/components/ScreenHeader';
import { requireUserId } from '@/server/guard';
import {
  gymCatalog,
  openSessionFor,
  preferencesFor,
  sessionHistory,
  templatesFor,
} from '@/server/services/workouts';
import { pendingRequestCount } from '@/server/services/social';
import { TrainingHome } from './TrainingHome';

// Les séances viennent du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/** Nombre de séances rappelées sous le programme. Deux semaines à trois par semaine. */
const RECENT_LIMIT = 6;

/**
 * L'accueil du Sport.
 *
 * Composant serveur, aucun import client (AD-10). Les lectures partent
 * ensemble : elles ne dépendent pas les unes des autres, et les enchaîner
 * multiplierait l'attente sur une connexion de salle de sport.
 */
export default async function TrainingPage() {
  const userId = await requireUserId();
  const [templates, openSession, history, preferences, gyms, pending] = await Promise.all([
    templatesFor(userId),
    openSessionFor(userId),
    sessionHistory(userId, RECENT_LIMIT),
    preferencesFor(userId),
    gymCatalog(),
    pendingRequestCount(userId),
  ]);

  const gymName = gyms.find((gym) => gym.id === preferences.gymId)?.name ?? null;

  return (
    <>
      <ScreenHeader title="Sport" kicker="Mes séances" />
      <TrainingHome
        templates={templates}
        openSession={openSession}
        history={history.filter((session) => session.finishedAt !== null)}
        preferences={preferences}
        gymName={gymName}
        pendingRequests={pending}
      />
    </>
  );
}
