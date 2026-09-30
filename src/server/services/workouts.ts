import 'server-only';
import { shiftDate, startOfWeek, todayInParis } from '@/lib/date';
import {
  composedFromSets,
  composedToPrescription,
  defaultComposed,
  DEFAULT_PREFERENCES,
  habitualSwaps,
  MAX_TEMPLATE_EXERCISES,
  MAX_TEMPLATE_NAME,
  type ComposedExercise,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
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
  personalBest,
  type PersonalBest,
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
  appendTemplateExercise,
  archiveAllTemplates,
  archiveTemplate,
  favoritedSessionIds,
  listFavoriteExerciseIds,
  setFavoriteExercise,
  setTemplateFavorite,
  type NewTemplateExercise,
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
  historySets,
  recentTemplateSessionSets,
  updateTemplateExercise,
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
export async function progressOverview(
  userId: number,
  weekCount: number = PROGRESS_WEEKS,
): Promise<ProgressOverview> {
  const today = todayInParis();
  const sinceDate = shiftDate(startOfWeek(today), -7 * (weekCount - 1));
  const { exercises, sets } = await progressSets(userId, { sinceDate });
  return {
    weeks: weeklyTotals(sets, weekCount, today),
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

/**
 * Le record de chaque exercice avant la séance en cours.
 *
 * La séance en cours est exclue pour la même raison que la dernière
 * performance : sinon la série qu'on vient de faire serait son propre record,
 * et la suivante n'en battrait jamais aucun.
 */
export async function personalBests(
  userId: number,
  exercises: readonly Exercise[],
  currentSessionId: number | null,
): Promise<Map<number, PersonalBest | null>> {
  const history = await historySets(
    userId,
    exercises.map((exercise) => exercise.id),
    currentSessionId,
  );
  return new Map(
    exercises.map((exercise) => [
      exercise.id,
      personalBest(exercise.kind, history.get(exercise.id) ?? []),
    ]),
  );
}

/** Nombre de séances regardées pour reconnaître un remplacement habituel. */
const HABIT_SESSIONS = 2;

/**
 * Les remplacements que l'utilisateur a faits aux deux dernières séances de
 * ce modèle, rang par rang (voir `habitualSwaps`).
 */
export async function habitualSwapsFor(
  userId: number,
  template: WorkoutTemplate,
  currentSessionId: number,
): Promise<Map<number, number>> {
  const recent = await recentTemplateSessionSets(
    userId,
    template.id,
    currentSessionId,
    HABIT_SESSIONS,
  );
  return habitualSwaps(template.exercises, recent);
}

export type EditTemplateExerciseResult = { kind: 'saved' } | { kind: 'invalid' } | { kind: 'not_found' };

/**
 * Modifie un exercice du programme : le remplacer pour de bon, ou régler son
 * repos.
 *
 * L'exercice de remplacement est vérifié au catalogue : son identifiant vient
 * du client, et une référence inconnue ferait échouer l'écriture sur la clé
 * étrangère avec une erreur serveur au lieu d'un refus lisible.
 */
export async function editTemplateExercise(
  userId: number,
  entryId: number,
  patch: { exerciseId?: number; restSeconds?: number | null },
): Promise<EditTemplateExerciseResult> {
  if (patch.exerciseId === undefined && patch.restSeconds === undefined) {
    return { kind: 'invalid' };
  }
  if (
    patch.restSeconds !== undefined &&
    patch.restSeconds !== null &&
    (!Number.isInteger(patch.restSeconds) ||
      patch.restSeconds < MIN_REST_SECONDS ||
      patch.restSeconds > MAX_REST_SECONDS)
  ) {
    return { kind: 'invalid' };
  }
  if (patch.exerciseId !== undefined) {
    await ensureCatalog();
    const catalog = await listExercises(null);
    if (!catalog.some((exercise) => exercise.id === patch.exerciseId)) {
      return { kind: 'not_found' };
    }
  }

  return (await updateTemplateExercise(userId, entryId, patch))
    ? { kind: 'saved' }
    : { kind: 'not_found' };
}

/** Nom donné à une séance composée qu'on n'a pas nommée. */
const DEFAULT_COMPOSED_NAME = 'Ma séance';

/** Nom d'une séance ouverte sans rien prévoir. */
export const FREE_SESSION_NAME = 'Séance libre';

function cleanName(raw: string | null, fallback: string): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_TEMPLATE_NAME);
  return trimmed === '' ? fallback : trimmed;
}

/** Vrai si la cible d'un exercice composé tient dans les bornes d'une série. */
function isValidComposed(entry: ComposedExercise, kind: Exercise['kind']): boolean {
  if (!Number.isInteger(entry.sets) || entry.sets < 1 || entry.sets > MAX_SETS) {
    return false;
  }
  if (kind === 'strength') {
    return entry.reps !== null && Number.isInteger(entry.reps) && isValidReps(entry.reps);
  }
  return (
    entry.seconds !== null && Number.isInteger(entry.seconds) && isValidSeconds(entry.seconds)
  );
}

/** Les lignes de modèle d'une suite d'exercices composés, ceux du catalogue seulement. */
function prescribe(
  entries: readonly ComposedExercise[],
  catalog: ReadonlyMap<number, Exercise>,
): NewTemplateExercise[] {
  return entries.flatMap((entry) => {
    const exercise = catalog.get(entry.exerciseId);
    return exercise === undefined
      ? []
      : [
          {
            exerciseId: exercise.id,
            ...composedToPrescription(entry, exercise.kind),
            supersetGroup: null,
            restSeconds: null,
            notes: null,
          },
        ];
  });
}

async function catalogById(): Promise<Map<number, Exercise>> {
  return new Map((await fullExerciseCatalog()).map((exercise) => [exercise.id, exercise]));
}

export type ComposeTemplateResult = { kind: 'saved'; templateId: number } | { kind: 'invalid' };

/**
 * Écrit une séance composée en touchant des exercices.
 *
 * `keep` la range dans les favoris ; sans lui, elle n'existe que pour être
 * lancée tout de suite, et reste hors des listes. Les exercices sont vérifiés
 * au catalogue entier et non à celui de la salle : on compose aussi pour une
 * salle de vacances.
 */
export async function composeTemplate(
  userId: number,
  input: { name: string | null; exercises: readonly ComposedExercise[]; keep: boolean },
): Promise<ComposeTemplateResult> {
  if (input.exercises.length === 0 || input.exercises.length > MAX_TEMPLATE_EXERCISES) {
    return { kind: 'invalid' };
  }
  const ids = input.exercises.map((entry) => entry.exerciseId);
  if (new Set(ids).size !== ids.length) {
    return { kind: 'invalid' };
  }

  const catalog = await catalogById();
  for (const entry of input.exercises) {
    const exercise = catalog.get(entry.exerciseId);
    if (exercise === undefined || !isValidComposed(entry, exercise.kind)) {
      return { kind: 'invalid' };
    }
  }

  const templateId = await insertTemplate(
    userId,
    {
      name: cleanName(input.name, DEFAULT_COMPOSED_NAME),
      position: 0,
      notes: null,
      kind: input.keep ? 'custom' : 'adhoc',
      favorite: input.keep,
    },
    prescribe(input.exercises, catalog),
  );
  return { kind: 'saved', templateId };
}

/**
 * Ouvre une séance sans rien de prévu, à remplir exercice par exercice.
 *
 * Elle repose sur un modèle improvisé et vide plutôt que sur une séance sans
 * modèle : l'écran d'exécution lit ses exercices dans un modèle, et c'est lui
 * qui retient ce qu'on ajoute avant la première série, quand l'application se
 * recharge entre deux appareils.
 */
export async function startFreeSession(userId: number): Promise<StartSessionResult> {
  const open = await findOpenSession(userId);
  if (open !== null) {
    return { kind: 'already_open', id: open.id };
  }
  const templateId = await insertTemplate(
    userId,
    { name: FREE_SESSION_NAME, position: 0, notes: null, kind: 'adhoc' },
    [],
  );
  return startSession(userId, templateId);
}

export type AddSessionExerciseResult =
  | { kind: 'added' }
  | { kind: 'not_found' }
  | { kind: 'invalid' };

/**
 * Ajoute un exercice à une séance libre en cours.
 *
 * Réservé aux séances improvisées : ajouter à une séance du programme ou des
 * favoris la modifierait pour les fois suivantes, ce qu'un geste fait en
 * salle, entre deux séries, ne doit pas décider en passant.
 */
export async function addExerciseToSession(
  userId: number,
  sessionId: number,
  exerciseId: number,
): Promise<AddSessionExerciseResult> {
  const session = await findSession(userId, sessionId);
  if (session === null || session.finishedAt !== null || session.templateId === null) {
    return { kind: 'not_found' };
  }
  const template = await findTemplate(userId, session.templateId);
  if (
    template === null ||
    template.kind !== 'adhoc' ||
    template.exercises.length >= MAX_TEMPLATE_EXERCISES ||
    template.exercises.some((entry) => entry.exercise.id === exerciseId)
  ) {
    return { kind: 'invalid' };
  }

  const exercise = (await catalogById()).get(exerciseId);
  if (exercise === undefined) {
    return { kind: 'not_found' };
  }

  const added = await appendTemplateExercise(userId, template.id, {
    exerciseId: exercise.id,
    ...composedToPrescription(defaultComposed(exercise), exercise.kind),
    supersetGroup: null,
    restSeconds: null,
    notes: null,
  });
  return added === null ? { kind: 'not_found' } : { kind: 'added' };
}

/** Met une séance modèle en favori, ou l'en sort. */
export function favoriteTemplate(
  userId: number,
  templateId: number,
  favorite: boolean,
  name: string | null,
): Promise<boolean> {
  return setTemplateFavorite(
    userId,
    templateId,
    favorite,
    name === null ? null : cleanName(name, DEFAULT_COMPOSED_NAME),
  );
}

export type FavoriteSessionResult =
  | { kind: 'saved'; templateId: number }
  | { kind: 'already' }
  | { kind: 'empty' }
  | { kind: 'not_found' };

/**
 * Retient une séance faite comme séance à refaire.
 *
 * C'est une copie de ce qui a été fait, remplacements compris, et non un
 * lien vers son modèle : la séance qu'on a aimée est celle qu'on a vécue, pas
 * celle que le programme prévoyait.
 */
export async function favoriteSession(
  userId: number,
  sessionId: number,
  name: string | null,
): Promise<FavoriteSessionResult> {
  const session = await findSession(userId, sessionId);
  if (session === null) {
    return { kind: 'not_found' };
  }
  if (await isSessionFavorited(userId, sessionId)) {
    return { kind: 'already' };
  }

  const rows = prescribe(composedFromSets(session.sets), await catalogById());
  if (rows.length === 0) {
    return { kind: 'empty' };
  }

  const templateId = await insertTemplate(
    userId,
    {
      name: cleanName(name ?? session.templateName, DEFAULT_COMPOSED_NAME),
      position: 0,
      notes: null,
      kind: 'custom',
      favorite: true,
      sourceSessionId: session.id,
    },
    rows,
  );
  return { kind: 'saved', templateId };
}

/** Vrai si cette séance faite est déjà rangée dans les favoris. */
export async function isSessionFavorited(userId: number, sessionId: number): Promise<boolean> {
  return (await favoritedSessionIds(userId, [sessionId])).has(sessionId);
}

export function favoriteExerciseIdsFor(userId: number): Promise<number[]> {
  return listFavoriteExerciseIds(userId);
}

/** Met un exercice du catalogue en favori, ou l'en retire. */
export async function favoriteExercise(
  userId: number,
  exerciseId: number,
  favorite: boolean,
): Promise<boolean> {
  if (!(await catalogById()).has(exerciseId)) {
    return false;
  }
  await setFavoriteExercise(userId, exerciseId, favorite);
  return true;
}
