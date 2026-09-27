import 'server-only';
import { shiftDate, startOfWeek, todayInParis } from '@/lib/date';
import {
  DEFAULT_PREFERENCES,
  isValidReps,
  isValidSeconds,
  isValidWeight,
  MAX_SESSIONS_PER_WEEK,
  MAX_SETS,
  MIN_SESSIONS_PER_WEEK,
  type Exercise,
  type Gym,
  type TrainingPreferences,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutTemplate,
} from '@/lib/workout';
import { buildProgram } from '@/lib/workout-plan';
import {
  exerciseProgress,
  progressByExercise,
  weeklyTotals,
  type ExerciseProgress,
  type WeekPoint,
} from '@/lib/workout-progress';
import {
  bestExerciseMatch,
  parseWorkoutLog,
  rankExercises,
  slugFromName,
  type ExerciseMatch,
  type ParsedExerciseLine,
} from '@/lib/workout-log';
import { gymInventory, SEED_EXERCISES, SEED_GYMS } from '@/lib/workout-seed';
import {
  archiveAllTemplates,
  archiveTemplate,
  catalogSize,
  deleteSession,
  deleteSet,
  ensureSeedExercises,
  ensureSeedGyms,
  findOpenSession,
  findOrCreateExercise,
  findPreferences,
  findSession,
  findTemplate,
  finishSession,
  insertCompletedSession,
  insertSession,
  insertTemplate,
  lastPerformance,
  listExercises,
  listGyms,
  listSessions,
  listTemplates,
  progressSets,
  upsertPreferences,
  upsertSet,
} from '../db/queries/workouts';

/**
 * Service des séances.
 *
 * Trois règles y vivent, et elles sont la raison d'être du module. Une seule
 * séance peut être ouverte à la fois — on ne s'entraîne pas à deux endroits.
 * Chaque série affichée porte ce qu'on a fait la dernière fois sur le même
 * exercice, sans quoi on refait chaque semaine la charge dont on se souvient,
 * c'est-à-dire la plus confortable. Et le programme est composé, jamais figé :
 * il se refait à partir des réponses de l'utilisateur, parce qu'une salle
 * change, une envie change, et un programme qu'on ne peut pas refaire finit
 * par être celui qu'on ne suit plus.
 */

export type { WorkoutTemplate, WorkoutSession, WorkoutSet, TrainingPreferences, Gym };

/** Nombre de séances rendues par l'historique. Un trimestre à trois par semaine. */
export const HISTORY_LIMIT = 40;

/**
 * Vrai une fois le référentiel constaté complet.
 *
 * Porté par le module, comme la connexion elle-même : une instance chaude
 * traite plusieurs affichages, et le comptage ci-dessous coûtait un
 * aller-retour à la base sur chacun pour une réponse qui ne change plus après
 * l'installation. Vider le référentiel en base demande donc de redémarrer
 * l'instance — cela n'arrive qu'en développement, et le seuil de gêne est
 * autrement plus bas côté téléphone.
 */
let catalogReady = false;

/**
 * Sème le référentiel s'il manque quelque chose.
 *
 * Le garde est un simple comptage, et non les insertions idempotentes
 * elles-mêmes : celles-ci réécrivent l'inventaire de chaque salle, ce qui est
 * juste une fois à l'installation et absurde à chaque affichage d'écran.
 */
async function ensureCatalog(): Promise<void> {
  if (catalogReady) {
    return;
  }

  const size = await catalogSize();
  if (size.exercises >= SEED_EXERCISES.length && size.gyms >= SEED_GYMS.length) {
    catalogReady = true;
    return;
  }
  await ensureSeedExercises(SEED_EXERCISES);
  await ensureSeedGyms(
    SEED_GYMS.map((gym) => ({
      slug: gym.slug,
      name: gym.name,
      note: gym.note,
      exerciseSlugs: gymInventory(gym, SEED_EXERCISES),
    })),
  );
  catalogReady = true;
}

export async function gymCatalog(): Promise<Gym[]> {
  await ensureCatalog();
  return listGyms();
}

export function templatesFor(userId: number): Promise<WorkoutTemplate[]> {
  return listTemplates(userId);
}

export function templateFor(userId: number, id: number): Promise<WorkoutTemplate | null> {
  return findTemplate(userId, id);
}

/** Le catalogue tel que la salle de l'utilisateur le restreint. */
export async function exerciseCatalog(userId: number): Promise<Exercise[]> {
  await ensureCatalog();
  const preferences = await preferencesFor(userId);
  return listExercises(preferences.gymId);
}

/**
 * Tout le catalogue, salle ou non.
 *
 * Sert à nommer ce qui a été fait : une séance remplacée dans une autre salle
 * que celle choisie aujourd'hui doit garder le nom de son exercice.
 */
