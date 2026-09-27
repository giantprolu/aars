/**
 * Besoin énergétique et répartition en macronutriments. Fonctions pures (AD-8).
 *
 * Le calcul est déterministe et refaisable à la main. Aucun modèle de langage
 * n'intervient : un besoin calorique est une chaîne d'équations publiées, pas
 * une opinion, et l'utilisateur doit pouvoir contester le chiffre.
 *
 * Métabolisme de base — Mifflin-St Jeor (1990), retenue plutôt que
 * Harris-Benedict qui surestime systématiquement. C'est la seule équation sans
 * biais mesurable sur l'adulte, à moins de 10 % du réel dans environ 70 % des
 * cas, et la recommandation de l'Academy of Nutrition and Dietetics.
 *
 * Katch-McArdle la remplace dès que le taux de masse grasse est connu. Elle
 * raisonne sur la masse maigre, seul tissu qui consomme, et devance nettement
 * les équations sur le poids total chez les sujets très musclés ou très gras,
 * que Mifflin-St Jeor estime mal aux deux extrémités.
 *
 * Répartition — protéines d'abord, lipides ensuite, glucides en reste. Les
 * protéines suivent la masse et non les calories, parce que le besoin tient à
 * la quantité de tissu à entretenir. Les lipides suivent les calories, parce
 * qu'ils servent de réserve d'énergie et de véhicule hormonal.
 *
 * Aucune de ces valeurs n'est un avis médical. Ce sont des estimations de
 * population, à corriger par l'évolution réelle du poids sur trois semaines.
 */

/** Sexe biologique, seule variable de ce type retenue par Mifflin-St Jeor. */
export type Sex = 'male' | 'female';

/** Objectif poursuivi, qui décide du sens et de l'ampleur de l'écart. */
export type Goal = 'lose' | 'maintain' | 'gain';

/**
 * Niveau d'activité déclaré, multiplicateur appliqué au métabolisme de base.
 * Valeurs conventionnelles reprises de Harris-Benedict. Le niveau porte sur la
 * semaine entière, travail et entraînement confondus.
 *
 * Ce n'est qu'un repli. Dès qu'une dépense mesurée existe, elle la remplace :
 * choisir un multiplicateur dans une liste est l'étape la plus grossière de
 * tout le calcul, et la seule qu'un capteur sache faire mieux.
 */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

/**
 * Énergie d'un kilo de tissu adipeux, en kilocalories. Convertit un rythme
 * hebdomadaire en écart quotidien. La valeur vaut pour la perte ; en prise
 * elle surestime un peu, le tissu gagné n'étant pas que de la graisse, mais le
 * plafond de rythme ci-dessous ramène le surplus dans la fourchette admise.
 */
const KCAL_PER_KG_FAT = 7700;

/**
 * Rythme hebdomadaire admis, en pourcentage du poids corporel.
 * Au-delà d'un pour cent en perte, la masse maigre part avec la graisse.
 * Au-delà d'un demi pour cent en prise, le surplus se stocke sans servir.
 */
export const MAX_LOSS_RATE_PERCENT = 1;
export const MAX_GAIN_RATE_PERCENT = 0.5;

/**
 * Plancher calorique absolu. En dessous, l'apport ne couvre plus les besoins
 * en micronutriments. Valeurs cliniques usuelles hors suivi médical.
 */
const ABSOLUTE_FLOOR_KCAL = { male: 1500, female: 1200 } as const;

