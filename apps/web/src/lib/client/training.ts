/**
 * Appels navigateur vers les routes de séance.
 * Résultats discriminés plutôt qu'exceptions (AD-12).
 */

export type GenerateProgramOutcome =
  | { kind: 'generated'; created: number; replaced: number; missingGroups: string[] }
  | { kind: 'error' };

/** Compose le programme depuis les préférences, et remplace le précédent. */
export async function generateProgram(): Promise<GenerateProgramOutcome> {
  try {
    const response = await fetch('/api/training', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    });
    if (!response.ok) {
      return { kind: 'error' };
    }
    const body = (await response.json()) as {
      created: number;
      replaced: number;
      missingGroups: string[];
    };
    return {
      kind: 'generated',
      created: body.created,
      replaced: body.replaced,
      missingGroups: body.missingGroups,
    };
  } catch {
    return { kind: 'error' };
  }
}

export type SavePreferencesOutcome = { kind: 'saved' } | { kind: 'error' };

export async function savePreferences(preferences: {
  gymId: number | null;
  focus: 'upper' | 'lower' | 'full';
  equipment: 'free' | 'machine' | 'any';
  sessionsPerWeek: number;
}): Promise<SavePreferencesOutcome> {
  try {
    const response = await fetch('/api/training/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(preferences),
    });
    return response.ok ? { kind: 'saved' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export type StartSessionOutcome =
  /** `alreadyOpen` signale qu'on rejoint une séance en cours au lieu d'en ouvrir une. */
  | { kind: 'started'; id: number; alreadyOpen: boolean }
  | { kind: 'error' };

export async function startSession(templateId: number | null): Promise<StartSessionOutcome> {
  try {
    const response = await fetch('/api/training/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    if (!response.ok) {
      return { kind: 'error' };
    }
    const body = (await response.json()) as { id: number; alreadyOpen?: boolean };
    return { kind: 'started', id: body.id, alreadyOpen: body.alreadyOpen === true };
  } catch {
    return { kind: 'error' };
  }
}

export type SimpleOutcome = { kind: 'ok' } | { kind: 'error' };

/**
 * Enregistre une série, ou corrige celle qui occupe ce rang.
 *
 * Le rang est porté par l'appelant et non par le serveur : c'est lui qui sait
 * quelle case de la grille vient d'être remplie, et une série corrigée doit
 * remplacer la précédente plutôt que s'ajouter à elle.
 */
export async function recordSet(input: {
  sessionId: number;
  exerciseId: number;
  position: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  toFailure: boolean;
}): Promise<SimpleOutcome> {
  try {
    const response = await fetch('/api/training/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export async function removeSet(setId: number): Promise<SimpleOutcome> {
  try {
    const response = await fetch('/api/training/sets', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export async function finishSession(id: number): Promise<SimpleOutcome> {
  try {
    const response = await fetch(`/api/training/sessions/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'finish' }),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Modifie un exercice du programme : l'inscrire à la place d'un autre, ou
 * régler son repos (`null` revient au repos déduit de la prescription).
 */
export async function updateTemplateExercise(input: {
  entryId: number;
  exerciseId?: number;
  restSeconds?: number | null;
}): Promise<SimpleOutcome> {
  try {
    const response = await fetch('/api/training/templates/exercises', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** Abandonne une séance. Ses séries partent avec elle. */
export async function discardSession(id: number): Promise<SimpleOutcome> {
  try {
    const response = await fetch(`/api/training/sessions/${id}`, { method: 'DELETE' });
    return response.ok ? { kind: 'ok' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** Une série lue sur une ligne saisie à la main. */
export interface ParsedSetPayload {
  reps: number | null;
  seconds: number | null;
  weightKg: number | null;
  toFailure: boolean;
}

/** Un exercice du catalogue proposé pour une ligne saisie. */
export interface AnalysedCandidatePayload {
  id: number;
  slug: string;
  name: string;
  muscleGroup: string | null;
  equipment: 'free' | 'machine' | 'cable' | 'bodyweight' | 'cardio';
  score: number;
}

export interface AnalysedLinePayload {
  raw: string;
  name: string;
  sets: ParsedSetPayload[];
  warning: 'none' | 'no_sets' | 'weight_count';
  matchedExerciseId: number | null;
  candidates: AnalysedCandidatePayload[];
}

export type AnalyseLogOutcome =
  | { kind: 'analysed'; lines: AnalysedLinePayload[] }
  | { kind: 'error' };

/** Lit une séance écrite, sans rien enregistrer. */
export async function analyseWorkoutLog(text: string): Promise<AnalyseLogOutcome> {
  try {
    const response = await fetch('/api/training/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'analyse', text }),
    });
    if (!response.ok) {
      return { kind: 'error' };
    }
    const body = (await response.json()) as { lines: AnalysedLinePayload[] };
    return { kind: 'analysed', lines: body.lines };
  } catch {
    return { kind: 'error' };
  }
}

export type SaveWrittenSessionOutcome =
  | { kind: 'saved'; id: number; sets: number }
  | { kind: 'error' };

export async function saveWrittenSession(input: {
  sessionDate: string;
  lines: readonly {
    exerciseId: number | null;
    name: string;
    sets: readonly ParsedSetPayload[];
  }[];
}): Promise<SaveWrittenSessionOutcome> {
  try {
    const response = await fetch('/api/training/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save', ...input }),
    });
    if (!response.ok) {
      return { kind: 'error' };
    }
    const body = (await response.json()) as { id: number; sets: number };
    return { kind: 'saved', id: body.id, sets: body.sets };
  } catch {
    return { kind: 'error' };
  }
}

async function send(url: string, method: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** Ouvre une séance libre, à remplir exercice par exercice. */
export async function startFreeSession(): Promise<StartSessionOutcome> {
  const response = await send('/api/training/sessions', 'POST', { free: true });
  if (response === null || !response.ok) {
    return { kind: 'error' };
  }
  const body = (await response.json()) as { id: number; alreadyOpen?: boolean };
  return { kind: 'started', id: body.id, alreadyOpen: body.alreadyOpen === true };
}

export type ComposeOutcome =
  | { kind: 'saved'; templateId: number; sessionId: number | null; alreadyOpen: boolean }
  | { kind: 'error' };

/** Écrit une séance composée ; `start` l'ouvre dans la foulée. */
export async function composeSession(input: {
  name: string | null;
  exercises: readonly { exerciseId: number; sets: number; reps: number | null; seconds: number | null }[];
  keep: boolean;
  start: boolean;
}): Promise<ComposeOutcome> {
  const response = await send('/api/training/templates', 'POST', input);
  if (response === null || !response.ok) {
    return { kind: 'error' };
  }
  const body = (await response.json()) as {
    templateId: number;
    sessionId?: number | null;
    alreadyOpen?: boolean;
  };
  return {
    kind: 'saved',
    templateId: body.templateId,
    sessionId: body.sessionId ?? null,
    alreadyOpen: body.alreadyOpen === true,
  };
}

/** Ajoute un exercice à la séance libre en cours. */
export async function addSessionExercise(
  sessionId: number,
  exerciseId: number,
): Promise<SimpleOutcome> {
  const response = await send(`/api/training/sessions/${sessionId}/exercises`, 'POST', {
    exerciseId,
  });
  return response?.ok ? { kind: 'ok' } : { kind: 'error' };
}

/** Range une séance modèle dans les favoris, ou l'en sort. */
export async function setTemplateFavorite(
  templateId: number,
  favorite: boolean,
  name: string | null = null,
): Promise<SimpleOutcome> {
  const response = await send(`/api/training/templates/${templateId}`, 'PATCH', {
    favorite,
    name,
  });
  return response?.ok ? { kind: 'ok' } : { kind: 'error' };
}

/** Retient une séance faite dans les favoris. */
export async function favoriteSession(
  sessionId: number,
  name: string | null,
): Promise<SimpleOutcome> {
  const response = await send(`/api/training/sessions/${sessionId}/favorite`, 'POST', { name });
  return response?.ok ? { kind: 'ok' } : { kind: 'error' };
}

/** Met un exercice en favori ou l'en retire. */
export async function setExerciseFavorite(
  exerciseId: number,
  favorite: boolean,
): Promise<SimpleOutcome> {
  const response = await send('/api/training/exercises/favorites', 'PUT', {
    exerciseId,
    favorite,
  });
  return response?.ok ? { kind: 'ok' } : { kind: 'error' };
}
