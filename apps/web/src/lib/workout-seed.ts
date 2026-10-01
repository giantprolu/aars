/**
 * Le catalogue d'exercices livré, et l'inventaire des salles.
 *
 * Ce module ne contient plus de programme tout fait. Les séances sont
 * composées à la demande par `workout-plan`, à partir de ce que l'utilisateur
 * veut travailler et de ce qu'il a sous la main. Un programme figé ne survit
 * pas au premier changement de salle : celui qui passe d'un parc complet à un
 * club sans barre se retrouve avec trois séances dont la moitié des lignes
 * sont infaisables, et aucune façon de le dire à l'application.
 *
 * Les exercices sont désignés par leur `slug` et non par un identifiant : le
 * catalogue est commun et peut déjà contenir la ligne, auquel cas le seed ne
 * la réécrit pas. C'est ce qui rend l'installation idempotente.
 */

import type { ExerciseEquipment, ExerciseKind, ExerciseRegion } from './workout';

export interface SeedExercise {
  slug: string;
  name: string;
  kind: ExerciseKind;
  muscleGroup: string | null;
  region: ExerciseRegion;
  equipment: ExerciseEquipment;
  /** Rang de choix dans son groupe : 1 est l'exercice de base du groupe. */
  rank: number;
  /**
   * Les autres noms sous lesquels on l'écrit.
   *
   * L'anglais y figure systématiquement, parce que c'est ce qui est écrit sur
   * la machine et donc ce qu'on note sur son téléphone. Une séance recopiée le
   * soir dit « chest press », jamais « développé couché à la machine », et
   * l'import doit retrouver la ligne telle qu'elle a été écrite.
   */
  aliases: readonly string[];
}

/**
 * Les groupes musculaires, dans l'ordre où une séance les enchaîne.
 *
 * Le bas du corps est découpé plus finement que « Jambes » : c'est la
 * condition pour qu'une orientation bas du corps produise autre chose que
 * trois fois le même mouvement de quadriceps.
 */
export const MUSCLE_GROUPS = {
  chest: 'Pectoraux',
  back: 'Dos',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quadriceps',
  hamstrings: 'Ischio-jambiers',
  glutes: 'Fessiers',
  calves: 'Mollets',
  abs: 'Abdominaux',
  lowerBack: 'Lombaires',
} as const;

