/**
 * Les illustrations d'exercices. Fonctions pures (AD-8).
 *
 * Un nom d'exercice ne dit rien à qui ne le connaît pas. « Pec deck », « face
 * pull », « hip thrust » sont des mots de salle, et se retrouver devant un
 * programme composé de mots qu'on ne sait pas traduire en mouvement est la
 * façon la plus sûre de ne pas s'en servir. Deux photos suffisent à lever le
 * doute — celle du début et celle de la fin du mouvement.
 *
 * Les images viennent de `free-exercise-db` (domaine public, Unlicense) et
 * sont recopiées dans `public/exercices` par `scripts/fetch-exercise-images`.
 * La correspondance est écrite à la main : un rapprochement automatique sur
 * les noms confondrait le rowing barre et le rowing assis, et l'erreur ne se
 * verrait qu'en salle, au pire moment.
 */

/** Slug du catalogue maison → identifiant dans `free-exercise-db`. */
export const ILLUSTRATION_SOURCES: Readonly<Record<string, string>> = {
  'developpe-couche': 'Barbell_Bench_Press_-_Medium_Grip',
  'chest-press': 'Machine_Bench_Press',
  'developpe-incline': 'Incline_Dumbbell_Press',
  'developpe-incline-machine': 'Leverage_Incline_Chest_Press',
  'pec-deck': 'Butterfly',
  'ecarte-poulie': 'Cable_Crossover',
  'ecarte-couche': 'Dumbbell_Flyes',
  dips: 'Dips_-_Chest_Version',
  pompes: 'Pushups',
  tractions: 'Pullups',
  'tirage-vertical': 'Wide-Grip_Lat_Pulldown',
  'rowing-barre': 'Bent_Over_Barbell_Row',
  'tirage-horizontal': 'Seated_Cable_Rows',
  'rowing-unilateral': 'One-Arm_Dumbbell_Row',
  'rowing-machine': 'Leverage_Iso_Row',
  'pull-over-poulie': 'Straight-Arm_Pulldown',
  'developpe-militaire': 'Standing_Military_Press',
  'shoulder-press-machine': 'Machine_Shoulder_Military_Press',
  'developpe-militaire-halteres': 'Seated_Dumbbell_Press',
  'elevations-laterales': 'Side_Lateral_Raise',
  'elevations-laterales-poulie': 'Cable_Seated_Lateral_Raise',
  oiseau: 'Seated_Bent-Over_Rear_Delt_Raise',
  'reverse-pec-deck': 'Reverse_Machine_Flyes',
  'face-pull': 'Face_Pull',
  'curl-biceps': 'Barbell_Curl',
  'curl-marteau': 'Hammer_Curls',
  'curl-pupitre': 'Preacher_Curl',
  'curl-poulie': 'Standing_Biceps_Cable_Curl',
  'extensions-triceps-poulie': 'Triceps_Pushdown_-_Rope_Attachment',
  'dips-machine': 'Dip_Machine',
  'extension-triceps': 'Lying_Triceps_Press',
  'extension-triceps-nuque': 'Standing_Dumbbell_Triceps_Extension',
  squat: 'Barbell_Squat',
  'presse-a-cuisses': 'Leg_Press',
  'hack-squat': 'Hack_Squat',
  'leg-extension': 'Leg_Extensions',
  'goblet-squat': 'Goblet_Squat',
  fentes: 'Dumbbell_Lunges',
  'squat-bulgare': 'Split_Squat_with_Dumbbells',
  'souleve-de-terre-roumain': 'Romanian_Deadlift',
  'leg-curl-allonge': 'Lying_Leg_Curls',
  'leg-curl-assis': 'Seated_Leg_Curl',
  'souleve-de-terre': 'Barbell_Deadlift',
  'hip-thrust': 'Barbell_Hip_Thrust',
  'abduction-machine': 'Thigh_Abductor',
  'kickback-poulie': 'One-Legged_Cable_Kickback',
  'mollets-debout': 'Standing_Calf_Raises',
  'mollets-assis': 'Seated_Calf_Raise',
  'releve-de-jambes': 'Hanging_Leg_Raise',
  'gainage-planche': 'Plank',
  'crunch-poulie': 'Cable_Crunch',
  'crunch-machine': 'Ab_Crunch_Machine',
  'extensions-lombaires': 'Hyperextensions_Back_Extensions',
  velo: 'Bicycling_Stationary',
  'tapis-course': 'Running_Treadmill',
  rameur: 'Rowing_Stationary',
  elliptique: 'Elliptical_Trainer',
  'marche-inclinee': 'Walking_Treadmill',
  'corde-a-sauter': 'Rope_Jumping',
};

/** Rapport d'aspect des images du jeu de données, à 700 × 467. */
export const ILLUSTRATION_RATIO = '3 / 2';

/**
 * Les deux images d'un exercice, ou `null` s'il n'en a pas.
 *
 * Un exercice créé depuis un import de séance n'en a jamais : on vient
 * d'apprendre son nom, on n'a aucune photo à y associer, et en inventer une
 * serait pire que de n'en montrer aucune.
 */
export function illustrationFor(slug: string): readonly [string, string] | null {
  return slug in ILLUSTRATION_SOURCES
    ? [`/exercices/${slug}/0.jpg`, `/exercices/${slug}/1.jpg`]
    : null;
}

/**
 * Une recherche de démonstration vidéo, pour aller plus loin que deux photos.
 *
 * Un lien sortant plutôt qu'une vidéo intégrée : intégrer supposerait une clé
 * d'API ou un lecteur tiers dans la page, alors que deux photos répondent déjà
 * à la question posée — reconnaître le mouvement. Celui qui veut la technique
 * complète part sur YouTube, où elle est.
 */
export function demoSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${name} musculation technique`,
  )}`;
}
