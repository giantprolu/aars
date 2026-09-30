import 'server-only';
import type { QuickSession } from '@/lib/quick-add';
import { nextProgramTemplate } from '@/lib/workout';
import { openSessionFor, sessionHistory, templatesFor } from './workouts';

/** Séances relues pour situer la rotation du programme : trois semaines à trois par semaine. */
const ROTATION_WINDOW = 10;

/**
 * La séance à proposer maintenant : celle qui est ouverte s'il y en a une,
 * sinon la suivante du programme, sinon rien.
 *
 * Partagée par le bouton + et l'écran Aujourd'hui, qui doivent proposer la
 * même : deux calculs finiraient par diverger.
 */
export async function quickSessionFor(userId: number): Promise<QuickSession | null> {
  const [open, templates, history] = await Promise.all([
    openSessionFor(userId),
    templatesFor(userId),
    sessionHistory(userId, ROTATION_WINDOW),
  ]);
  if (open !== null) {
    return {
      kind: 'open',
      sessionId: open.id,
      name: open.templateName ?? 'Séance libre',
      setCount: open.sets.length,
    };
  }
  const next = nextProgramTemplate(templates, history);
  return next === null
    ? null
    : { kind: 'next', templateId: next.id, name: next.name, exerciseCount: next.exercises.length };
}