export async function fullExerciseCatalog(): Promise<Exercise[]> {
  await ensureCatalog();
  return listExercises(null);
}

export function removeTemplate(userId: number, id: number): Promise<boolean> {
  return archiveTemplate(userId, id);
}

export function sessionFor(userId: number, id: number): Promise<WorkoutSession | null> {
  return findSession(userId, id);
}

export function openSessionFor(userId: number): Promise<WorkoutSession | null> {
  return findOpenSession(userId);
}

export function sessionHistory(
  userId: number,
  limit: number = HISTORY_LIMIT,
): Promise<WorkoutSession[]> {
  return listSessions(userId, limit);
}

/** Les réponses de l'utilisateur, ou les valeurs de départ s'il n'a rien dit. */
export async function preferencesFor(userId: number): Promise<TrainingPreferences> {
  return (await findPreferences(userId)) ?? DEFAULT_PREFERENCES;
}

export type SavePreferencesResult =
  | { kind: 'saved'; preferences: TrainingPreferences }
  | { kind: 'invalid' }
  | { kind: 'not_found' };

/**
 * Enregistre les réponses.
 *
 * La salle est vérifiée en base et non crue sur parole : son identifiant vient
 * du client, et une salle inconnue produirait un catalogue vide, c'est-à-dire
 * un programme sans exercice et sans explication.
 */
export async function savePreferences(
  userId: number,
  preferences: TrainingPreferences,
): Promise<SavePreferencesResult> {
  if (
    !Number.isInteger(preferences.sessionsPerWeek) ||
    preferences.sessionsPerWeek < MIN_SESSIONS_PER_WEEK ||
    preferences.sessionsPerWeek > MAX_SESSIONS_PER_WEEK
  ) {
    return { kind: 'invalid' };
  }

  await ensureCatalog();

  if (preferences.gymId !== null) {
    const gyms = await listGyms();
    if (!gyms.some((gym) => gym.id === preferences.gymId)) {
      return { kind: 'not_found' };
    }
  }

  await upsertPreferences(userId, preferences);
  return { kind: 'saved', preferences };
}

export interface GenerateProgramReport {
  created: number;
  replaced: number;
  /** Groupes qu'aucun exercice de la salle ne couvrait, à dire à l'utilisateur. */
  missingGroups: string[];
}

/**
 * Compose le programme à partir des réponses, et remplace le précédent.
 *
 * Les séances existantes sont archivées et non supprimées : les séances déjà
 * réalisées les référencent, et les effacer ferait perdre le nom de ce qu'on a
 * fait pendant des mois. Régénérer est donc sans danger, ce qui est la
 * condition pour qu'on ose le faire en changeant de salle.
 */
export async function generateProgram(userId: number): Promise<GenerateProgramReport> {
  await ensureCatalog();

  const preferences = await preferencesFor(userId);
  const catalog = await listExercises(preferences.gymId);
  const program = buildProgram({
    focus: preferences.focus,
    equipment: preferences.equipment,
    sessionsPerWeek: preferences.sessionsPerWeek,
    catalog,
  });

  if (program.templates.length === 0) {
    return { created: 0, replaced: 0, missingGroups: program.missingGroups };
  }

  const replaced = await archiveAllTemplates(userId);

  for (const [index, template] of program.templates.entries()) {
    await insertTemplate(
      userId,
      { name: template.name, position: index, notes: template.notes },
      template.exercises.map((entry) => ({
        exerciseId: entry.exercise.id,
        targetSets: entry.targetSets,
        targetRepsMin: entry.targetRepsMin,
        targetRepsMax: entry.targetRepsMax,
        targetSeconds: entry.targetSeconds,
        supersetGroup: entry.supersetGroup,
        restSeconds: entry.restSeconds,
        notes: entry.notes,
      })),
    );
  }

  return {
    created: program.templates.length,
    replaced,
    missingGroups: program.missingGroups,
  };
}

export type StartSessionResult =
  | { kind: 'started'; id: number }
  | { kind: 'already_open'; id: number }
  | { kind: 'not_found' };

/**
 * Ouvre une séance.
 *
 * Une séance déjà ouverte est rendue telle quelle au lieu d'en ouvrir une
 * seconde. C'est le cas nominal, pas l'exception : on pose son téléphone entre
 * deux séries, l'application se recharge, et il faut retrouver la séance là où
 * on l'a laissée plutôt que d'en commencer une vide.
 */
export async function startSession(
  userId: number,
  templateId: number | null,
): Promise<StartSessionResult> {
  const open = await findOpenSession(userId);
  if (open !== null) {
    return { kind: 'already_open', id: open.id };
  }

  if (templateId !== null && (await findTemplate(userId, templateId)) === null) {
    return { kind: 'not_found' };
  }

  return { kind: 'started', id: await insertSession(userId, templateId, todayInParis()) };
}