export const SEED_EXERCISES: readonly SeedExercise[] = [
  // Pectoraux
  {
    slug: 'developpe-couche',
    name: 'Développé couché',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'free',
    rank: 1,
    aliases: ['bench press', 'developpe couche barre', 'bench'],
  },
  {
    slug: 'chest-press',
    name: 'Chest press (machine)',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'machine',
    rank: 1,
    aliases: ['chest press machine', 'developpe couche machine', 'presse pectoraux'],
  },
  {
    slug: 'developpe-incline',
    name: 'Développé incliné',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'free',
    rank: 2,
    aliases: ['incline bench press', 'incline press', 'developpe incline halteres'],
  },
  {
    slug: 'developpe-incline-machine',
    name: 'Développé incliné (machine)',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'machine',
    rank: 2,
    aliases: ['incline chest press', 'incline press machine'],
  },
  {
    slug: 'pec-deck',
    name: 'Pec deck',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'machine',
    rank: 3,
    aliases: ['pec fly', 'butterfly', 'papillon', 'peck deck'],
  },
  {
    slug: 'ecarte-poulie',
    name: 'Écarté à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'cable',
    rank: 3,
    aliases: ['cable fly', 'crossover', 'cable crossover', 'ecarte poulie'],
  },
  {
    slug: 'ecarte-couche',
    name: 'Écarté couché',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'free',
    rank: 4,
    aliases: ['dumbbell fly', 'ecarte halteres'],
  },
  {
    slug: 'dips',
    name: 'Dips',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'bodyweight',
    rank: 4,
    aliases: ['dips barres paralleles', 'chest dips'],
  },
  {
    slug: 'pompes',
    name: 'Pompes',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.chest,
    region: 'upper',
    equipment: 'bodyweight',
    rank: 5,
    aliases: ['push up', 'pushups', 'push-ups'],
  },

  // Dos
  {
    slug: 'tractions',
    name: 'Tractions',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'bodyweight',
    rank: 1,
    aliases: ['pull up', 'pull-ups', 'traction'],
  },
  {
    slug: 'tirage-vertical',
    name: 'Tirage vertical',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'machine',
    rank: 1,
    aliases: ['lat pulldown', 'lat pull down', 'tirage poitrine', 'pulldown'],
  },
  {
    slug: 'rowing-barre',
    name: 'Rowing barre',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'free',
    rank: 2,
    aliases: ['barbell row', 'bent over row', 'rowing buste penche'],
  },
  {
    slug: 'tirage-horizontal',
    name: 'Tirage horizontal à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'cable',
    rank: 2,
    aliases: ['seated row', 'low row', 'rowing assis poulie', 'cable row'],
  },
  {
    slug: 'rowing-unilateral',
    name: 'Rowing unilatéral',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'free',
    rank: 3,
    aliases: ['dumbbell row', 'one arm row', 'rowing haltere'],
  },
  {
    slug: 'rowing-machine',
    name: 'Rowing assis (machine)',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'machine',
    rank: 3,
    aliases: ['seated row machine', 'row machine', 'tirage horizontal machine'],
  },
  {
    slug: 'pull-over-poulie',
    name: 'Pull-over à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.back,
    region: 'upper',
    equipment: 'cable',
    rank: 4,
    aliases: ['pullover', 'straight arm pulldown', 'pull over'],
  },

  // Épaules
  {
    slug: 'developpe-militaire',
    name: 'Développé militaire',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'free',
    rank: 1,
    aliases: ['overhead press', 'military press', 'ohp', 'developpe epaules barre'],
  },
  {
    slug: 'shoulder-press-machine',
    name: 'Shoulder press (machine)',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'machine',
    rank: 1,
    aliases: ['shoulder press', 'developpe epaules machine', 'presse epaules'],
  },
  {
    slug: 'developpe-militaire-halteres',
    name: 'Développé militaire haltères',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'free',
    rank: 2,
    aliases: ['dumbbell shoulder press', 'developpe epaules halteres'],
  },
  {
    slug: 'elevations-laterales',
    name: 'Élévations latérales',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'free',
    rank: 2,
    aliases: ['lateral raise', 'side raise', 'elevation laterale'],
  },
  {
    slug: 'elevations-laterales-poulie',
    name: 'Élévations latérales à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'cable',
    rank: 3,
    aliases: ['cable lateral raise'],
  },
  {
    slug: 'oiseau',
    name: 'Oiseau',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'free',
    rank: 3,
    aliases: ['rear delt fly', 'reverse fly', 'elevation buste penche'],
  },
  {
    slug: 'reverse-pec-deck',
    name: 'Reverse pec deck',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'machine',
    rank: 3,
    aliases: ['rear delt machine', 'pec deck inverse', 'reverse fly machine'],
  },
  {
    slug: 'face-pull',
    name: 'Face pull',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.shoulders,
    region: 'upper',
    equipment: 'cable',
    rank: 4,
    aliases: ['facepull', 'tirage visage'],
  },

  // Biceps
  {
    slug: 'curl-biceps',
    name: 'Curl biceps',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.biceps,
    region: 'upper',
    equipment: 'free',
    rank: 1,
    aliases: ['curl', 'barbell curl', 'dumbbell curl', 'curl halteres'],
  },
  {
    slug: 'curl-marteau',
    name: 'Curl marteau',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.biceps,
    region: 'upper',
    equipment: 'free',
    rank: 2,
    aliases: ['hammer curl', 'curl prise marteau'],
  },
  {
    slug: 'curl-pupitre',
    name: 'Curl au pupitre',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.biceps,
    region: 'upper',
    equipment: 'machine',
    rank: 2,
    aliases: ['preacher curl', 'larry scott', 'curl machine', 'biceps curl machine'],
  },
  {
    slug: 'curl-poulie',
    name: 'Curl à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.biceps,
    region: 'upper',
    equipment: 'cable',
    rank: 3,
    aliases: ['cable curl', 'curl poulie basse'],
  },

  // Triceps
  {
    slug: 'extensions-triceps-poulie',
    name: 'Extensions triceps à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.triceps,
    region: 'upper',
    equipment: 'cable',
    rank: 1,
    aliases: ['triceps pushdown', 'pushdown', 'extension triceps poulie', 'rope pushdown'],
  },
  {
    slug: 'dips-machine',
    name: 'Dips (machine)',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.triceps,
    region: 'upper',
    equipment: 'machine',
    rank: 1,
    aliases: ['triceps dips machine', 'assisted dips', 'dips guide'],
  },
  {
    slug: 'extension-triceps',
    name: 'Extension triceps couché',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.triceps,
    region: 'upper',
    equipment: 'free',
    rank: 2,
    aliases: ['skull crusher', 'barre au front', 'french press'],
  },
  {
    slug: 'extension-triceps-nuque',
    name: 'Extension triceps à la nuque',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.triceps,
    region: 'upper',
    equipment: 'free',
    rank: 3,
    aliases: ['overhead triceps extension', 'extension nuque haltere'],
  },

  // Quadriceps
  {
    slug: 'squat',
    name: 'Squat',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'free',
    rank: 1,
    aliases: ['back squat', 'squat barre', 'squat arriere'],
  },
  {
    slug: 'presse-a-cuisses',
    name: 'Presse à cuisses',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'machine',
    rank: 1,
    aliases: ['leg press', 'leg press machine', 'presse jambes'],
  },
  {
    slug: 'hack-squat',
    name: 'Hack squat',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'machine',
    rank: 2,
    aliases: ['hack squat machine', 'squat guide'],
  },
  {
    slug: 'leg-extension',
    name: 'Leg extension',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'machine',
    rank: 2,
    aliases: ['extension des jambes', 'leg extension machine', 'quadriceps machine'],
  },
  {
    slug: 'goblet-squat',
    name: 'Goblet squat',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'free',
    rank: 3,
    aliases: ['squat goblet', 'squat haltere'],
  },
  {
    slug: 'fentes',
    name: 'Fentes',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'free',
    rank: 3,
    aliases: ['lunges', 'walking lunges', 'fentes marchees'],
  },
  {
    slug: 'squat-bulgare',
    name: 'Squat bulgare',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.quads,
    region: 'lower',
    equipment: 'free',
    rank: 4,
    aliases: ['bulgarian split squat', 'split squat'],
  },

  // Ischio-jambiers
  {
    slug: 'souleve-de-terre-roumain',
    name: 'Soulevé de terre roumain',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.hamstrings,
    region: 'lower',
    equipment: 'free',
    rank: 1,
    aliases: ['romanian deadlift', 'rdl', 'sdt roumain'],
  },
  {
    slug: 'leg-curl-allonge',
    name: 'Leg curl allongé',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.hamstrings,
    region: 'lower',
    equipment: 'machine',
    rank: 1,
    aliases: ['leg curl', 'lying leg curl', 'curl ischios', 'leg curl machine'],
  },
  {
    slug: 'leg-curl-assis',
    name: 'Leg curl assis',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.hamstrings,
    region: 'lower',
    equipment: 'machine',
    rank: 2,
    aliases: ['seated leg curl'],
  },
  {
    slug: 'souleve-de-terre',
    name: 'Soulevé de terre',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.hamstrings,
    region: 'lower',
    equipment: 'free',
    rank: 2,
    aliases: ['deadlift', 'sdt'],
  },

  // Fessiers
  {
    slug: 'hip-thrust',
    name: 'Hip thrust',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.glutes,
    region: 'lower',
    equipment: 'free',
    rank: 1,
    aliases: ['pont fessier', 'glute bridge', 'hipthrust'],
  },
  {
    slug: 'abduction-machine',
    name: 'Abduction à la machine',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.glutes,
    region: 'lower',
    equipment: 'machine',
    rank: 1,
    aliases: ['hip abduction', 'abducteurs', 'abductor machine'],
  },
  {
    slug: 'kickback-poulie',
    name: 'Kickback à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.glutes,
    region: 'lower',
    equipment: 'cable',
    rank: 2,
    aliases: ['glute kickback', 'cable kickback'],
  },

  // Mollets
  {
    slug: 'mollets-debout',
    name: 'Mollets debout',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.calves,
    region: 'lower',
    equipment: 'machine',
    rank: 1,
    aliases: ['standing calf raise', 'calf raise', 'extension mollets'],
  },
  {
    slug: 'mollets-assis',
    name: 'Mollets assis',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.calves,
    region: 'lower',
    equipment: 'machine',
    rank: 2,
    aliases: ['seated calf raise'],
  },

  // Abdominaux et lombaires
  {
    slug: 'releve-de-jambes',
    name: 'Relevé de jambes',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.abs,
    region: 'core',
    equipment: 'bodyweight',
    rank: 1,
    aliases: ['leg raise', 'hanging leg raise', 'releve jambes'],
  },
  {
    slug: 'gainage-planche',
    name: 'Gainage planche',
    kind: 'hold',
    muscleGroup: MUSCLE_GROUPS.abs,
    region: 'core',
    equipment: 'bodyweight',
    rank: 2,
    aliases: ['plank', 'planche', 'gainage'],
  },
  {
    slug: 'crunch-poulie',
    name: 'Crunch à la poulie',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.abs,
    region: 'core',
    equipment: 'cable',
    rank: 2,
    aliases: ['cable crunch', 'crunch poulie haute'],
  },
  {
    slug: 'crunch-machine',
    name: 'Crunch (machine)',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.abs,
    region: 'core',
    equipment: 'machine',
    rank: 3,
    aliases: ['ab crunch machine', 'machine abdos', 'abdominal crunch'],
  },
  {
    slug: 'extensions-lombaires',
    name: 'Extensions lombaires',
    kind: 'strength',
    muscleGroup: MUSCLE_GROUPS.lowerBack,
    region: 'core',
    equipment: 'machine',
    rank: 1,
    aliases: ['back extension', 'hyperextension', 'banc a lombaires'],
  },

  // Cardio
  {
    slug: 'velo',
    name: 'Vélo',
    kind: 'cardio',
    muscleGroup: null,
    region: 'full',
    equipment: 'cardio',
    rank: 1,
    aliases: ['bike', 'cycling', 'velo assis'],
  },
  {
    slug: 'tapis-course',
    name: 'Tapis de course',
    kind: 'cardio',
    muscleGroup: null,
    region: 'full',
    equipment: 'cardio',
    rank: 1,
    aliases: ['treadmill', 'course', 'running'],
  },
  {
    slug: 'rameur',
    name: 'Rameur',
    kind: 'cardio',
    muscleGroup: null,
    region: 'full',
    equipment: 'cardio',
    rank: 2,
    aliases: ['rower', 'concept2', 'aviron indoor'],
  },
  {
    slug: 'elliptique',
    name: 'Vélo elliptique',
    kind: 'cardio',
    muscleGroup: null,
    region: 'full',
    equipment: 'cardio',
    rank: 2,
    aliases: ['elliptical', 'elliptique'],
  },
  {
    slug: 'marche-inclinee',
    name: 'Marche rapide inclinée',
    kind: 'cardio',
    muscleGroup: null,
    region: 'full',
    equipment: 'cardio',
    rank: 3,
    aliases: ['incline walk', 'marche inclinee', 'tapis incline'],
  },
  {
    slug: 'corde-a-sauter',
    name: 'Corde à sauter',
    kind: 'cardio',
    muscleGroup: null,
    region: 'full',
    equipment: 'cardio',
    rank: 3,
    aliases: ['jump rope', 'skipping'],
  },
];