/**
 * Plafond de la dépense d'activité mesurée, en multiples du métabolisme de base.
 *
 * Il existe une limite haute à ce qu'un corps humain dépense durablement :
 * environ 2,5 fois le métabolisme de base, mesurée par Thurber et coll.
 * (Science Advances, 2019) sur des coureurs d'ultrafond et des cyclistes du
 * Tour de France. Le repos comptant pour un, il reste au plus une fois et
 * demie le métabolisme de base pour l'activité.
 *
 * Ce plafond n'est pas une précaution théorique. Le pont Santé a déjà remonté
 * une journée à 10 773 kcal actives — un raccourci qui envoie un cumul au lieu
 * d'un jour, ou une dépense sommée sur plusieurs semaines. Sans plafond, une
 * seule journée de ce genre porte la cible à plus de quatre mille kilocalories
 * et l'application conseille exactement l'inverse de ce qu'elle devrait.
 *
 * Le plafond s'applique ici, au calcul, et non à l'ingestion : la table
 * d'activité enregistre ce que le capteur a dit, le calcul décide ce qu'il en
 * croit. Corriger à l'écriture effacerait la trace du raccourci défaillant.
 */
export const MAX_ACTIVE_KCAL_PER_BMR = 1.5;

/**
 * Bornes d'une cible fixée à la main. Le plancher reste celui du calcul, par
 * sexe : choisir sa cible n'autorise pas à descendre sous le minimum clinique.
 * Le plafond écarte la faute de frappe, pas l'appétit.
 */
export const MANUAL_TARGET_MAX_KCAL = 6000;

/** Densité énergétique des macronutriments, en kilocalories par gramme. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * Protéines visées, en grammes par kilo de poids corporel, quand la
 * composition n'est pas connue. Fourchette de l'ISSN : 1,6 à 2,2 g/kg.
 * La cible monte en déficit, seul levier qui protège la masse maigre quand
 * l'énergie manque.
 */
const PROTEIN_G_PER_KG = { lose: 2, maintain: 1.6, gain: 1.8 } as const;

/**
 * Protéines visées par kilo de masse maigre, quand le taux de masse grasse est
 * connu. Référence plus juste : poser les protéines sur le poids total les
 * surestime chez un sujet gras, puisque le tissu adipeux n'en demande pas.
 * L'ISSN monte jusqu'à 3,1 g/kg de masse maigre en déficit chez l'entraîné.
 */
const PROTEIN_G_PER_KG_LEAN = { lose: 2.4, maintain: 2, gain: 2.2 } as const;

/**
 * Part des calories confiée aux lipides. La fourchette admise va de vingt à
 * trente pour cent ; la part baisse en déficit pour laisser des glucides,
 * qui soutiennent l'entraînement.
 */
const FAT_ENERGY_SHARE = { lose: 0.25, maintain: 0.28, gain: 0.3 } as const;

/**
 * Plancher lipidique, en grammes par kilo de poids corporel. En dessous, la
 * production hormonale se dégrade et les vitamines liposolubles passent mal.
 */
const FAT_FLOOR_G_PER_KG = 0.5;

/**
 * Coût net d'une séance de musculation, en kilocalories par kilo de poids.
 *
 * Une heure de musculation vaut environ cinq MET (Compendium of Physical
 * Activities, code 02054) ; le repos en vaut un, déjà compté dans le
 * métabolisme de base. Il reste quatre kilocalories par kilo et par heure,
 * soit trois cents pour soixante-quinze kilos. C'est un ordre de grandeur, et
 * il ne sert qu'à répartir la semaine, pas à la gonfler (voir plus bas).
 */
const TRAINING_KCAL_PER_KG = 4;

/**
 * Ce que le calcul sait de l'entraînement de la semaine.
 *
 * `sessionsPerWeek` est la fréquence réellement tenue, pas celle déclarée :
 * c'est elle qui décide combien de jours prennent le supplément, et une
 * fréquence rêvée creuserait les jours de repos pour des séances qui n'ont
 * pas lieu.
 */
export interface TrainingCycle {
  trainingDay: boolean;
  sessionsPerWeek: number;
}

