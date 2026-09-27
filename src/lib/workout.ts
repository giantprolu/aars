/**
 * Séances : types partagés et mise en forme. Fonctions pures (AD-8).
 *
 * Ce module ne calcule presque rien, et c'est voulu. La musculation ne demande
 * pas d'arithmétique, elle demande de la mémoire : savoir ce qu'on a soulevé
 * la dernière fois, et si on a fait mieux. Le seul chiffre dérivé qu'on
 * s'autorise est le volume, parce qu'il résume une séance en un nombre
 * comparable d'une semaine à l'autre.
 */

/** Ce qu'une série enregistre, selon la nature de l'exercice. */
export type ExerciseKind = 'strength' | 'hold' | 'cardio';

export function isExerciseKind(value: unknown): value is ExerciseKind {
  return value === 'strength' || value === 'hold' || value === 'cardio';
}

/**
 * Le matériel qu'un exercice demande.
 *
 * C'est cette colonne qui décide si un exercice est faisable là où l'on
 * s'entraîne, et non le groupe musculaire. Deux personnes qui veulent des
 * pectoraux n'ont pas le même exercice selon qu'elles ont une barre, une
 * poulie ou seulement une presse assise.
 *
 * `free` couvre barre et haltères ensemble : la distinction existe en salle,
 * mais elle ne change ni la disponibilité ni le choix qu'on fait entre poids
 * libre et machine guidée, qui est la seule question posée.
 */
export type ExerciseEquipment = 'free' | 'machine' | 'cable' | 'bodyweight' | 'cardio';

export function isExerciseEquipment(value: unknown): value is ExerciseEquipment {
  return (
    value === 'free' ||
    value === 'machine' ||
    value === 'cable' ||
    value === 'bodyweight' ||
    value === 'cardio'
  );
}

/**
 * La moitié du corps que l'exercice travaille.
 *
 * Le groupe musculaire ne suffit pas à répondre à « je veux du haut et un
 * minimum de bas » : il faudrait pour cela connaître par cœur de quel côté
 * tombent les mollets et les lombaires. La colonne le dit.
 */
export type ExerciseRegion = 'upper' | 'lower' | 'core' | 'full';

export function isExerciseRegion(value: unknown): value is ExerciseRegion {
  return value === 'upper' || value === 'lower' || value === 'core' || value === 'full';
}

export interface Exercise {
  id: number;
  slug: string;
  name: string;
  kind: ExerciseKind;
  muscleGroup: string | null;
  region: ExerciseRegion;
  equipment: ExerciseEquipment;
  /**
   * Rang de choix dans son groupe musculaire : 1 désigne l'exercice de base.
   *
   * `null` pour un exercice créé à la main depuis un import de séance. C'est
   * ce qui l'exclut de la génération de programme : une ligne saisie au
   * clavier un soir n'a pas à se retrouver prescrite la semaine suivante.
   */
  rank: number | null;
  /** Autres noms sous lesquels on l'écrit, pour retrouver une séance saisie. */
  aliases: readonly string[];
}

/** Ce que l'utilisateur veut travailler, et ce qu'il accepte de ne pas perdre. */
export type TrainingFocus = 'upper' | 'lower' | 'full';

export function isTrainingFocus(value: unknown): value is TrainingFocus {
  return value === 'upper' || value === 'lower' || value === 'full';
}

/** Poids libre, machine guidée, ou indifférent. */
export type EquipmentPreference = 'free' | 'machine' | 'any';

export function isEquipmentPreference(value: unknown): value is EquipmentPreference {
  return value === 'free' || value === 'machine' || value === 'any';
}

/** Une salle, avec le matériel qu'on y trouve. */
export interface Gym {
  id: number;
  slug: string;
  name: string;
  note: string | null;
}

/** Ce que l'utilisateur a répondu sur sa salle et ses envies. */
export interface TrainingPreferences {
  gymId: number | null;
  focus: TrainingFocus;
  equipment: EquipmentPreference;
  sessionsPerWeek: number;
}