/**
 * Une salle, décrite par le matériel qu'on y trouve.
 *
 * L'inventaire est déclaré par familles plutôt qu'exercice par exercice : ce
 * qui distingue réellement deux enseignes, c'est la présence d'un parc de
 * poids libres, pas le modèle de la presse à cuisses. Les listes `without` et
 * `with` rattrapent les écarts connus, essentiellement l'absence de barre
 * olympique dans les clubs de petite surface.
 *
 * C'est une approximation, et elle est assumée comme telle : les enseignes
 * varient d'un club à l'autre. Elle sert à composer un premier programme
 * plausible, pas à certifier ce qui est derrière la porte. Choisir « Je ne
 * précise pas » ouvre le catalogue entier.
 */
export interface SeedGym {
  slug: string;
  name: string;
  note: string;
  /** Familles de matériel présentes. */
  equipment: readonly ExerciseEquipment[];
  /** Exercices absents malgré leur famille présente. */
  without?: readonly string[];
  /** Exercices présents malgré leur famille absente. */
  with?: readonly string[];
}

/** Les exercices à la barre olympique, absents des clubs sans rack. */
const BARBELL_ONLY: readonly string[] = [
  'developpe-couche',
  'developpe-militaire',
  'rowing-barre',
  'squat',
  'souleve-de-terre',
  'souleve-de-terre-roumain',
  'hip-thrust',
];