/** Mesures saisies au questionnaire. */
export interface BodyProfile {
  sex: Sex;
  /** Âge en années révolues. */
  ageYears: number;
  /** Taille en centimètres. */
  heightCm: number;
  /** Poids en kilogrammes. */
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /**
   * Rythme visé, en pourcentage du poids corporel par semaine.
   * Ignoré quand l'objectif est le maintien.
   */
  ratePercentPerWeek: number;
  /**
   * Taux de masse grasse en pourcentage, si connu. Sa présence bascule le
   * métabolisme de base sur Katch-McArdle et les protéines sur la masse maigre.
   */
  bodyFatPercent?: number;
  /**
   * Cible fixée à la main. Renseignée, elle remplace le résultat du calcul :
   * l'utilisateur qui a pesé trois semaines en sait plus que l'équation.
   * Les macronutriments continuent d'être répartis, sur ce chiffre-là.
   */
  manualTargetKcal?: number;
}

/** Résultat complet, chaque étape restant lisible séparément. */
export interface EnergyTarget {
  /** Métabolisme de base, en kilocalories par jour. */
  bmrKcal: number;
  /** Dépense totale estimée, activité comprise. */
  maintenanceKcal: number;
  /** Écart demandé. Négatif en perte, positif en prise. */
  adjustmentKcal: number;
  /** Cible quotidienne retenue, planchers appliqués. */
  targetKcal: number;
  /**
   * Vrai quand un plancher a relevé la cible au-dessus de l'écart demandé.
   * L'écran doit alors dire que le rythme visé n'est pas atteignable.
   */
  floored: boolean;
  /** Équation employée pour le métabolisme de base. */
  equation: 'mifflin-st-jeor' | 'katch-mcardle';
  /**
   * D'où vient la cible : `manual` quand l'utilisateur l'a fixée lui-même,
   * `measured` quand la dépense vient d'un capteur, `declared` quand elle vient
   * du niveau d'activité choisi au questionnaire.
   */
  basis: 'measured' | 'declared' | 'manual';
  /**
   * Vrai quand la dépense mesurée dépassait le plafond physiologique et a été
   * ramenée à celui-ci. L'écran doit alors dire que le pont Santé envoie des
   * valeurs fausses, sans quoi l'utilisateur croit à un calcul cassé.
   */
  activityCapped: boolean;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /**
   * Ce que le jour reçoit ou cède à cause de l'entraînement, en kilocalories.
   * Zéro quand l'utilisateur ne s'entraîne pas.
   */
  cycleKcal: number;
  /** Jour d'entraînement, jour de repos, ou `null` sans entraînement suivi. */
  trainingDay: boolean | null;
}

/**
 * L'écart entre la cible retenue et la dépense, arrondi.
 *
 * C'est l'écart obtenu et non l'écart demandé : quand un plancher a relevé la
 * cible, ou quand l'utilisateur l'a fixée lui-même, le second ne décrit plus
 * rien. Seul le premier dit à l'écran ce que la journee creuse ou comble.
 *
 * L'addition de zéro n'est pas décorative. En maintien, la cible arrondie tombe
 * un peu sous la dépense, `Math.round` rend -0, et l'écran affichait « − 0 kcal ».
 * La somme d'un zéro négatif et d'un zéro positif vaut zero positif.
 */