export const DEFAULT_PREFERENCES: TrainingPreferences = {
  gymId: null,
  focus: 'full',
  equipment: 'any',
  sessionsPerWeek: 3,
};

export const MIN_SESSIONS_PER_WEEK = 2;
export const MAX_SESSIONS_PER_WEEK = 6;

export const FOCUS_LABELS: Record<TrainingFocus, string> = {
  upper: 'Haut du corps, avec un minimum de bas',
  lower: 'Bas du corps, avec un minimum de haut',
  full: 'Les deux à parts égales',
};

/** Le matériel d'un exercice, tel qu'on le nomme en salle. */
export const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  free: 'Barre ou haltères',
  machine: 'Machine guidée',
  cable: 'Poulie',
  bodyweight: 'Poids du corps',
  cardio: 'Cardio',
};

export const EQUIPMENT_PREFERENCE_LABELS: Record<EquipmentPreference, string> = {
  free: 'Poids libres',
  machine: 'Machines guidées',
  any: 'Indifférent',
};

/** Un exercice prescrit dans une séance modèle. */
export interface TemplateExercise {
  id: number;
  position: number;
  exercise: Exercise;
  targetSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
  /** Numéro de superset : deux exercices qui le partagent s'enchaînent. */
  supersetGroup: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface WorkoutTemplate {
  id: number;
  name: string;
  position: number;
  notes: string | null;
  exercises: TemplateExercise[];
}

/** Une série réalisée. Les trois mesures sont optionnelles (voir le schéma). */
export interface WorkoutSet {
  id: number;
  exerciseId: number;
  position: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  /**
   * La série est allée jusqu'à l'échec musculaire.
   *
   * On l'écrit parce qu'elle change la lecture de la suivante : « 6 reps » et
   * « 6 reps à l'échec » ne disent pas la même chose de la charge à mettre la
   * semaine prochaine. C'est la notation qu'on porte déjà sur un carnet.
   */
  toFailure: boolean;
  doneAt: Date;
}

export interface WorkoutSession {
  id: number;
  templateId: number | null;
  templateName: string | null;
  sessionDate: string;
  startedAt: Date;
  finishedAt: Date | null;
  sets: WorkoutSet[];
}

/** Bornes de garde-fou, partagées par la saisie et la validation serveur. */
export const MAX_WEIGHT_KG = 500;
export const MAX_REPS = 200;
export const MAX_SECONDS = 7200;
export const MAX_SETS = 20;

export function isValidWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_WEIGHT_KG;
}

export function isValidReps(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_REPS;
}

export function isValidSeconds(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_SECONDS;
}

/**
 * La prescription, écrite comme un programme l'écrit : « 4×8-10 », « 3×45 s ».
 *
 * La fourchette est conservée telle quelle plutôt que réduite à sa borne
 * basse. C'est elle qui porte la consigne de progression : on vise le haut de
 * la fourchette, et quand on l'atteint sur toutes les séries, on monte la
 * charge. L'aplatir à un nombre perdrait ce que le programme veut dire.
 */
export function formatPrescription(exercise: TemplateExercise): string {
  if (exercise.targetSeconds !== null) {
    const duration =
      exercise.targetSeconds >= 60
        ? `${Math.round(exercise.targetSeconds / 60)} min`
        : `${exercise.targetSeconds} s`;
    // Un cardio n'a pas de séries : « 1×20 min » se lirait comme une erreur.
    return exercise.exercise.kind === 'cardio'
      ? duration
      : `${exercise.targetSets}×${duration}`;
  }

  const { targetRepsMin: min, targetRepsMax: max } = exercise;
  if (min === null && max === null) {
    return `${exercise.targetSets} séries`;
  }
  const reps = min === null ? `${max}` : max === null || max === min ? `${min}` : `${min}-${max}`;
  return `${exercise.targetSets}×${reps}`;
}

