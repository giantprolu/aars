import 'server-only';
import { ageInYears, shiftDate, todayInParis } from '@/lib/date';
import {
  computeEnergyTarget,
  isValidBodyProfile,
  type EnergyTarget,
  type TrainingCycle,
} from '@/lib/energy';
import { isValidWeighIn, weeklyWeights, type WeekWeight } from '@/lib/weight';
import {
  findProfile,
  saveProfile,
  updateProfileWeight,
  type Profile,
} from '../db/queries/profiles';
import { activityBaseline, lastActivity } from '../db/queries/activity';
import { trainingDates } from '../db/queries/workouts';
import { listWeighIns, upsertWeighIn } from '../db/queries/weights';

/**
 * Service du profil et de la cible calorique.
 *
 * C'est l'unique endroit où un profil stocké devient une cible. Le calcul
 * lui-même reste dans `@/lib/energy`, pur et testable sans base ; ce module ne
 * fait que l'alimenter et refuser les mesures invraisemblables.
 */

/**
 * Fenêtre de moyenne des dépenses mesurées, en jours. Deux semaines couvrent
 * un cycle d'entraînement complet, semaines creuses comprises, sans remonter
 * si loin qu'un changement d'habitude mette un mois à se voir.
 */
const ACTIVITY_WINDOW_DAYS = 14;

/**
 * Nombre de journées mesurées en dessous duquel on garde le facteur déclaré.
 *
 * Sept, soit une semaine entière : la dépense suit un rythme hebdomadaire, et
 * une fenêtre plus courte tombe sur des jours ouvrés ou sur un week-end sans
 * qu'on sache lequel. Le seuil valait trois, ce qui était trop peu pour la
 * médiane qui décide désormais : sur trois points, deux mesures fausses
 * suffisent à l'emporter, sur sept il en faut quatre.
 */
const MIN_MEASURED_DAYS = 7;

export type { Profile };

/**
 * Fenêtre sur laquelle se mesure la fréquence d'entraînement, en jours.
 * Quatre semaines : assez pour qu'une semaine de vacances ne fasse pas
 * croire qu'on a arrêté, assez court pour qu'une reprise se voie vite.
 */
const TRAINING_WINDOW_DAYS = 28;

/**
 * Où en est l'entraînement au jour donné, ou `undefined` sans séance récente.
 *
 * Sans séance sur quatre semaines, il n'y a rien à répartir : la cible reste
 * la même tous les jours, comme avant que le module Sport existe.
 */
async function trainingCycleFor(userId: number, day: string): Promise<TrainingCycle | undefined> {
  const since = shiftDate(day, -(TRAINING_WINDOW_DAYS - 1));
  const days = (await trainingDates(userId, since)).filter((date) => date <= day);
  if (days.length === 0) {
    return undefined;
  }
  return {
    trainingDay: days.includes(day),
    sessionsPerWeek: (days.length * 7) / TRAINING_WINDOW_DAYS,
  };
}

/** Le profil converti en entrée de calcul : la date de naissance devient un âge. */
function toBodyProfile(profile: Profile) {
  return {
    sex: profile.sex,
    ageYears: ageInYears(profile.birthDate),
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activity: profile.activity,
    goal: profile.goal,
    ratePercentPerWeek: profile.ratePercentPerWeek,
    ...(profile.bodyFatPercent === null ? {} : { bodyFatPercent: profile.bodyFatPercent }),
    ...(profile.manualTargetKcal === null
      ? {}
      : { manualTargetKcal: profile.manualTargetKcal }),
  };
}

/**
 * La cible d'un utilisateur, ou `null` s'il n'a pas rempli le questionnaire.
 * Le journal doit rester consultable sans profil : l'objectif est un confort,
 * pas une condition d'usage.
 */