function reportedAdjustment(targetKcal: number, maintenanceKcal: number): number {
  return Math.round(targetKcal - maintenanceKcal) + 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Mifflin-St Jeor (1990). Le terme constant est le seul à dépendre du sexe.
 * Homme : 10 P + 6,25 T − 5 A + 5. Femme : la même expression moins 161.
 */
export function mifflinStJeor(profile: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.ageYears;
  return base + (profile.sex === 'male' ? 5 : -161);
}

/**
 * Katch-McArdle. Ne regarde que la masse maigre, donc ni le sexe ni l'âge :
 * à masse maigre égale, la dépense de repos est la même.
 */
export function katchMcArdle(weightKg: number, bodyFatPercent: number): number {
  return 370 + 21.6 * leanMassKg(weightKg, bodyFatPercent);
}

/** Masse maigre en kilogrammes. */
export function leanMassKg(weightKg: number, bodyFatPercent: number): number {
  return weightKg * (1 - bodyFatPercent / 100);
}

/** Vrai si les mesures tiennent dans des bornes physiologiques plausibles. */
export function isValidBodyProfile(profile: BodyProfile): boolean {
  const maxRate = profile.goal === 'lose' ? MAX_LOSS_RATE_PERCENT : MAX_GAIN_RATE_PERCENT;

  return (
    Number.isFinite(profile.ageYears) &&
    profile.ageYears >= 15 &&
    profile.ageYears <= 100 &&
    Number.isFinite(profile.heightCm) &&
    profile.heightCm >= 120 &&
    profile.heightCm <= 250 &&
    Number.isFinite(profile.weightKg) &&
    profile.weightKg >= 30 &&
    profile.weightKg <= 300 &&
    Number.isFinite(profile.ratePercentPerWeek) &&
    profile.ratePercentPerWeek >= 0 &&
    (profile.goal === 'maintain' || profile.ratePercentPerWeek <= maxRate) &&
    (profile.bodyFatPercent === undefined ||
      (Number.isFinite(profile.bodyFatPercent) &&
        profile.bodyFatPercent >= 3 &&
        profile.bodyFatPercent <= 70)) &&
    (profile.manualTargetKcal === undefined ||
      (Number.isFinite(profile.manualTargetKcal) &&
        profile.manualTargetKcal >= ABSOLUTE_FLOOR_KCAL[profile.sex] &&
        profile.manualTargetKcal <= MANUAL_TARGET_MAX_KCAL))
  );
}

/**
 * Écart calorique quotidien correspondant au rythme visé.
 * Un demi pour cent de quatre-vingts kilos par semaine vaut quatre cents
 * grammes, donc trois mille quatre-vingts kilocalories, soit quatre cent
 * quarante par jour.
 */
function dailyAdjustment(profile: BodyProfile): number {
  if (profile.goal === 'maintain') {
    return 0;
  }
  const kgPerWeek = profile.weightKg * (profile.ratePercentPerWeek / 100);
  const kcalPerDay = (kgPerWeek * KCAL_PER_KG_FAT) / 7;
  return profile.goal === 'lose' ? -kcalPerDay : kcalPerDay;
}

/**
 * Répartit une cible calorique. Les protéines sont posées sur la masse, les
 * lipides sur une part des calories avec un plancher au poids, les glucides
 * prennent ce qui reste. Ce reste ne peut pas devenir négatif : protéines et
 * lipides ne mobilisent jamais plus que la cible, les planchers caloriques en
 * amont garantissant une cible supérieure au métabolisme de base.
 */
function splitMacros(
  targetKcal: number,
  profile: BodyProfile,
): { proteinG: number; carbsG: number; fatG: number } {
  const proteinG =
    profile.bodyFatPercent === undefined
      ? PROTEIN_G_PER_KG[profile.goal] * profile.weightKg
      : PROTEIN_G_PER_KG_LEAN[profile.goal] *
        leanMassKg(profile.weightKg, profile.bodyFatPercent);

  const fatG = Math.max(
    FAT_FLOOR_G_PER_KG * profile.weightKg,
    (FAT_ENERGY_SHARE[profile.goal] * targetKcal) / KCAL_PER_G.fat,
  );

  const remainingKcal =
    targetKcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;

  return {
    proteinG: roundTo(proteinG, 1),
    fatG: roundTo(fatG, 1),
    carbsG: roundTo(Math.max(0, remainingKcal) / KCAL_PER_G.carbs, 1),
  };
}

/**
 * Chaîne complète, du questionnaire à la cible quotidienne.
 * Les étapes intermédiaires sont rendues pour que l'écran montre d'où vient le
 * chiffre plutôt que de l'asséner.
 */
export function computeEnergyTarget(
  profile: BodyProfile,
  measuredActiveKcal?: number,
  cycle?: TrainingCycle,
): EnergyTarget {
  const useKatch = profile.bodyFatPercent !== undefined;
  const bmr = useKatch
    ? katchMcArdle(profile.weightKg, profile.bodyFatPercent as number)
    : mifflinStJeor(profile);

  // Modèle additif quand la dépense est mesurée : Santé compte l'énergie
  // active en plus du repos, les deux s'ajoutent donc sans se recouvrir.
  // Modèle multiplicatif sinon, faute de mieux.
  //
  // La mesure est plafonnée avant d'être crue. Un capteur se trompe de
  // plusieurs ordres de grandeur quand il se trompe, et une dépense qu'aucun
  // corps humain ne soutient n'est pas une dépense : c'est une panne.
  const measured = measuredActiveKcal !== undefined && Number.isFinite(measuredActiveKcal);
  const ceiling = bmr * MAX_ACTIVE_KCAL_PER_BMR;
  const active = measured ? Math.max(0, measuredActiveKcal as number) : 0;
  const activityCapped = measured && active > ceiling;
  const maintenance = measured
    ? bmr + Math.min(active, ceiling)
    : bmr * ACTIVITY_FACTORS[profile.activity];

  const adjustment = dailyAdjustment(profile);
  const raw = maintenance + adjustment;

  // Deux planchers, le plus haut l'emporte : jamais sous le métabolisme de
  // base, jamais sous le minimum clinique. Ils ne mordent qu'en perte.
  const floor = Math.max(bmr, ABSOLUTE_FLOOR_KCAL[profile.sex]);
  const computed = Math.round(Math.max(raw, floor));

  // La cible fixée à la main court-circuite les planchers comme l'objectif :
  // ils protègent une estimation, or ce chiffre-ci n'en est pas une. Les bornes
  // de `isValidBodyProfile` l'ont déjà gardé dans le raisonnable en amont.
  const manual = profile.manualTargetKcal;
  const manualUsed = manual !== undefined && Number.isFinite(manual);
  const weekly = manualUsed ? Math.round(manual as number) : computed;

  // L'entraînement déplace des calories d'un jour à l'autre sans rien ajouter
  // à la semaine. Le jour de séance reçoit la part de la séance que les jours
  // de repos lui cèdent : la différence entre les deux vaut le coût de la
  // séance, et la moyenne de la semaine reste la cible calculée. Ajouter le
  // coût sans le reprendre ailleurs le compterait deux fois — une fois dans
  // le niveau d'activité ou la dépense mesurée, qui l'incluent déjà, une fois
  // ici.
  //
  // Le jour de repos ne descend jamais sous le minimum clinique : la semaine
  // y perd un peu de sa neutralité, c'est le prix d'un plancher qui tient.
  const cycleKcal = cycle === undefined ? 0 : trainingShift(profile.weightKg, cycle);
  const target = Math.max(weekly + cycleKcal, ABSOLUTE_FLOOR_KCAL[profile.sex]);

  return {
    bmrKcal: Math.round(bmr),
    maintenanceKcal: Math.round(maintenance),
    adjustmentKcal: reportedAdjustment(target, maintenance),
    targetKcal: target,
    floored: !manualUsed && computed > Math.round(raw),
    equation: useKatch ? 'katch-mcardle' : 'mifflin-st-jeor',
    basis: manualUsed ? 'manual' : measured ? 'measured' : 'declared',
    activityCapped,
    ...splitMacros(target, profile),
    cycleKcal: target - weekly,
    trainingDay: cycle === undefined ? null : cycle.trainingDay,
  };
}

/**
 * Le supplément d'un jour d'entraînement, ou la part cédée par un jour de
 * repos, arrondi à la dizaine.
 *
 * Avec t séances par semaine et une séance coûtant C : le jour de séance
 * reçoit C × (7 − t) / 7, le jour de repos cède C × t / 7. Sur la semaine,
 * t × C × (7 − t) / 7 − (7 − t) × C × t / 7 = 0.
 */
export function trainingShift(weightKg: number, cycle: TrainingCycle): number {
  const sessions = Math.min(6, Math.max(1, Math.round(cycle.sessionsPerWeek)));
  const cost = TRAINING_KCAL_PER_KG * weightKg;
  const shift = cycle.trainingDay ? (cost * (7 - sessions)) / 7 : (-cost * sessions) / 7;
  return Math.round(shift / 10) * 10;
}