/** Ce qu'une série réalisée affiche : « 60 kg × 10 », « 45 s », « 12 reps ». */
export function formatSet(set: {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  toFailure?: boolean;
}): string {
  const failure = set.toFailure === true ? ' (échec)' : '';
  if (set.seconds !== null) {
    const duration =
      set.seconds >= 60 ? `${Math.round(set.seconds / 60)} min` : `${set.seconds} s`;
    return `${duration}${failure}`;
  }
  if (set.reps === null) {
    return '—';
  }
  if (set.weightKg === null || set.weightKg === 0) {
    return `${set.reps} reps${failure}`;
  }
  return `${set.weightKg.toLocaleString('fr-FR')} kg × ${set.reps}${failure}`;
}

/**
 * Le volume d'une série : charge multipliée par répétitions, en kilogrammes.
 *
 * Le tonnage soulevé, mesure grossière mais comparable. Elle ne vaut rien sur
 * une séance isolée — deux exercices différents n'ont pas le même coût par
 * kilo — mais elle répond à la seule question qu'on se pose d'une semaine sur
 * l'autre : est-ce que j'en fais plus qu'avant, sur la même séance ?
 *
 * Une série au poids du corps compte pour zéro. C'est faux physiologiquement
 * et honnête arithmétiquement : on ne connaît pas le poids du corps au moment
 * de la série, et l'inventer fausserait la comparaison plus sûrement que de
 * l'omettre.
 */
export function setVolume(set: { weightKg: number | null; reps: number | null }): number {
  if (set.weightKg === null || set.reps === null) {
    return 0;
  }
  return set.weightKg * set.reps;
}

export function sessionVolume(sets: readonly { weightKg: number | null; reps: number | null }[]): number {
  return Math.round(sets.reduce((total, set) => total + setVolume(set), 0));
}

/**
 * La meilleure série d'une liste, au sens de la charge puis des répétitions.
 *
 * Sert à afficher « 60 × 9 la dernière fois » sous une série à venir. La
 * charge prime sur les répétitions : monter de 60 à 62,5 kg pour une
 * répétition de moins est une progression, l'inverse ne l'est pas.
 */
export function bestSet<T extends { weightKg: number | null; reps: number | null }>(
  sets: readonly T[],
): T | null {
  let best: T | null = null;
  for (const set of sets) {
    if (set.weightKg === null && set.reps === null) {
      continue;
    }
    if (best === null) {
      best = set;
      continue;
    }
    const weight = set.weightKg ?? 0;
    const bestWeight = best.weightKg ?? 0;
    if (weight > bestWeight || (weight === bestWeight && (set.reps ?? 0) > (best.reps ?? 0))) {
      best = set;
    }
  }
  return best;
}

/**
 * Regroupe les exercices d'une séance par superset.
 *
 * Deux exercices qui partagent un numéro s'enchaînent sans repos et se lisent
 * ensemble. Ceux qui n'en portent pas forment chacun leur propre groupe : le
 * résultat est une liste de blocs, qu'ils comptent un exercice ou deux.
 */
export function groupBySuperset(exercises: readonly TemplateExercise[]): TemplateExercise[][] {
  const blocks: TemplateExercise[][] = [];
  const byGroup = new Map<number, TemplateExercise[]>();

  for (const exercise of exercises) {
    if (exercise.supersetGroup === null) {
      blocks.push([exercise]);
      continue;
    }
    const existing = byGroup.get(exercise.supersetGroup);
    if (existing === undefined) {
      const block = [exercise];
      byGroup.set(exercise.supersetGroup, block);
      blocks.push(block);
      continue;
    }
    existing.push(exercise);
  }

  return blocks;
}

/**
 * Repos proposé entre deux séries quand le programme n'en fixe pas.
 *
 * Une minute et demie : assez pour qu'une série lourde ne s'effondre pas à la
 * suivante, assez court pour que la séance tienne dans l'heure. Le chrono se
 * rallonge d'un appui ; une valeur par défaut n'a pas à être juste, elle a à
 * être raisonnable.
 */
export const DEFAULT_REST_SECONDS = 90;