export function endSession(userId: number, id: number): Promise<boolean> {
  return finishSession(userId, id);
}

export function discardSession(userId: number, id: number): Promise<boolean> {
  return deleteSession(userId, id);
}

export interface SetInput {
  sessionId: number;
  exerciseId: number;
  position: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  toFailure: boolean;
}

export type RecordSetResult = { kind: 'recorded' } | { kind: 'invalid' } | { kind: 'not_found' };

/** Les bornes communes à la saisie série par série et à l'import écrit. */
function isValidSet(set: {
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
}): boolean {
  if (!Number.isInteger(set.setIndex) || set.setIndex < 1 || set.setIndex > MAX_SETS) {
    return false;
  }
  if (set.weightKg !== null && !isValidWeight(set.weightKg)) {
    return false;
  }
  if (set.reps !== null && !isValidReps(set.reps)) {
    return false;
  }
  if (set.seconds !== null && !isValidSeconds(set.seconds)) {
    return false;
  }
  // Une série doit porter au moins une mesure. Une ligne entièrement vide
  // gonflerait le compte des séries faites sans rien dire de ce qui a été
  // fait, et fausserait la comparaison d'une semaine à l'autre.
  return set.reps !== null || set.seconds !== null;
}

/** Enregistre une série, ou corrige celle qui occupe ce rang. */
export async function recordSet(userId: number, input: SetInput): Promise<RecordSetResult> {
  if (!isValidSet(input)) {
    return { kind: 'invalid' };
  }
  const written = await upsertSet(userId, input);
  return written ? { kind: 'recorded' } : { kind: 'not_found' };
}

export function removeSet(userId: number, setId: number): Promise<boolean> {
  return deleteSet(userId, setId);
}

/**
 * Ce qui a été fait la dernière fois sur chaque exercice d'une séance.
 *
 * La séance en cours est exclue de la référence : sans quoi « la dernière
 * fois » désignerait la série qu'on vient de terminer, et l'écran cesserait de
 * dire quoi que ce soit d'utile.
 */
export function previousPerformance(
  userId: number,
  exerciseIds: readonly number[],
  currentSessionId: number | null,
): Promise<Map<number, WorkoutSet[]>> {
  return lastPerformance(userId, exerciseIds, currentSessionId);
}

/** Une ligne lue, avec l'exercice proposé et les autres candidats. */
/**
 * Un exercice proposé pour une ligne.
 *
 * Le slug et le matériel voyagent avec le nom pour que l'écran puisse ouvrir
 * la fiche illustrée sans un aller-retour de plus : c'est en confirmant un
 * rapprochement qu'on a le plus besoin de voir la photo, et une attente à ce
 * moment-là ferait valider sans regarder.
 */
export interface AnalysedCandidate {
  id: number;
  slug: string;
  name: string;
  muscleGroup: string | null;
  equipment: Exercise['equipment'];
  /** De 0 à 1. Une correspondance exacte, nom ou alias, vaut 1. */
  score: number;
}

export interface AnalysedLine extends ParsedExerciseLine {
  /** L'exercice retenu d'emblée, ou `null` si aucun n'est assez proche. */
  matchedExerciseId: number | null;
  candidates: AnalysedCandidate[];
}

function toCandidate(match: ExerciseMatch): AnalysedCandidate {
  return {
    id: match.exercise.id,
    slug: match.exercise.slug,
    name: match.exercise.name,
    muscleGroup: match.exercise.muscleGroup,
    equipment: match.exercise.equipment,
    score: Math.round(match.score * 100) / 100,
  };
}

/**
 * Lit une séance écrite et la rapproche du catalogue.
 *
 * Rien n'est écrit ici. L'analyse est rendue à l'écran pour confirmation,
 * parce qu'un nom mal rapproché — un rowing barre proposé pour un hip thrust —
 * se valide bien plus facilement qu'il ne se corrige après coup.
 *
 * Le rapprochement porte sur tout le catalogue et non sur la seule salle : on
 * recopie parfois une séance faite ailleurs, et refuser de la reconnaître
 * parce qu'on était en déplacement n'aiderait personne.
 */
export async function analyseWorkoutLog(
  userId: number,
  text: string,
): Promise<AnalysedLine[]> {
  await ensureCatalog();
  // L'utilisateur ne sert pas à filtrer le catalogue, qui est commun ; il est
  // reçu pour que la route reste alignée sur les autres, où l'oublier serait
  // une fuite. Le compilateur impose de le passer, c'est l'objectif.
  void userId;

  const catalog = await listExercises(null);
  return parseWorkoutLog(text).map((line) => {
    const best = bestExerciseMatch(line.name, catalog);
    return {
      ...line,
      matchedExerciseId: best === null ? null : best.exercise.id,
      candidates: rankExercises(line.name, catalog).map(toCandidate),
    };
  });
}

