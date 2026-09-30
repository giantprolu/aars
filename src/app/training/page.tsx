import { DumbbellIcon } from 'lucide-react';
import { DomainHeader } from '@/components/DomainHeader';
import { requireUserId } from '@/server/guard';
import { identityFor } from '@/server/services/social';
import {
  openSessionFor,
  preferencesFor,
  progressOverview,
  sessionHistory,
  templatesFor,
} from '@/server/services/workouts';
import { isoWeekNumber, startOfWeek, todayInParis } from '@/lib/date';
import { initialsOf } from '@/lib/social';
import { nextProgramTemplate, sessionVolume } from '@/lib/workout';
import { recordsSince } from '@/lib/workout-progress';
import { TrainingHome } from './TrainingHome';

// Les séances viennent du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/** Séances rappelées sous le programme. */
const RECENT_SHOWN = 4;

/** Séances lues : de quoi couvrir la semaine, la rotation et la liste. */
const HISTORY_READ = 14;

/**
 * L'accueil du Sport (maquette 5a, écran 4).
 *
 * Composant serveur, aucun import client (AD-10). Les lectures partent
 * ensemble : elles ne dépendent pas les unes des autres, et les enchaîner
 * multiplierait l'attente sur une connexion de salle de sport.
 */
export default async function TrainingPage() {
  const userId = await requireUserId();
  const today = todayInParis();
  const weekStart = startOfWeek(today);
  const [templates, openSession, history, preferences, progress, identity] = await Promise.all([
    templatesFor(userId),
    openSessionFor(userId),
    sessionHistory(userId, HISTORY_READ),
    preferencesFor(userId),
    progressOverview(userId),
    identityFor(userId),
  ]);

  const finished = history.filter((session) => session.finishedAt !== null);
  const thisWeek = finished.filter((session) => session.sessionDate >= weekStart);
  const weekVolume = thisWeek.reduce((total, session) => total + sessionVolume(session.sets), 0);
  const lastWeek = progress.weeks[progress.weeks.length - 2]?.volume ?? 0;
  const volumeChange =
    lastWeek > 0 && weekVolume > 0 ? Math.round(((weekVolume - lastWeek) / lastWeek) * 100) : null;

  const records = recordsSince(progress.exercises, weekStart);
  // Une séance porte un record si l'un des exercices y a établi le sien.
  const recordSessionIds = recordsSince(progress.exercises, '0000-01-01').map(
    (exercise) => exercise.record.sessionId,
  );

  return (
    <div className="flex flex-col gap-3 pb-4">
      <DomainHeader
        title="Sport"
        kicker={`Semaine ${isoWeekNumber(today)}`}
        icon={DumbbellIcon}
        tone="sport"
        initials={initialsOf(identity.displayName ?? identity.handle)}
      />
      <TrainingHome
        templates={templates}
        openSession={openSession}
        nextTemplateId={nextProgramTemplate(templates, history)?.id ?? null}
        history={finished.slice(0, RECENT_SHOWN)}
        preferences={preferences}
        weekSessions={thisWeek.length}
        weekVolume={weekVolume}
        volumeChange={volumeChange}
        records={records.map((exercise) => exercise.exercise.name)}
        recordSessionIds={recordSessionIds}
      />
    </div>
  );
}
