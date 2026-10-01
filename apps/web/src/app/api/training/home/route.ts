import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import {
  openSessionFor,
  preferencesFor,
  progressOverview,
  sessionHistory,
  templatesFor,
} from '@/server/services/workouts';
import { isoWeekNumber, startOfWeek, todayInParis } from '@/lib/date';
import { formatPrescription, nextProgramTemplate, sessionVolume } from '@/lib/workout';
import { recordsSince } from '@/lib/workout-progress';

export const runtime = 'nodejs';

/** Séances lues : de quoi couvrir la semaine, la rotation et la liste. */
const HISTORY_READ = 14;

/** Séances rappelées sous le programme. */
const RECENT_SHOWN = 4;

/**
 * L'accueil du Sport en une lecture, pour les apps natives : mêmes lectures
 * et mêmes règles que `app/training/page.tsx`.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const today = todayInParis();
  const weekStart = startOfWeek(today);
  const [templates, openSession, history, preferences, progress] = await Promise.all([
    templatesFor(userId),
    openSessionFor(userId),
    sessionHistory(userId, HISTORY_READ),
    preferencesFor(userId),
    progressOverview(userId),
  ]);

  const finished = history.filter((session) => session.finishedAt !== null);
  const thisWeek = finished.filter((session) => session.sessionDate >= weekStart);
  const weekVolume = thisWeek.reduce((total, session) => total + sessionVolume(session.sets), 0);
  const lastWeek = progress.weeks[progress.weeks.length - 2]?.volume ?? 0;
  const volumeChange =
    lastWeek > 0 && weekVolume > 0 ? Math.round(((weekVolume - lastWeek) / lastWeek) * 100) : null;

  const records = recordsSince(progress.exercises, weekStart);
  const recordSessionIds = new Set(
    recordsSince(progress.exercises, '0000-01-01').map((exercise) => exercise.record.sessionId),
  );

  const next = nextProgramTemplate(templates, history);

  return Response.json({
    isoWeek: isoWeekNumber(today),
    weekSessions: thisWeek.length,
    sessionsPerWeek: preferences.sessionsPerWeek,
    weekVolumeKg: weekVolume,
    volumeChange,
    records: records.map((exercise) => exercise.exercise.name),
    openSession:
      openSession === null
        ? null
        : {
            id: openSession.id,
            name: openSession.templateName ?? 'Séance libre',
            setCount: openSession.sets.length,
          },
    next:
      next === null
        ? null
        : {
            id: next.id,
            name: next.name,
            exercises: next.exercises.map((item) => ({ name: item.exercise.name, target: formatPrescription(item) })),
          },
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      kind: template.kind,
      favorite: template.favorite,
      exerciseCount: template.exercises.length,
    })),
    history: finished.slice(0, RECENT_SHOWN).map((session) => ({
      id: session.id,
      name: session.templateName ?? 'Séance libre',
      sessionDate: session.sessionDate,
      durationSeconds:
        session.finishedAt === null
          ? null
          : Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 1000),
      volumeKg: sessionVolume(session.sets),
      record: recordSessionIds.has(session.id),
    })),
  });
}