/** Une durée au format d'un chronomètre : « 1:05 », « 1:02:07 ». */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * Un exercice tel qu'il se fait dans la séance, et non tel qu'il est prescrit.
 *
 * `planned` porte l'exercice du programme quand un autre l'a remplacé ; il vaut
 * `null` sinon. `locked` dit que le rang a déjà des séries : son exercice ne
 * se change plus, puisque ces séries ont été faites sur cet appareil-là.
 */
export interface SessionExercise extends TemplateExercise {
  planned: Exercise | null;
  locked: boolean;
}

/**
 * Applique les remplacements d'exercices à une séance modèle.
 *
 * Les séries enregistrées font foi : elles portent l'exercice réellement fait
 * et le rang qu'il occupait dans la séance. Un rang dont les séries nomment un
 * autre exercice que le programme a donc été remplacé, sans qu'aucune table ne
 * le retienne — la série est la trace, et on ne recopie pas une trace.
 *
 * Avant la première série, le remplacement n'est qu'une intention (`swaps`,
 * rang vers exercice). Elle est ignorée si l'exercice visé occupe déjà un
 * autre rang de la séance : deux rangs sur le même exercice écriraient leurs
 * séries au même endroit.
 */
export function resolveSessionExercises(
  planned: readonly TemplateExercise[],
  sets: readonly Pick<WorkoutSet, 'exerciseId' | 'position' | 'setIndex'>[],
  swaps: ReadonlyMap<number, number>,
  catalog: ReadonlyMap<number, Exercise>,
): SessionExercise[] {
  const recordedAt = new Map<number, number>();
  for (const set of [...sets].sort((a, b) => a.setIndex - b.setIndex)) {
    if (!recordedAt.has(set.position)) {
      recordedAt.set(set.position, set.exerciseId);
    }
  }

  const resolved = planned.map((entry): SessionExercise => {
    const recordedId = recordedAt.get(entry.position);
    if (recordedId !== undefined && recordedId !== entry.exercise.id) {
      const exercise = catalog.get(recordedId);
      if (exercise !== undefined) {
        return { ...entry, exercise, planned: entry.exercise, locked: true };
      }
    }
    return { ...entry, planned: null, locked: recordedId !== undefined };
  });

  const used = new Set(resolved.map((entry) => entry.exercise.id));
  return resolved.map((entry) => {
    const wanted = swaps.get(entry.position);
    if (
      entry.locked ||
      wanted === undefined ||
      wanted === KEEP_PLANNED ||
      wanted === entry.exercise.id ||
      used.has(wanted)
    ) {
      return entry;
    }
    const exercise = catalog.get(wanted);
    if (exercise === undefined) {
      return entry;
    }
    used.delete(entry.exercise.id);
    used.add(wanted);
    return { ...entry, exercise, planned: entry.exercise };
  });
}

/** Dans un remplacement, « garder l'exercice prévu ». */
export const KEEP_PLANNED = 0;

/**
 * Lit les remplacements écrits dans l'adresse : `rang:exercice`, répétés.
 * `rang:0` demande de garder l'exercice prévu (`KEEP_PLANNED`), ce qui
 * l'emporte sur un remplacement retenu des séances précédentes.
 *
 * L'adresse et non la base, parce qu'un remplacement sans série n'est qu'une
 * intention : il suffit qu'il survive au rechargement de l'écran. Dès la
 * première série, c'est elle qui le porte (voir `resolveSessionExercises`).
 */
export function parseSwaps(raw: string | readonly string[] | undefined): Map<number, number> {
  const swaps = new Map<number, number>();
  const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  for (const value of values) {
    const match = /^(\d{1,3}):(\d{1,12})$/.exec(value);
    if (match === null) {
      continue;
    }
    swaps.set(Number(match[1]), Number(match[2]));
  }
  return swaps;
}

/**
 * Les exercices qui peuvent en remplacer un autre, du plus proche au plus loin.
 *
 * Même nature d'abord : une planche ne remplace pas un développé, l'écran
 * demanderait une durée là où le programme prescrit des répétitions. Puis le
 * même groupe musculaire, puis la même moitié du corps, puis le reste — on
 * remplace un pec deck occupé par un autre travail des mêmes muscles quand on
 * le peut, et par ce qui est libre quand on ne le peut pas.
 */