/** Ce qu'on peut faire avec une paire d'haltères et rien d'autre. */
const DUMBBELL_ONLY: readonly string[] = [
  'developpe-incline',
  'ecarte-couche',
  'developpe-militaire-halteres',
  'elevations-laterales',
  'oiseau',
  'curl-biceps',
  'curl-marteau',
  'extension-triceps',
  'extension-triceps-nuque',
  'rowing-unilateral',
  'goblet-squat',
  'fentes',
  'squat-bulgare',
];

export const SEED_GYMS: readonly SeedGym[] = [
  {
    slug: 'on-air',
    name: 'On Air',
    note: 'Parc complet, poids libres et machines.',
    equipment: ['free', 'machine', 'cable', 'bodyweight', 'cardio'],
  },
  {
    slug: 'basic-fit',
    name: 'Basic-Fit',
    note: 'Parc complet. Le hack squat manque dans la plupart des clubs.',
    equipment: ['free', 'machine', 'cable', 'bodyweight', 'cardio'],
    without: ['hack-squat'],
  },
  {
    slug: 'fitness-park',
    name: 'Fitness Park',
    note: 'Grande zone de poids libres, parc de machines complet.',
    equipment: ['free', 'machine', 'cable', 'bodyweight', 'cardio'],
  },
  {
    slug: 'keepcool',
    name: 'Keepcool',
    note: 'Clubs compacts : machines et haltères, pas de barre olympique.',
    equipment: ['machine', 'cable', 'bodyweight', 'cardio'],
    with: DUMBBELL_ONLY,
    without: BARBELL_ONLY,
  },
  {
    slug: 'neoness',
    name: 'Neoness',
    note: 'Clubs compacts : machines et haltères, pas de barre olympique.',
    equipment: ['machine', 'cable', 'bodyweight', 'cardio'],
    with: DUMBBELL_ONLY,
    without: BARBELL_ONLY,
  },
  {
    slug: 'orange-bleue',
    name: "L'Orange bleue",
    note: 'Machines guidées et cours collectifs, poids libres réduits.',
    equipment: ['machine', 'cable', 'bodyweight', 'cardio'],
    with: DUMBBELL_ONLY,
    without: BARBELL_ONLY,
  },
  {
    slug: 'maison',
    name: 'À la maison',
    note: 'Poids du corps et haltères.',
    equipment: ['bodyweight'],
    with: [...DUMBBELL_ONLY, 'corde-a-sauter'],
  },
];

/** Les exercices disponibles dans une salle, par leur slug. */
export function gymInventory(gym: SeedGym, catalog: readonly SeedExercise[]): string[] {
  const families = new Set<ExerciseEquipment>(gym.equipment);
  const forced = new Set(gym.with ?? []);
  const banned = new Set(gym.without ?? []);

  return catalog
    .filter((exercise) => {
      if (banned.has(exercise.slug)) {
        return false;
      }
      return families.has(exercise.equipment) || forced.has(exercise.slug);
    })
    .map((exercise) => exercise.slug);
}