export async function targetFor(
  userId: number,
  day: string = todayInParis(),
): Promise<EnergyTarget | null> {
  const profile = await findProfile(userId);
  if (!profile) {
    return null;
  }
  const body = toBodyProfile(profile);
  if (!isValidBodyProfile(body)) {
    return null;
  }

  const cycle = await trainingCycleFor(userId, day);

  // La cible fixée à la main n'a besoin d'aucune mesure : inutile d'aller
  // chercher une dépense que le calcul n'utilisera pas. Elle suit quand même
  // l'entraînement : c'est la moyenne de la semaine qu'on a fixée à la main.
  if (profile.manualTargetKcal !== null) {
    return computeEnergyTarget(body, undefined, cycle);
  }

  const baseline = await activityBaseline(userId, day, ACTIVITY_WINDOW_DAYS);
  return baseline.dayCount >= MIN_MEASURED_DAYS
    ? computeEnergyTarget(body, baseline.typicalActiveKcal, cycle)
    : computeEnergyTarget(body, undefined, cycle);
}

/**
 * État du pont Santé, pour l'écran de réglages. Les seuils viennent d'ici et
 * non de l'écran : une valeur recopiée dans l'interface se désynchroniserait
 * du calcul à la première modification.
 */
export async function bridgeStatus(userId: number) {
  const [baseline, last] = await Promise.all([
    activityBaseline(userId, todayInParis(), ACTIVITY_WINDOW_DAYS),
    lastActivity(userId),
  ]);

  return {
    lastDay: last?.day ?? null,
    lastKcal: last?.activeKcal ?? null,
    dayCount: baseline.dayCount,
    typicalKcal: baseline.typicalActiveKcal,
    peakKcal: baseline.maxActiveKcal,
    requiredDays: MIN_MEASURED_DAYS,
  };
}

export function profileFor(userId: number): Promise<Profile | null> {
  return findProfile(userId);
}

export type SaveProfileResult =
  | { kind: 'saved'; target: EnergyTarget }
  | { kind: 'invalid' };

/**
 * Enregistre un profil après contrôle des bornes.
 * La cible est renvoyée dans la foulée : c'est la réponse à la question que
 * l'utilisateur vient de poser en remplissant le questionnaire.
 */
export async function recordProfile(
  userId: number,
  profile: Profile,
): Promise<SaveProfileResult> {
  const body = toBodyProfile(profile);
  if (!isValidBodyProfile(body)) {
    return { kind: 'invalid' };
  }
  await saveProfile(userId, profile);
  // Le poids du questionnaire est aussi une pesée : sans cela, la courbe
  // commencerait à la première pesée faite ailleurs, et le poids de départ
  // manquerait.
  await upsertWeighIn(userId, todayInParis(), profile.weightKg);

  // La cible est relue plutôt que recalculée sur place : `targetFor` tient
  // compte de la dépense mesurée, ce que ne faisait pas l'ancien appel direct.
  // Le formulaire affichait donc une cible qui n'était pas celle du journal.
  const target = await targetFor(userId);
  // Le profil vient d'être écrit après validation : ce cas ne se produit pas.
  return target === null ? { kind: 'invalid' } : { kind: 'saved', target };
}

export type RecordWeighInResult = { kind: 'saved'; profileUpdated: boolean } | { kind: 'invalid' };

/** Enregistre la pesée du jour et la reporte sur le profil. */
export async function recordWeighIn(userId: number, weightKg: number): Promise<RecordWeighInResult> {
  if (!isValidWeighIn(weightKg)) {
    return { kind: 'invalid' };
  }
  const rounded = Math.round(weightKg * 10) / 10;
  await upsertWeighIn(userId, todayInParis(), rounded);
  return { kind: 'saved', profileUpdated: await updateProfileWeight(userId, rounded) };
}

/** Le poids moyen des `weeks` dernières semaines, lundi en tête. */
export async function weightHistory(userId: number, weeks: number): Promise<WeekWeight[]> {
  const today = todayInParis();
  const since = shiftDate(today, -7 * weeks);
  return weeklyWeights(await listWeighIns(userId, since), weeks, today);
}