export function swapCandidates(
  target: Exercise,
  catalog: readonly Exercise[],
  excluded: ReadonlySet<number>,
): { closest: Exercise[]; others: Exercise[] } {
  const usable = catalog.filter(
    (exercise) =>
      exercise.kind === target.kind && exercise.id !== target.id && !excluded.has(exercise.id),
  );
  const sameGroup = (exercise: Exercise) =>
    target.muscleGroup !== null && exercise.muscleGroup === target.muscleGroup;
  const closest = usable
    .filter(sameGroup)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name, 'fr'));
  const others = usable
    .filter((exercise) => !sameGroup(exercise))
    .sort(
      (a, b) =>
        Number(b.region === target.region) - Number(a.region === target.region) ||
        a.name.localeCompare(b.name, 'fr'),
    );
  return { closest, others };
}

/** Bornes d'un repos réglé à la main, en secondes. */
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;

/** Les durées proposées au réglage du repos, de la plus courte à la plus longue. */
export const REST_CHOICES = [45, 60, 75, 90, 120, 150, 180, 240] as const;

/**
 * Le repos après une série de cet exercice.
 *
 * Celui du programme s'il en fixe un. Sinon, il se déduit de la prescription,
 * parce que c'est elle qui dit la nature de l'effort : une série de huit
 * lourde vide ce que trois minutes rechargent à peine, une série de quinze en
 * isolation se reprend en une minute. Le cardio n'a pas de repos, il n'a
 * qu'une série.
 */
export function restSecondsFor(entry: TemplateExercise): number | null {
  if (entry.restSeconds !== null) {
    return entry.restSeconds;
  }
  if (entry.exercise.kind === 'cardio') {
    return null;
  }
  if (entry.exercise.kind === 'hold') {
    return 60;
  }
  const top = entry.targetRepsMax ?? entry.targetRepsMin;
  if (top === null) {
    return DEFAULT_REST_SECONDS;
  }
  if (top <= 10) {
    return 150;
  }
  return top <= 12 ? 120 : 75;
}

/**
 * Ce que l'écran propose pour la séance du jour, avec la raison en clair.
 *
 * Les valeurs préremplissent les cases, la raison s'affiche sous l'exercice :
 * une charge qui change sans explication se refuse, une charge expliquée se
 * valide.
 */
export interface LoadSuggestion {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  /** Le sens de la proposition, pour l'accent visuel. */
  trend: 'up' | 'same' | 'down';
  reason: string;
}

/** L'écart de charge d'une marche : un kilo sous vingt kilos, deux et demi au-dessus. */
function loadStep(weightKg: number): number {
  return weightKg < 20 ? 1 : 2.5;
}

function roundLoad(weightKg: number, step: number): number {
  return Math.round(weightKg / step) * step;
}

function kg(value: number): string {
  return `${value.toLocaleString('fr-FR')} kg`;
}

/**
 * La double progression : d'abord les répétitions, ensuite la charge.
 *
 * Tant que toutes les séries n'atteignent pas le haut de la fourchette, on
 * garde la charge et on vise une répétition de plus. Quand elles l'atteignent
 * toutes, on monte d'une marche et l'on repart du bas de la fourchette. Si
 * aucune n'a atteint le bas, la charge était trop lourde : on redescend
 * d'environ dix pour cent plutôt que de rater encore.
 *
 * C'est la règle que le programme sous-entend en écrivant « 4×8-10 » ; elle
 * n'avait jusqu'ici que la mémoire de l'utilisateur pour s'appliquer.
 */