export interface WrittenLineInput {
  /** L'exercice retenu au catalogue, ou `null` pour en créer un sous ce nom. */
  exerciseId: number | null;
  name: string;
  sets: readonly {
    reps: number | null;
    seconds: number | null;
    weightKg: number | null;
    toFailure: boolean;
  }[];
}

export type SaveWrittenSessionResult =
  | { kind: 'saved'; id: number; sets: number }
  | { kind: 'invalid' }
  | { kind: 'empty' };

/**
 * Enregistre une séance recopiée après coup.
 *
 * Elle naît terminée : elle a eu lieu, elle n'est pas en cours. L'ouvrir
 * conduirait l'utilisateur vers l'écran d'exécution d'une séance qu'il vient
 * de finir, et se heurterait à la règle d'une seule séance ouverte s'il en
 * avait déjà une.
 *
 * Un exercice inconnu est créé sous le nom écrit plutôt que rejeté. La séance
 * a eu lieu ; refuser de l'enregistrer parce que le catalogue ignore une
 * machine reviendrait à perdre la donnée que le module existe pour retenir.
 */
export async function saveWrittenSession(
  userId: number,
  sessionDate: string,
  lines: readonly WrittenLineInput[],
): Promise<SaveWrittenSessionResult> {
  const usable = lines.filter((line) => line.sets.length > 0);
  if (usable.length === 0) {
    return { kind: 'empty' };
  }

  await ensureCatalog();
  const catalog = await listExercises(null);
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));

  const sets: {
    exerciseId: number;
    position: number;
    setIndex: number;
    weightKg: number | null;
    reps: number | null;
    seconds: number | null;
    toFailure: boolean;
  }[] = [];

  for (const [position, line] of usable.entries()) {
    let exercise: Exercise | undefined =
      line.exerciseId === null ? undefined : byId.get(line.exerciseId);

    if (exercise === undefined) {
      const name = line.name.trim().slice(0, 80);
      if (name === '') {
        return { kind: 'invalid' };
      }
      // Créé sans groupe musculaire ni rang : le module ne sait pas ce que
      // travaille une machine dont il apprend le nom, et l'inventer le ferait
      // apparaître dans un programme généré sous une étiquette fausse.
      exercise = await findOrCreateExercise({
        slug: slugFromName(name),
        name,
        kind: line.sets.some((set) => set.seconds !== null) ? 'hold' : 'strength',
        muscleGroup: null,
        region: 'full',
        equipment: 'machine',
      });
    }

    for (const [index, set] of line.sets.entries()) {
      const candidate = {
        exerciseId: exercise.id,
        position,
        setIndex: index + 1,
        weightKg: set.weightKg,
        reps: set.reps,
        seconds: set.seconds,
        toFailure: set.toFailure,
      };
      if (!isValidSet(candidate)) {
        return { kind: 'invalid' };
      }
      sets.push(candidate);
    }
  }

  const id = await insertCompletedSession(userId, sessionDate, sets);
  return { kind: 'saved', id, sets: sets.length };
}

/** Fenêtre de la vue d'ensemble : un trimestre, assez pour voir une tendance. */
export const PROGRESS_WEEKS = 12;

export interface ProgressOverview {
  weeks: WeekPoint[];
  exercises: ExerciseProgress[];
}

/**
 * La progression des douze dernières semaines : le tonnage semaine par
 * semaine, et chaque exercice travaillé avec son évolution sur la période.
 *
 * La fenêtre commence un lundi, pour que la première semaine du graphique
 * soit complète et ne se lise pas comme une semaine creuse.
 */
export async function progressOverview(userId: number): Promise<ProgressOverview> {
  const today = todayInParis();
  const sinceDate = shiftDate(startOfWeek(today), -7 * (PROGRESS_WEEKS - 1));
  const { exercises, sets } = await progressSets(userId, { sinceDate });
  return {
    weeks: weeklyTotals(sets, PROGRESS_WEEKS, today),
    exercises: progressByExercise(exercises, sets),
  };
}

/**
 * Toute l'histoire d'un exercice, sans fenêtre : un record d'il y a six mois
 * reste le record, et la courbe entière dit si l'on est revenu à son niveau.
 */
export async function exerciseProgressFor(
  userId: number,
  exerciseId: number,
): Promise<ExerciseProgress | null> {
  const { exercises, sets } = await progressSets(userId, { exerciseId });
  const exercise = exercises[0];
  return exercise === undefined ? null : exerciseProgress(exercise, sets);
}