export function suggestLoad(
  entry: TemplateExercise,
  previous: readonly Pick<WorkoutSet, 'weightKg' | 'reps' | 'seconds'>[],
): LoadSuggestion | null {
  if (previous.length === 0 || entry.exercise.kind === 'cardio') {
    return null;
  }

  if (entry.exercise.kind === 'hold') {
    const target = entry.targetSeconds;
    const held = previous.map((set) => set.seconds ?? 0);
    if (target === null || held.every((seconds) => seconds === 0)) {
      return null;
    }
    const weakest = Math.min(...held);
    if (held.length >= entry.targetSets && weakest >= target) {
      const seconds = Math.max(...held) + 5;
      return {
        weightKg: null,
        reps: null,
        seconds,
        trend: 'up',
        reason: `Toutes tenues ${target} s la dernière fois : vise ${seconds} s.`,
      };
    }
    return {
      weightKg: null,
      reps: null,
      seconds: target,
      trend: 'same',
      reason: `Vise ${target} s sur chaque série.`,
    };
  }

  const top = entry.targetRepsMax ?? entry.targetRepsMin;
  const bottom = entry.targetRepsMin ?? top;
  const done = previous.filter((set) => set.reps !== null && set.reps > 0);
  if (top === null || bottom === null || done.length === 0) {
    return null;
  }

  const working = Math.max(...done.map((set) => set.weightKg ?? 0));
  const atWorking = done.filter((set) => (set.weightKg ?? 0) === working);
  const reps = atWorking.map((set) => set.reps ?? 0);
  const weakest = Math.min(...reps);
  const complete = done.length >= entry.targetSets;

  // Au poids du corps, la charge n'existe pas : la progression passe par les
  // répétitions, puis par le lest, que l'écran ne peut que suggérer.
  if (working === 0) {
    if (complete && weakest >= top) {
      return {
        weightKg: null,
        reps: top,
        seconds: null,
        trend: 'up',
        reason: `Toutes les séries à ${top} : ajoute du lest ou ralentis la descente.`,
      };
    }
    const aim = Math.min(top, weakest + 1);
    return {
      weightKg: null,
      reps: aim,
      seconds: null,
      trend: 'same',
      reason: `Vise ${aim} répétitions sur chaque série.`,
    };
  }

  if (complete && weakest >= top) {
    const step = loadStep(working);
    const next = roundLoad(working + step, step);
    return {
      weightKg: next,
      reps: bottom,
      seconds: null,
      trend: 'up',
      reason: `Toutes les séries à ${top} à ${kg(working)} : monte à ${kg(next)}.`,
    };
  }

  if (Math.max(...reps) < bottom) {
    const step = loadStep(working);
    const next = Math.max(step, roundLoad(working * 0.9, step));
    return {
      weightKg: next,
      reps: bottom,
      seconds: null,
      trend: 'down',
      reason: `Aucune série à ${bottom} la dernière fois : redescends à ${kg(next)}.`,
    };
  }

  const aim = Math.min(top, weakest + 1);
  return {
    weightKg: working,
    reps: aim,
    seconds: null,
    trend: 'same',
    reason: `Garde ${kg(working)} et vise ${aim} répétitions sur chaque série.`,
  };
}

/**
 * Les remplacements devenus des habitudes : le même exercice mis à la place
 * du même rang lors des deux dernières séances de ce modèle.
 *
 * Deux fois et non une : une machine prise un soir ne dit rien, deux soirs de
 * suite disent que la séance s'est déplacée. `recent` va de la plus récente à
 * la plus ancienne séance.
 */
export function habitualSwaps(
  planned: readonly TemplateExercise[],
  recent: readonly (readonly Pick<WorkoutSet, 'exerciseId' | 'position'>[])[],
): Map<number, number> {
  const habits = new Map<number, number>();
  const [last, before] = recent;
  if (last === undefined || before === undefined) {
    return habits;
  }
  const at = (sets: readonly Pick<WorkoutSet, 'exerciseId' | 'position'>[], position: number) =>
    sets.find((set) => set.position === position)?.exerciseId;

  for (const entry of planned) {
    const now = at(last, entry.position);
    if (now !== undefined && now !== entry.exercise.id && now === at(before, entry.position)) {
      habits.set(entry.position, now);
    }
  }
  return habits;
}
