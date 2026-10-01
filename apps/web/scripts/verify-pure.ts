/**
 * Vérification des fonctions pures du domaine.
 * Seule partie des critères d'acceptation testable sans base (voir B-2).
 * Lancement : npx tsx scripts/verify-pure.ts
 */
import assert from 'node:assert/strict';
import { scaleMacros, isValidQuantity, isCompleteMacros, sumMacros } from '../src/lib/nutrition';
import {
  todayInParis,
  isJournalDate,
  formatRelativeJournalDate,
  ageInYears,
} from '../src/lib/date';
import { buildQuantityShortcuts } from '../src/lib/shortcuts';
import { parseItems } from '../src/lib/vision-parse';
import { FREE_RECIPE_LIMIT, grantsPremium, parseStoreState, underFreeLimit } from '../src/lib/premium';
import { isValidBarcode } from '../src/lib/client/scanner';
import { mapColumns, parseNutrient, isCompleteRow, normalizeHeader } from './ciqual-parse';
import {
  computeEnergyTarget,
  mifflinStJeor,
  katchMcArdle,
  isValidBodyProfile,
  MAX_ACTIVE_KCAL_PER_BMR,
  trainingShift,
  type BodyProfile,
} from '../src/lib/energy';
import { weeklyWeights, weightChange } from '../src/lib/weight';
import { USAGE_EVENTS, entryMethod, mealEvent } from '../src/lib/usage';
import {
  cleanDisplayName,
  isSessionVisibility,
  isValidHandle,
  normalizeHandle,
  personLabel,
} from '../src/lib/social';
import { parseFavoriteItems, suggestFavoriteName, favoriteTotals } from '../src/lib/favorites';
import {
  cookingYield,
  formatIngredientQuantity,
  formatServings,
  ingredientsForServings,
  portionWeight,
  rawGrams,
  suggestedServings,
  macrosPerServing,
  quantityForServings,
  recipeMacros,
  shoppingUnitCount,
  stepDurationSeconds,
  type RecipeIngredient,
} from '../src/lib/recipe';
import {
  formatShareableRecipe,
  formatShareableRecipes,
  shareableRecipesTitle,
  type ShareableRecipe,
} from '../src/lib/share-recipes';
import { aisleFor } from '../src/lib/aisle';
import { startOfWeek, daysFrom, shiftDate, formatWeekRange } from '../src/lib/date';
import {
  aggregateNeeds,
  bestMatch,
  matchScore,
  ingredientKey,
  planListSync,
  type SyncableItem,
} from '../src/lib/shopping';
import type { ShoppingNeed } from '../src/lib/shopping';
import { detectPlatform } from '../src/lib/install';
import {
  bestSet,
  formatClock,
  formatPrescription,
  formatSet,
  groupBySuperset,
  habitualSwaps,
  parseSwaps,
  restSecondsFor,
  suggestLoad,
  resolveSessionExercises,
  composedFromSets,
  composedToPrescription,
  defaultComposed,
  sessionVolume,
  setVolume,
  swapCandidates,
  type Exercise,
  type TemplateExercise,
} from '../src/lib/workout';
import {
  bestExerciseMatch,
  normalizeExerciseName,
  parseWorkoutLog,
  slugFromName,
} from '../src/lib/workout-log';
import { buildProgram } from '../src/lib/workout-plan';
import {
  beatsPersonalBest,
  estimatedOneRepMax,
  exerciseProgress,
  formatChange,
  formatMetric,
  personalBest,
  progressMetric,
  weeklyTotals,
  type ProgressSet,
} from '../src/lib/workout-progress';
import { gymInventory, SEED_EXERCISES, SEED_GYMS } from '../src/lib/workout-seed';
import {
  demoSearchUrl,
  illustrationFor,
  ILLUSTRATION_SOURCES,
} from '../src/lib/exercise-media';

// FR-10 : 250 kcal/100 g sur 150 g donne 375 kcal.
const per100g = { kcal: 250, proteinG: 12, carbsG: 30, fatG: 8 };
const scaled = scaleMacros(per100g, 150);
assert.equal(scaled.kcal, 375, 'prorata kcal');
assert.equal(scaled.proteinG, 18, 'prorata proteines');
assert.equal(scaled.carbsG, 45, 'prorata glucides');
assert.equal(scaled.fatG, 12, 'prorata lipides');

// FR-8 : bornes de quantité.
assert.equal(isValidQuantity(0), false, 'quantite nulle refusee');
assert.equal(isValidQuantity(-5), false, 'quantite negative refusee');
assert.equal(isValidQuantity(1.5), false, 'quantite non entiere refusee');
assert.equal(isValidQuantity(5000), false, 'borne haute exclue');
assert.equal(isValidQuantity(4999), true, 'juste sous la borne accepte');
assert.equal(isValidQuantity(1), true, 'un gramme accepte');

// FR-6 : détection d'une fiche incomplète.
assert.equal(isCompleteMacros({ kcal: 10, proteinG: 1, carbsG: 2, fatG: 3 }), true);
assert.equal(isCompleteMacros({ kcal: 10, proteinG: 1, carbsG: 2 }), false, 'lipides manquants');

// AD-9 : les sommes ne dérivent pas.
const total = sumMacros(Array.from({ length: 10 }, () => scaleMacros({ kcal: 0.1, proteinG: 0, carbsG: 0, fatG: 0 }, 100)));
assert.equal(total.kcal, 1, 'somme de dixiemes exacte');

// AD-11 : la date du journal suit Europe/Paris, pas UTC.
// 2026-01-15T23:30 heure de Paris vaut 22:30 UTC : meme jour.
assert.equal(todayInParis(new Date('2026-01-15T22:30:00Z')), '2026-01-15', 'hiver, avant minuit Paris');
// 2026-01-15T23:30 UTC vaut 00:30 le 16 a Paris : jour suivant.
assert.equal(todayInParis(new Date('2026-01-15T23:30:00Z')), '2026-01-16', 'hiver, apres minuit Paris');
// Ete : 2026-07-15T22:30 UTC vaut 00:30 le 16 a Paris.
assert.equal(todayInParis(new Date('2026-07-15T22:30:00Z')), '2026-07-16', 'ete, decalage de deux heures');

assert.equal(isJournalDate('2026-02-30'), false, 'date inexistante refusee');
assert.equal(isJournalDate('2026-02-28'), true, 'date reelle acceptee');
assert.equal(formatRelativeJournalDate('2026-09-10', '2026-09-10'), "Aujourd'hui");
assert.equal(formatRelativeJournalDate('2026-09-09', '2026-09-10'), 'Hier');

// FR-9 : ordre fixe portion, quantites recentes, 100 g.
const withServing = buildQuantityShortcuts({ servingSizeG: 125, recentQuantities: [200, 150] });
assert.deepEqual(
  withServing.map((s) => s.grams),
  [125, 200, 150, 100],
  'portion puis recentes puis 100 g',
);
assert.equal(withServing[0]?.label, 'Portion (125 g)', 'la portion porte son libelle complet');

// La plus recente d'abord, et au plus deux quantites recentes.
const manyRecent = buildQuantityShortcuts({ recentQuantities: [200, 150, 80, 60] });
assert.deepEqual(manyRecent.map((s) => s.grams), [200, 150, 100], 'deux recentes au maximum');

// 100 g toujours propose, et jamais en double.
assert.deepEqual(
  buildQuantityShortcuts({ recentQuantities: [100, 150] }).map((s) => s.grams),
  [100, 150],
  '100 g deja recent n apparait qu une fois',
);
assert.deepEqual(
  buildQuantityShortcuts({ servingSizeG: 100 }).map((s) => s.grams),
  [100],
  'portion de 100 g absorbe le raccourci par defaut',
);
assert.deepEqual(buildQuantityShortcuts({}).map((s) => s.grams), [100], '100 g seul par defaut');
assert.deepEqual(
  buildQuantityShortcuts({ servingSizeG: 0 }).map((s) => s.grams),
  [100],
  'une portion nulle est ignoree',
);

// FR-17 : la portion estimee sur la photo passe devant tout le reste.
const estimated = buildQuantityShortcuts({ estimatedG: 182.4, servingSizeG: 125 });
assert.deepEqual(estimated.map((s) => s.grams), [182, 125, 100], 'estimation en tete, arrondie');
assert.equal(estimated[0]?.label, 'Estimé (182 g)', 'l estimation porte son libelle');
assert.deepEqual(
  buildQuantityShortcuts({ estimatedG: null }).map((s) => s.grams),
  [100],
  'sans estimation, rien ne change',
);

// FR-17 : lecture des reponses du modele de vision.
assert.deepEqual(
  parseItems('{"aliments": [{"nom": "riz cuit", "grammes": 150}, {"nom": "poulet rôti", "grammes": 120}]}'),
  [
    { name: 'riz cuit', grams: 150 },
    { name: 'poulet rôti', grams: 120 },
  ],
  'forme demandee',
);
assert.deepEqual(
  parseItems('{"foods": [{"name": "rice", "grams": "200"}]}'),
  [{ name: 'rice', grams: 200 }],
  'cles anglaises et masse en texte : une reponse juste n est plus une liste vide',
);
assert.deepEqual(
  parseItems('```json\n["riz cuit", "carotte"]\n```'),
  [
    { name: 'riz cuit', grams: null },
    { name: 'carotte', grams: null },
  ],
  'ancienne forme, tableau de noms dans un bloc de code',
);
assert.deepEqual(
  parseItems('{"aliments": [{"nom": "riz", "grammes": 100}, {"nom": "Riz", "grammes": 50}, 42]}'),
  [{ name: 'riz', grams: 150 }],
  'doublons additionnes, entree aberrante ecartee',
);
assert.deepEqual(
  parseItems('{"aliments": [{"nom": "pâtes", "grammes": 9000}, {"nom": "sel", "grammes": -2}]}'),
  [
    { name: 'pâtes', grams: null },
    { name: 'sel', grams: null },
  ],
  'masse absurde ignoree, le nom reste',
);
assert.deepEqual(parseItems('{"aliments": []}'), [], 'assiette vide');
assert.equal(parseItems('desole, je ne vois rien'), null, 'texte libre illisible');
assert.equal(parseItems(''), null, 'reponse vide illisible');

// Freemium : qui a acces aux fonctions payantes.
const billingNow = new Date('2026-10-01T12:00:00Z');
const nextMonth = new Date('2026-11-01T12:00:00Z');
const lastMonth = new Date('2026-09-01T12:00:00Z');
assert.equal(parseStoreState('SUBSCRIPTION_STATE_IN_GRACE_PERIOD'), 'in_grace_period', 'prefixe Google retire');
assert.equal(parseStoreState('SUBSCRIPTION_STATE_NOUVEAU'), 'unspecified', 'etat inconnu');
assert.equal(parseStoreState(undefined), 'unspecified', 'etat absent');
assert.equal(grantsPremium('active', nextMonth, billingNow), true, 'actif avant echeance');
assert.equal(grantsPremium('canceled', nextMonth, billingNow), true, 'resilie : paye jusqu a l echeance');
assert.equal(grantsPremium('in_grace_period', nextMonth, billingNow), true, 'delai de grace');
assert.equal(grantsPremium('active', lastMonth, billingNow), false, 'echeance passee');
assert.equal(grantsPremium('active', null, billingNow), false, 'sans echeance');
assert.equal(grantsPremium('on_hold', nextMonth, billingNow), false, 'suspendu');
assert.equal(grantsPremium('pending', nextMonth, billingNow), false, 'paiement en attente');
assert.equal(grantsPremium('expired', nextMonth, billingNow), false, 'expire');
assert.equal(underFreeLimit(FREE_RECIPE_LIMIT - 1, FREE_RECIPE_LIMIT), true, 'une place gratuite');
assert.equal(underFreeLimit(FREE_RECIPE_LIMIT, FREE_RECIPE_LIMIT), false, 'limite atteinte');

// FR-16 : un code-barres exploitable fait 8, 12 ou 13 chiffres.
assert.equal(isValidBarcode('3017620422003'), true, 'EAN-13');
assert.equal(isValidBarcode('40822938'), true, 'EAN-8');
assert.equal(isValidBarcode('036000291452'), true, 'UPC-A');
assert.equal(isValidBarcode('12345'), false, 'trop court');
assert.equal(isValidBarcode('123456789012345'), false, 'trop long');
assert.equal(isValidBarcode('30176204220O3'), false, 'lettre refusee');
assert.equal(isValidBarcode(''), false, 'chaine vide refusee');

// FR-6 : normalisation des valeurs du CSV ANSES.
assert.equal(parseNutrient('12,5'), 12.5, 'virgule decimale');
assert.equal(parseNutrient('1 234,5'), 1234.5, 'espace insecable de milliers');
assert.equal(parseNutrient('traces'), 0, 'traces valent zero');
assert.equal(parseNutrient('< 0,1'), 0, 'inferieur a un seuil vaut zero');
assert.equal(parseNutrient('-'), null, 'tiret vaut inconnu');
assert.equal(parseNutrient(''), null, 'vide vaut inconnu');
assert.equal(parseNutrient('nd'), null, 'non determine vaut inconnu');
assert.equal(parseNutrient(undefined), null, 'colonne absente vaut inconnu');
assert.equal(parseNutrient('abc'), null, 'texte non numerique vaut inconnu');
assert.equal(parseNutrient('539'), 539, 'entier simple');

// FR-6 : un aliment incomplet est importe mais exclu de la recherche.
assert.equal(isCompleteRow({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 }), true);
assert.equal(isCompleteRow({ kcal: 539, protein: null, carbs: 57.5, fat: 30.9 }), false);
assert.equal(isCompleteRow({ kcal: 0, protein: 0, carbs: 0, fat: 0 }), true, 'zero reste complet');

// Les en-tetes varient d'un millesime a l'autre : accents et casse ignores.
assert.equal(normalizeHeader('  Energie, Règlement UE  '), 'energie, reglement ue');
const headers = [
  'alim_code',
  'alim_nom_fr',
  'Energie, Règlement UE N° 1169/2011 (kcal/100 g)',
  'Protéines, N x facteur de Jones (g/100 g)',
  'Glucides (g/100 g)',
  'Lipides (g/100 g)',
];
const mapped = mapColumns(headers);
assert.equal(mapped.ok, true, 'en-tetes ANSES reconnus');
if (mapped.ok) {
  assert.equal(mapped.columns.code, 'alim_code');
  assert.equal(mapped.columns.kcal, 'Energie, Règlement UE N° 1169/2011 (kcal/100 g)');
  assert.equal(mapped.columns.protein, 'Protéines, N x facteur de Jones (g/100 g)');
}
const incompleteHeaders = mapColumns(['alim_code', 'alim_nom_fr']);
assert.equal(incompleteHeaders.ok, false, 'colonnes manquantes signalees');

// --- Besoin energetique (questionnaire) ---
// Attendus calcules a la main, equation par equation.

// Mifflin-St Jeor : 10x80 + 6,25x180 - 5x30 + 5 = 1780.
assert.equal(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 }), 1780);
// Femme : la meme expression moins 161 au lieu de plus 5.
assert.equal(mifflinStJeor({ sex: 'female', weightKg: 60, heightCm: 165, ageYears: 40 }), 1270.25);
// Katch-McArdle : 370 + 21,6 x 68 kg de masse maigre.
assert.ok(Math.abs(katchMcArdle(80, 15) - 1838.8) < 1e-9, 'Katch-McArdle a la virgule pres');

const baseProfile: BodyProfile = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  activity: 'moderate',
  goal: 'lose',
  ratePercentPerWeek: 0.5,
};

// Perte de 0,5 % de 80 kg par semaine : 400 g, soit 3080 kcal, soit 440 par jour.
const cut = computeEnergyTarget(baseProfile);
assert.equal(cut.bmrKcal, 1780, 'metabolisme de base');
assert.equal(cut.maintenanceKcal, 2759, 'depense totale a 1,55');
assert.equal(cut.adjustmentKcal, -440, 'ecart quotidien');
assert.equal(cut.targetKcal, 2319, 'cible en deficit');
assert.equal(cut.floored, false, 'aucun plancher ne mord ici');
assert.equal(cut.equation, 'mifflin-st-jeor');
assert.equal(cut.proteinG, 160, 'proteines a 2 g/kg en deficit');
assert.equal(cut.fatG, 64.4, 'lipides a 25 % des calories');
assert.equal(cut.carbsG, 274.8, 'glucides en reste');

// La somme des macros redonne la cible, a l'arrondi pres.
const recomposed = cut.proteinG * 4 + cut.carbsG * 4 + cut.fatG * 9;
assert.ok(Math.abs(recomposed - cut.targetKcal) < 2, 'les macros somment a la cible');

// Maintien : aucun ecart, la cible est la depense.
const maintain = computeEnergyTarget({
  ...baseProfile,
  sex: 'female',
  weightKg: 60,
  heightCm: 165,
  ageYears: 40,
  activity: 'sedentary',
  goal: 'maintain',
  ratePercentPerWeek: 0,
});
assert.equal(maintain.adjustmentKcal, 0, 'pas d ecart en maintien');
assert.equal(maintain.targetKcal, 1524, 'cible de maintien');

// Prise de masse : l'ecart est positif.
const bulk = computeEnergyTarget({
  ...baseProfile,
  weightKg: 75,
  heightCm: 178,
  ageYears: 25,
  activity: 'active',
  goal: 'gain',
  ratePercentPerWeek: 0.25,
});
assert.equal(bulk.adjustmentKcal, 206, 'surplus quotidien');
assert.equal(bulk.targetKcal, 3212, 'cible en prise');
assert.ok(bulk.targetKcal > bulk.maintenanceKcal, 'la prise depasse la depense');

// Plancher : un rythme trop ambitieux passerait sous le minimum clinique.
const floored = computeEnergyTarget({
  ...baseProfile,
  sex: 'female',
  weightKg: 50,
  heightCm: 160,
  activity: 'sedentary',
  goal: 'lose',
  ratePercentPerWeek: 1,
});
assert.equal(floored.targetKcal, 1200, 'cible relevee au plancher feminin');
assert.equal(floored.floored, true, 'le rythme demande est signale inatteignable');
assert.ok(floored.targetKcal > floored.bmrKcal, 'jamais sous le metabolisme de base');

// Masse grasse connue : Katch-McArdle et proteines sur la masse maigre.
const withBodyFat = computeEnergyTarget({ ...baseProfile, bodyFatPercent: 15 });
assert.equal(withBodyFat.equation, 'katch-mcardle', 'equation basculee');
assert.equal(withBodyFat.bmrKcal, 1839, 'metabolisme sur la masse maigre');
assert.equal(withBodyFat.proteinG, 163.2, 'proteines a 2,4 g/kg de masse maigre');

// Dépense mesurée : modèle additif, le facteur déclaré est ignoré.
// 1780 de base plus 900 mesurées font 2680, contre 2759 avec le facteur 1,55.
const measured = computeEnergyTarget(baseProfile, 900);
assert.equal(measured.maintenanceKcal, 2680, 'base plus depense mesuree');
assert.equal(measured.basis, 'measured', 'origine mesuree');
assert.equal(measured.targetKcal, 2240, 'cible sur depense mesuree');
assert.equal(cut.basis, 'declared', 'origine declaree sans mesure');

// Une mesure nulle reste une mesure : un jour sans bouger ne bascule pas sur
// le facteur déclaré, sans quoi l'immobilité augmenterait la cible.
const still = computeEnergyTarget(baseProfile, 0);
assert.equal(still.maintenanceKcal, 1780, 'depense nulle prise au mot');
assert.equal(still.basis, 'measured');

// Dépense mesurée aberrante : le pont Santé a déjà remonté une journée à
// 10 773 kcal actives. Sans plafond, la cible d'un homme de 90 kg qui veut
// maigrir montait à plus de quatre mille kilocalories.
const absurd = computeEnergyTarget(
  { ...baseProfile, weightKg: 90.4, heightCm: 179, ageYears: 21, ratePercentPerWeek: 1 },
  10773,
);
assert.equal(absurd.activityCapped, true, 'la mesure aberrante est signalee');
// Le plafond porte sur le metabolisme non arrondi : la comparaison tolere donc
// le kilocalorie d'ecart que l'arrondi du rendu introduit.
assert.ok(
  Math.abs(absurd.maintenanceKcal - absurd.bmrKcal * (1 + MAX_ACTIVE_KCAL_PER_BMR)) <= 1,
  'la depense est ramenee au plafond physiologique',
);
assert.ok(absurd.targetKcal < 4000, 'la cible ne depasse plus le raisonnable');

// Sous le plafond, rien ne change : la mesure est prise telle quelle.
assert.equal(measured.activityCapped, false, 'une mesure plausible n est pas plafonnee');

// Le plafond suit le metabolisme de base et non une constante : il vaut 1,5 fois
// celui-ci, soit 2670 kcal actives pour le profil de reference.
const atCeiling = computeEnergyTarget(baseProfile, 1780 * MAX_ACTIVE_KCAL_PER_BMR);
assert.equal(atCeiling.activityCapped, false, 'le plafond lui-meme reste accepte');
assert.equal(atCeiling.maintenanceKcal, 4450, 'depense au plafond');

// Cible fixee a la main : elle remplace le calcul, planchers et objectif compris.
const manual = computeEnergyTarget({ ...baseProfile, manualTargetKcal: 2200 });
assert.equal(manual.targetKcal, 2200, 'la cible manuelle est rendue telle quelle');
assert.equal(manual.basis, 'manual', 'origine manuelle');
assert.equal(manual.floored, false, 'aucun plancher sur une cible choisie');
assert.equal(manual.adjustmentKcal, 2200 - manual.maintenanceKcal, 'ecart obtenu, non demande');

// Les macronutriments sont repartis sur la cible manuelle, pas sur la calculee.
const manualRecomposed = manual.proteinG * 4 + manual.carbsG * 4 + manual.fatG * 9;
assert.ok(Math.abs(manualRecomposed - 2200) < 2, 'les macros somment a la cible manuelle');

// La mesure reste affichee sous une cible manuelle : l'utilisateur doit voir
// l'ecart qu'il se donne, meme s'il ne decide plus rien.
const manualMeasured = computeEnergyTarget({ ...baseProfile, manualTargetKcal: 2200 }, 900);
assert.equal(manualMeasured.maintenanceKcal, 2680, 'la depense mesuree reste calculee');
assert.equal(manualMeasured.adjustmentKcal, -480, 'deficit reel sous cible manuelle');

// Bornes de la cible manuelle : le minimum clinique du sexe declare tient encore.
assert.equal(
  isValidBodyProfile({ ...baseProfile, manualTargetKcal: 1499 }),
  false,
  'sous le plancher masculin refusee',
);
assert.equal(
  isValidBodyProfile({ ...baseProfile, manualTargetKcal: 1500 }),
  true,
  'le plancher masculin lui-meme accepte',
);
assert.equal(
  isValidBodyProfile({ ...baseProfile, sex: 'female', manualTargetKcal: 1200 }),
  true,
  'plancher feminin plus bas',
);
assert.equal(
  isValidBodyProfile({ ...baseProfile, manualTargetKcal: 6001 }),
  false,
  'faute de frappe au-dela du plafond refusee',
);

// Bornes du questionnaire.
assert.equal(isValidBodyProfile(baseProfile), true, 'profil plausible accepte');
assert.equal(isValidBodyProfile({ ...baseProfile, ageYears: 12 }), false, 'age trop bas');
assert.equal(isValidBodyProfile({ ...baseProfile, heightCm: 300 }), false, 'taille invraisemblable');
assert.equal(isValidBodyProfile({ ...baseProfile, weightKg: 0 }), false, 'poids nul');
assert.equal(
  isValidBodyProfile({ ...baseProfile, ratePercentPerWeek: 2 }),
  false,
  'perte de 2 % par semaine refusee',
);
assert.equal(
  isValidBodyProfile({ ...baseProfile, goal: 'gain', ratePercentPerWeek: 1 }),
  false,
  'prise de 1 % par semaine refusee',
);
assert.equal(
  isValidBodyProfile({ ...baseProfile, bodyFatPercent: 90 }),
  false,
  'taux de masse grasse invraisemblable',
);

// L'age se compte sur la date civile : la veille d'un anniversaire ne compte pas.
assert.equal(ageInYears('1996-05-20', '2026-05-19'), 29, 'la veille');
assert.equal(ageInYears('1996-05-20', '2026-05-20'), 30, 'le jour meme');
assert.equal(ageInYears('1996-05-20', '2026-05-21'), 30, 'le lendemain');
assert.equal(ageInYears('1996-12-31', '2026-01-01'), 29, 'anniversaire en fin d annee');
// Un 29 fevrier tombe le 1er mars les annees non bissextiles.
assert.equal(ageInYears('2000-02-29', '2026-02-28'), 25, '29 fevrier, avant le 1er mars');
assert.equal(ageInYears('2000-02-29', '2026-03-01'), 26, '29 fevrier, apres le 1er mars');

// --- Recettes et liste de courses ---

// Une recette de 4 parts a 600 kcal : la part en vaut 150.
const riz: RecipeIngredient = {
  id: 1,
  position: 0,
  refKind: 'ciqual',
  refValue: '9999',
  label: 'Riz',
  cookedYield: null,
  quantityG: 200,
  unitName: null,
  unitGrams: null,
  per100g: { kcal: 200, proteinG: 4, carbsG: 44, fatG: 0.4 },
};
const oeufs: RecipeIngredient = {
  id: 2,
  position: 1,
  refKind: 'ciqual',
  refValue: '8888',
  label: 'Oeufs',
  cookedYield: null,
  quantityG: 100,
  unitName: 'oeuf',
  unitGrams: 50,
  per100g: { kcal: 200, proteinG: 13, carbsG: 0.7, fatG: 10 },
};

const totalRecette = recipeMacros([riz, oeufs]);
assert.equal(totalRecette.macros.kcal, 600, 'total de la recette');
assert.equal(totalRecette.unresolvedCount, 0, 'tout est resolu');

const recette = {
  id: 1,
  name: 'Riz aux oeufs',
  servings: 4,
  steps: [],
  prepMinutes: null,
  notes: null,
  ingredients: [riz, oeufs],
  imageUrl: null,
};
assert.equal(macrosPerServing(recette).macros.kcal, 150, 'kcal par part');

// Un ingredient sans fiche est exclu du total, et compte a part : un total
// silencieusement ampute serait pire qu'un total annonce comme incomplet.
const inconnu: RecipeIngredient = { ...riz, id: 3, per100g: null };
const partiel = recipeMacros([riz, inconnu]);
assert.equal(partiel.macros.kcal, 400, 'l ingredient sans fiche ne compte pas');
assert.equal(partiel.unresolvedCount, 1, 'l ingredient sans fiche est signale');

// La mise a l'echelle rend des grammes entiers : isValidQuantity les exige.
assert.equal(quantityForServings(200, 4, 1), 50, 'un quart de 200 g');
assert.equal(quantityForServings(200, 3, 1), 67, 'un tiers de 200 g, arrondi');
assert.equal(isValidQuantity(quantityForServings(200, 3, 1)), true, 'quantite journalisable');
// Une epice pesee au gramme sur six parts ne doit pas disparaitre.
assert.equal(quantityForServings(1, 6, 1), 1, 'plancher a 1 g');

// La fiche et la liste de courses doivent annoncer le meme gramme : elles
// passent par la meme fonction, et cette egalite le verifie ingredient par
// ingredient. C'est le coeur du probleme qu'on corrige — une recette de quatre
// parts mise au panier pour six annoncait 200 g de riz et en faisait acheter
// 300.
const fournee = ingredientsForServings(recette.ingredients, recette.servings, 6);
assert.deepEqual(
  fournee.map((ingredient) => ingredient.quantityG),
  recette.ingredients.map((ingredient) =>
    quantityForServings(ingredient.quantityG, recette.servings, 6),
  ),
  'la fiche et la liste de courses comptent pareil',
);
assert.equal(fournee[0]?.quantityG, 300, 'six parts d une recette qui en fait quatre');
assert.equal(fournee[1]?.quantityG, 150, 'les oeufs suivent la meme echelle');
// Tout le reste de l'ingredient est intact : mettre a l'echelle ne transforme
// pas un oeuf en autre chose, et l'unite usuelle doit survivre au calcul.
assert.equal(fournee[1]?.unitName, 'oeuf', 'l unite usuelle survit');
assert.equal(fournee[1]?.label, 'Oeufs', 'le libelle survit');
assert.equal(fournee[1]?.refValue, '8888', 'la reference survit');
// Les parts du panier vont par demies : la mise a l'echelle doit les suivre.
assert.equal(
  ingredientsForServings(recette.ingredients, recette.servings, 0.5)[0]?.quantityG,
  25,
  'une demi-part',
);
// Une fournee egale a la recette ne bouge pas d'un gramme.
assert.deepEqual(
  ingredientsForServings(recette.ingredients, recette.servings, recette.servings),
  recette.ingredients,
  'la recette telle qu ecrite reste elle-meme',
);

// Le nombre de parts s'ecrit pareil partout : panier, fiche et mode cuisine.
assert.equal(formatServings(6), '6 parts', 'pluriel');
assert.equal(formatServings(1), '1 part', 'singulier');
assert.equal(formatServings(0.5), '0,5 part', 'demi-part, virgule francaise');
assert.equal(formatServings(2.5), '2,5 parts', 'deux parts et demie');

// L'unite usuelle s'affiche avec son poids : c'est lui qui explique les macros.
assert.equal(formatIngredientQuantity(oeufs), '2 oeufs (100 g)', 'deux oeufs');
assert.equal(formatIngredientQuantity(riz), '200 g', 'sans unite usuelle');
assert.equal(
  formatIngredientQuantity({ ...oeufs, quantityG: 50 }),
  '1 oeuf (50 g)',
  'un seul oeuf reste au singulier',
);

// On n'achete pas 2,4 oeufs : la liste de courses arrondit au-dessus.
assert.equal(shoppingUnitCount(120, 'oeuf', 50), 3, 'arrondi au superieur');
assert.equal(shoppingUnitCount(100, 'oeuf', 50), 2, 'compte juste');
assert.equal(shoppingUnitCount(200, null, null), null, 'sans unite, rien a compter');

// Le rayon vient du groupe de l'ANSES, sauf pour le froid que le groupe ignore.
assert.equal(aisleFor('Brocoli, cuit', '02'), 'produce', 'legume au rayon frais');
assert.equal(aisleFor('Poulet, cuisse', '04'), 'butcher', 'volaille a la boucherie');
assert.equal(aisleFor('Lait demi-ecreme', '05'), 'dairy', 'lait a la cremerie');
assert.equal(aisleFor('Riz blanc', '03'), 'grocery', 'cereales en epicerie');
// Non-regression : 08 et 09 avaient ete intervertis, et l'huile d'olive se
// rangeait au rayon surgele. Les deux groupes se ressemblent par leur numero
// et par rien d'autre.
assert.equal(aisleFor('Huile d olive vierge extra', '09'), 'grocery', 'matieres grasses');
assert.equal(aisleFor('Peche melba', '08'), 'frozen', 'glaces et sorbets');
// Le zero de tete mange par un tableur ne doit pas deplacer le rayon.
assert.equal(aisleFor('Brocoli', '2'), 'produce', 'code sur un seul chiffre');
// Un legume surgele reste un legume pour l'ANSES, mais pas pour le magasin.
assert.equal(aisleFor('Petits pois surgeles', '02'), 'frozen', 'le froid l emporte');
assert.equal(aisleFor('Epinards surgele', '02'), 'frozen', 'sans accent aussi');
// Un produit a code-barres ne porte aucun groupe : il finit en Divers, ou on
// le retrouve, plutot qu'en epicerie ou on le chercherait longtemps.
assert.equal(aisleFor('Barre proteinee', null), 'other', 'sans groupe connu');

// --- Semaine du plan de repas ---

// La semaine commence le lundi : c'est le jour ou l'on decide de celle qui vient.
assert.equal(startOfWeek('2026-09-15'), '2026-09-14', 'un mardi remonte au lundi');
assert.equal(startOfWeek('2026-09-14'), '2026-09-14', 'un lundi ne bouge pas');
// Le dimanche ferme la semaine, il ne l'ouvre pas : sans quoi le week-end,
// ou se font les courses, serait coupe en deux.
assert.equal(startOfWeek('2026-09-20'), '2026-09-14', 'un dimanche reste dans sa semaine');

// Une semaine fait sept jours consecutifs, changement de mois compris.
const semaine = daysFrom('2026-09-28', 7);
assert.equal(semaine.length, 7, 'sept jours');
assert.equal(semaine[0], '2026-09-28', 'premier jour');
assert.equal(semaine[6], '2026-10-04', 'dernier jour, mois suivant');
// Le passage a l'heure d'hiver ne doit pas produire deux fois le meme jour.
const bascule = daysFrom('2026-10-24', 4);
assert.deepEqual(bascule, ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'], 'changement d heure');

assert.equal(shiftDate('2026-01-01', -1), '2025-12-31', 'recul d une annee');
assert.equal(shiftDate('2026-02-28', 1), '2026-03-01', 'fevrier non bissextile');

// Le mois n'est repete que s'il change : un surtitre lu chaque jour doit rester bref.
assert.equal(formatWeekRange('2026-09-14'), 'du 14 au 20 septembre', 'semaine dans un seul mois');
assert.equal(
  formatWeekRange('2026-09-28'),
  'du 28 septembre au 4 octobre',
  'semaine a cheval sur deux mois',
);

// --- Liste de courses ---

const besoin = (
  refValue: string,
  label: string,
  quantityG: number,
  unitName: string | null = null,
  unitGrams: number | null = null,
): ShoppingNeed => ({
  refKind: 'ciqual', refValue, label, quantityG, unitName, unitGrams, aisle: 'grocery',
});

// L'agregation porte sur la reference, pas sur le nom : deux recettes qui
// ecrivent « Poulet » et « Cuisses de poulet » designent le meme achat.
const cumul = aggregateNeeds([
  besoin('31047', 'Poulet', 300),
  besoin('31047', 'Cuisses de poulet', 200),
  besoin('9999', 'Riz', 150),
]);
assert.equal(cumul.length, 2, 'deux lignes pour trois besoins');
const poulet = cumul.find((n) => n.refValue === '31047')!;
assert.equal(poulet.quantityG, 500, 'les quantites s additionnent');
assert.equal(poulet.label, 'Poulet', 'le premier libelle est retenu');
assert.equal(poulet.sourceCount, 2, 'deux plats le reclament');

// Deux produits differents ne se melangent jamais, meme sous le meme nom.
const distincts = aggregateNeeds([
  besoin('9999', 'Riz', 100),
  { ...besoin('9999', 'Riz', 100), refKind: 'product' },
]);
assert.equal(distincts.length, 2, 'ciqual et produit restent deux lignes');
assert.equal(ingredientKey('ciqual', '9999'), 'ciqual:9999', 'forme de la cle');

// L'unite n'est gardee que si tous les besoins s'accordent : melanger
// « 2 oeufs » et « 100 g d oeuf » donnerait un compte d unites faux.
const memeUnite = aggregateNeeds([
  besoin('8888', 'Oeufs', 100, 'oeuf', 50),
  besoin('8888', 'Oeufs', 150, 'oeuf', 50),
]);
assert.equal(memeUnite[0]?.unitName, 'oeuf', 'unite conservee');
assert.equal(memeUnite[0]?.quantityG, 250, 'quantites cumulees');
const uniteMelangee = aggregateNeeds([
  besoin('8888', 'Oeufs', 100, 'oeuf', 50),
  besoin('8888', 'Oeufs', 150),
]);
assert.equal(uniteMelangee[0]?.unitName, null, 'unites incompatibles : retour aux grammes');

// L'appariement mesure ce que le produit couvre de l'article, pas l'inverse :
// un produit de marque porte des mots que l'article n a pas.
assert.equal(matchScore('Steak hache 5% MG Charal', 'Steak hache 5 %'), 1, 'couverture totale');
assert.ok(matchScore('Riz basmati Taureau Aile', 'Riz') >= 0.5, 'le riz se reconnait');
assert.equal(matchScore('Yaourt nature', 'Steak hache'), 0, 'rien en commun');
// Le pluriel ne doit pas faire manquer l article.
assert.equal(matchScore('Tomates pelees', 'Tomate'), 1, 'pluriel accepte');

const articles = [
  { id: 1, label: 'Steak hache 5 %', checkedAt: null },
  { id: 2, label: 'Riz', checkedAt: null },
  { id: 3, label: 'Tomate', checkedAt: new Date() },
];
assert.equal(bestMatch('Steak hache 5% MG Charal', articles)?.item.id, 1, 'le bon article');
assert.equal(bestMatch('Yaourt nature Danone', articles), null, 'sous le seuil : rien');
// Un article deja coche ne doit pas etre propose : on ne scanne pas deux fois.
assert.equal(bestMatch('Tomates pelees appertisees', articles), null, 'article coche ignore');

// --- Liste de courses qui suit le panier ---

const article = (
  id: number,
  refValue: string,
  label: string,
  quantityG: number,
  extra: Partial<SyncableItem> = {},
): SyncableItem => ({
  id,
  refKind: 'ciqual',
  refValue,
  label,
  quantityG,
  unitName: null,
  unitGrams: null,
  aisle: 'grocery',
  checkedAt: null,
  addedManually: false,
  ...extra,
});

// Monter les parts d un plat remonte la quantite de ses ingredients.
const plusDeParts = planListSync(
  [article(1, '31047', 'Poulet', 300)],
  [{ ...besoin('31047', 'Poulet', 600), sourceCount: 1 }],
);
assert.equal(plusDeParts.update.length, 1, 'la quantite est reprise');
assert.equal(plusDeParts.update[0]?.need.quantityG, 600, 'six cents grammes desormais');
assert.equal(plusDeParts.remove.length, 0, 'rien a retirer');
assert.equal(plusDeParts.insert.length, 0, 'rien a ajouter');

// Un panier inchange n ecrit rien du tout.
const rienNeBouge = planListSync(
  [article(1, '31047', 'Poulet', 300)],
  [{ ...besoin('31047', 'Poulet', 300), sourceCount: 1 }],
);
assert.equal(
  rienNeBouge.update.length + rienNeBouge.insert.length + rienNeBouge.remove.length,
  0,
  'aucune ecriture sur un panier inchange',
);

// Un plat ajoute apporte ses ingredients ; un plat retire remporte les siens.
const platAjoute = planListSync(
  [article(1, '31047', 'Poulet', 300)],
  [
    { ...besoin('31047', 'Poulet', 300), sourceCount: 1 },
    { ...besoin('9999', 'Riz', 200), sourceCount: 1 },
  ],
);
assert.equal(platAjoute.insert.length, 1, 'le riz entre en liste');
assert.equal(platAjoute.insert[0]?.refValue, '9999', 'et c est bien le riz');

const platRetire = planListSync([article(1, '31047', 'Poulet', 300)], []);
assert.deepEqual(platRetire.remove, [1], 'le poulet sort de la liste');

// Ce qui est deja dans le chariot ne disparait jamais : le voir partir ferait
// douter de l avoir pris.
const dejaPris = planListSync([article(1, '31047', 'Poulet', 300, { checkedAt: new Date() })], []);
assert.equal(dejaPris.remove.length, 0, 'un article coche reste, meme devenu inutile');

// Sa quantite, elle, suit le panier : c est la question qu on se pose en rayon.
const prisMaisPlusGrand = planListSync(
  [article(1, '31047', 'Poulet', 300, { checkedAt: new Date() })],
  [{ ...besoin('31047', 'Poulet', 800), sourceCount: 1 }],
);
assert.equal(prisMaisPlusGrand.update[0]?.need.quantityG, 800, 'la quantite suit malgre la coche');

// Ce qu on a ecrit a la main n appartient a aucune recette : on n y touche pas.
const aLaMain = planListSync([article(9, '7777', 'Sacs poubelle', 0, { addedManually: true })], []);
assert.equal(
  aLaMain.update.length + aLaMain.remove.length,
  0,
  'un article ajoute a la main survit a tout',
);

// --- Seances ---

const exo = (
  name: string,
  kind: 'strength' | 'hold' | 'cardio',
  targetSets: number,
  min: number | null,
  max: number | null,
  seconds: number | null = null,
  supersetGroup: number | null = null,
): TemplateExercise => ({
  id: 1, position: 0,
  exercise: {
    id: 1, slug: 'x', name, kind, muscleGroup: null,
    region: 'upper', equipment: 'machine', rank: 1, aliases: [],
  },
  targetSets, targetRepsMin: min, targetRepsMax: max, targetSeconds: seconds,
  supersetGroup, restSeconds: null, notes: null,
});

// La fourchette est conservee : c'est elle qui porte la consigne de progression.
assert.equal(formatPrescription(exo('Couche', 'strength', 4, 8, 10)), '4×8-10', 'fourchette');
assert.equal(formatPrescription(exo('Militaire', 'strength', 3, 10, 10)), '3×10', 'bornes egales');
assert.equal(formatPrescription(exo('Planche', 'hold', 3, null, null, 45)), '3×45 s', 'gainage');
// Un cardio n'a pas de series : « 1x20 min » se lirait comme une erreur.
assert.equal(formatPrescription(exo('Velo', 'cardio', 1, null, null, 1200)), '20 min', 'cardio');

assert.equal(formatSet({ weightKg: 60, reps: 10, seconds: null }), '60 kg × 10', 'charge et reps');
assert.equal(formatSet({ weightKg: null, reps: 12, seconds: null }), '12 reps', 'poids du corps');
assert.equal(formatSet({ weightKg: 0, reps: 12, seconds: null }), '12 reps', 'charge nulle');
assert.equal(formatSet({ weightKg: null, reps: null, seconds: 45 }), '45 s', 'duree');

// Le volume : le tonnage souleve, grossier mais comparable d'une semaine a l'autre.
assert.equal(setVolume({ weightKg: 60, reps: 10 }), 600, 'volume d une serie');
// Une serie au poids du corps compte zero : on ne connait pas le poids du
// corps au moment de la serie, et l'inventer fausserait la comparaison.
assert.equal(setVolume({ weightKg: null, reps: 12 }), 0, 'poids du corps non compte');
assert.equal(
  sessionVolume([
    { weightKg: 60, reps: 10 },
    { weightKg: 60, reps: 9 },
    { weightKg: null, reps: 12 },
  ]),
  1140,
  'volume d une seance',
);

// La charge prime sur les repetitions : monter de 60 a 62,5 kg pour une
// repetition de moins est une progression, l'inverse ne l'est pas.
assert.equal(
  bestSet([
    { weightKg: 60, reps: 10 },
    { weightKg: 62.5, reps: 9 },
  ])?.weightKg,
  62.5,
  'la charge prime',
);
assert.equal(
  bestSet([
    { weightKg: 60, reps: 9 },
    { weightKg: 60, reps: 10 },
  ])?.reps,
  10,
  'a charge egale, les repetitions departagent',
);
assert.equal(bestSet([]), null, 'aucune serie');
assert.equal(bestSet([{ weightKg: null, reps: null }]), null, 'serie vide ignoree');

// Deux exercices qui partagent un numero s'enchainent et se lisent ensemble.
const blocs = groupBySuperset([
  exo('Incline', 'strength', 4, 10, 10),
  exo('Curl', 'strength', 3, 12, 12, null, 1),
  exo('Extension', 'strength', 3, 12, 12, null, 1),
]);
assert.equal(blocs.length, 2, 'deux blocs pour trois exercices');
assert.equal(blocs[0]?.length, 1, 'le premier est seul');
assert.equal(blocs[1]?.length, 2, 'le superset en compte deux');

// Le minuteur du mode cuisine : un nombre suivi d'une unite de temps, et
// rien d'autre. Une heuristique plus large proposerait deux cents minutes sur
// « prechauffer le four a 200 °C », et un minuteur qu'on ne peut pas croire ne
// sert a rien.
assert.equal(stepDurationSeconds('Cuire 8 minutes a feu vif.'), 480, 'minutes');
assert.equal(stepDurationSeconds('Laisser reposer 45 s.'), 45, 'secondes');
assert.equal(stepDurationSeconds('Mijoter 2 h.'), 7200, 'heures');
assert.equal(stepDurationSeconds('Enfourner 25 min.'), 1500, 'abrege');
assert.equal(stepDurationSeconds('Prechauffer le four a 200 °C.'), null, 'une temperature n est pas une duree');
assert.equal(stepDurationSeconds('Melanger le riz aux legumes.'), null, 'aucune duree');
// La premiere duree l'emporte : c'est le premier geste qu'on va faire.
assert.equal(stepDurationSeconds('Cuire 8 minutes, puis 2 minutes de repos.'), 480, 'la premiere duree');

// Detection du contexte d'installation. Elle ne decide que d'un texte d'aide,
// mais se tromper envoie chercher un bouton qui n'existe pas la ou on regarde.
const UA_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const UA_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const UA_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

assert.equal(detectPlatform(UA_IPHONE_SAFARI), 'ios-safari', 'iPhone sous Safari');
// iOS 16.4 a ouvert l'installation aux navigateurs tiers, par leur propre
// menu : envoyer chercher le bouton Partager de Safari serait une impasse.
assert.equal(detectPlatform(UA_IPHONE_CHROME), 'ios-other', 'Chrome sur iPhone');
// La vue web d'Instagram porte aussi « iPhone » : testee en premier, sans quoi
// on ferait chercher un bouton Partager absent de cette barre d'outils.
assert.equal(detectPlatform(UA_INSTAGRAM), 'in-app', 'navigateur integre');
assert.equal(detectPlatform(UA_ANDROID), 'android', 'Android');
assert.equal(detectPlatform(UA_MAC), 'desktop', 'ordinateur de bureau');
// iPadOS 13+ s'annonce « Macintosh » : seul le nombre de points de contact le
// distingue d'un Mac, a qui l'on proposerait un bouton qui ne ferait rien.
assert.equal(detectPlatform(UA_MAC, 5), 'ios-safari', 'iPad recent');
assert.equal(detectPlatform(UA_MAC, 0), 'desktop', 'un Mac reste un Mac');


// --- Seance ecrite a la main ---

// Les trois lignes de l'enonce, telles qu'on les note en salle.
const journal = parseWorkoutLog(
  [
    'Chest press machine 4X12 27.5kg - 20 kg - 27.5 kg - 20 kg',
    'shoulder press machine 3X10 50 - 42.5 - 35',
    'pec deck 2X12 et 1X10 (echec) 6-6-6',
  ].join('\n'),
);

assert.equal(journal.length, 3, 'trois lignes lues');

assert.equal(journal[0]?.name, 'Chest press machine', 'nom avant les series');
assert.equal(journal[0]?.sets.length, 4, '4X12 donne quatre series');
assert.deepEqual(
  journal[0]?.sets.map((set) => set.weightKg),
  [27.5, 20, 27.5, 20],
  'une charge par serie, dans l ordre ecrit',
);
assert.deepEqual(journal[0]?.sets.map((set) => set.reps), [12, 12, 12, 12], 'douze partout');
assert.equal(journal[0]?.warning, 'none', 'ligne sans doute');

assert.deepEqual(
  journal[1]?.sets.map((set) => set.weightKg),
  [50, 42.5, 35],
  'la decimale au point est lue',
);

// Deux groupes sur une ligne, et l'echec ne marque que le second : c'est
// precisement pour cela qu'on ecrit « 2X12 et 1X10 » plutot que « 3 series ».
assert.equal(journal[2]?.sets.length, 3, 'deux groupes font trois series');
assert.deepEqual(journal[2]?.sets.map((set) => set.reps), [12, 12, 10], 'reps par groupe');
assert.deepEqual(
  journal[2]?.sets.map((set) => set.toFailure),
  [false, false, true],
  'l echec ne marque que le groupe qui le precede',
);
assert.deepEqual(journal[2]?.sets.map((set) => set.weightKg), [6, 6, 6], 'trois charges');

// Une charge unique vaut pour toutes les series ; elle se lit sans ambiguite.
const unique = parseWorkoutLog('Leg press 4x10 120kg');
assert.deepEqual(
  unique[0]?.sets.map((set) => set.weightKg),
  [120, 120, 120, 120],
  'une charge unique s applique a toutes',
);

// Un compte de charges qui ne tombe pas juste est un doute, pas une decision :
// on remplit au mieux et on le signale, plutot que de trancher en silence.
const boiteux = parseWorkoutLog('Rowing 4x10 60 - 62.5');
assert.equal(boiteux[0]?.warning, 'weight_count', 'compte de charges signale');
assert.deepEqual(boiteux[0]?.sets.map((set) => set.weightKg), [60, 62.5, 62.5, 62.5], 'complete');

// Le poids du corps : des repetitions, aucune charge.
const tractions = parseWorkoutLog('Tractions 4x8');
assert.deepEqual(
  tractions[0]?.sets.map((set) => set.weightKg),
  [null, null, null, null],
  'sans charge',
);

// « Velo 20 min » est une seance de cardio ecrite comme on la vit.
const cardioLigne = parseWorkoutLog('Velo 20 min');
assert.equal(cardioLigne[0]?.sets.length, 1, 'une seule serie');
assert.equal(cardioLigne[0]?.sets[0]?.seconds, 1200, 'vingt minutes en secondes');
assert.equal(cardioLigne[0]?.name, 'Velo', 'nom sans la duree');

// Une ligne de gainage garde sa duree plutot que des repetitions.
const gainage = parseWorkoutLog('Gainage 3x45s');
assert.equal(gainage[0]?.sets.length, 3, 'trois series de gainage');
assert.equal(gainage[0]?.sets[0]?.seconds, 45, 'duree par serie');
assert.equal(gainage[0]?.sets[0]?.reps, null, 'pas de repetitions sur une duree');

// Une ligne sans series est un titre ou une note : signalee, jamais devinee.
assert.equal(parseWorkoutLog('Seance du lundi')[0]?.warning, 'no_sets', 'ligne sans series');

// Les lignes vides ne produisent rien.
assert.equal(parseWorkoutLog('\n\n  \n').length, 0, 'lignes vides ignorees');

assert.equal(normalizeExerciseName('Développé couché'), 'developpe couche', 'accents retires');
assert.equal(slugFromName('Chest press machine'), 'chest-press-machine', 'slug depuis le nom');

// --- Catalogue et rapprochement ---

/** Le catalogue livre, dote d'identifiants comme la base le ferait. */
const catalogue: Exercise[] = SEED_EXERCISES.map((seed, index) => ({
  id: index + 1,
  slug: seed.slug,
  name: seed.name,
  kind: seed.kind,
  muscleGroup: seed.muscleGroup,
  region: seed.region,
  equipment: seed.equipment,
  rank: seed.rank,
  aliases: seed.aliases,
}));

// Les trois noms de l'enonce sont ceux ecrits sur la machine, en anglais.
// C'est la raison d'etre des alias : sans eux, aucune des trois lignes ne
// retrouverait son exercice.
assert.equal(
  bestExerciseMatch('Chest press machine', catalogue)?.exercise.slug,
  'chest-press',
  'chest press retrouve',
);
assert.equal(
  bestExerciseMatch('shoulder press machine', catalogue)?.exercise.slug,
  'shoulder-press-machine',
  'shoulder press retrouve',
);
assert.equal(bestExerciseMatch('pec deck', catalogue)?.exercise.slug, 'pec-deck', 'pec deck');
assert.equal(
  bestExerciseMatch('leg press', catalogue)?.exercise.slug,
  'presse-a-cuisses',
  'alias en anglais',
);
assert.equal(
  bestExerciseMatch('bench press', catalogue)?.exercise.slug,
  'developpe-couche',
  'bench press',
);
// Un nom qui ne ressemble a rien ne doit pas ramener un exercice au hasard :
// une proposition fausse se valide plus facilement qu'elle ne se corrige.
assert.equal(bestExerciseMatch('zzzz qwerty', catalogue), null, 'aucun rapprochement force');

// --- Inventaire des salles ---

const keepcool = SEED_GYMS.find((gym) => gym.slug === 'keepcool')!;
const inventaireKeepcool = gymInventory(keepcool, SEED_EXERCISES);
assert.ok(!inventaireKeepcool.includes('squat'), 'pas de barre olympique');
assert.ok(inventaireKeepcool.includes('presse-a-cuisses'), 'la presse reste');
// Les halteres sont explicitement rajoutes : sans eux, un club sans barre
// n'aurait plus aucun exercice de biceps.
assert.ok(inventaireKeepcool.includes('curl-biceps'), 'les halteres restent');

const maison = SEED_GYMS.find((gym) => gym.slug === 'maison')!;
const inventaireMaison = gymInventory(maison, SEED_EXERCISES);
assert.ok(inventaireMaison.includes('tractions'), 'le poids du corps reste');
assert.ok(!inventaireMaison.includes('presse-a-cuisses'), 'aucune machine a la maison');

// --- Composition du programme ---

const regionDe = (slug: string) =>
  SEED_EXERCISES.find((exercise) => exercise.slug === slug)?.region ?? null;

// L'orientation reduit l'autre moitie du corps, elle ne la supprime pas :
// « haut du corps » garde un exercice de jambes dans chaque seance, sans quoi
// la preference deviendrait une blessure a retardement.
const haut = buildProgram({
  focus: 'upper',
  equipment: 'any',
  sessionsPerWeek: 3,
  catalog: catalogue,
});
assert.equal(haut.templates.length, 3, 'trois seances');
assert.equal(haut.missingGroups.length, 0, 'aucun groupe laisse de cote');
for (const template of haut.templates) {
  const regions = template.exercises.map((entry) => regionDe(entry.exercise.slug));
  assert.ok(regions.includes('lower'), `du bas dans ${template.name}`);
  assert.ok(
    regions.filter((region) => region === 'upper').length >= 3,
    `le haut domine dans ${template.name}`,
  );
}

const bas = buildProgram({
  focus: 'lower',
  equipment: 'any',
  sessionsPerWeek: 3,
  catalog: catalogue,
});
for (const template of bas.templates) {
  const regions = template.exercises.map((entry) => regionDe(entry.exercise.slug));
  assert.ok(regions.includes('upper'), `du haut dans ${template.name}`);
  assert.ok(
    regions.filter((region) => region === 'lower').length >= 3,
    `le bas domine dans ${template.name}`,
  );
}

// Deux seances par semaine ne se decoupent pas en poussee et tirage : ce
// serait laisser des groupes entiers sans passage.
const deux = buildProgram({
  focus: 'full',
  equipment: 'any',
  sessionsPerWeek: 2,
  catalog: catalogue,
});
assert.equal(deux.templates.length, 2, 'deux seances');
assert.ok(
  deux.templates.some((template) =>
    template.exercises.some((entry) => regionDe(entry.exercise.slug) === 'lower'),
  ),
  'les jambes passent quand meme',
);

// La preference de materiel classe, elle n'exclut pas.
const machines = buildProgram({
  focus: 'full',
  equipment: 'machine',
  sessionsPerWeek: 3,
  catalog: catalogue,
});
const materielMachines = machines.templates.flatMap((template) =>
  template.exercises.map((entry) => entry.exercise.equipment),
);
assert.ok(
  materielMachines.filter((materiel) => materiel === 'machine' || materiel === 'cable').length >
    materielMachines.filter((materiel) => materiel === 'free').length,
  'les machines passent devant',
);

const libres = buildProgram({
  focus: 'full',
  equipment: 'free',
  sessionsPerWeek: 3,
  catalog: catalogue,
});
const materielLibres = libres.templates.flatMap((template) =>
  template.exercises.map((entry) => entry.exercise.equipment),
);
assert.ok(
  materielLibres.filter((materiel) => materiel === 'free').length >
    materielLibres.filter((materiel) => materiel === 'machine').length,
  'les poids libres passent devant',
);

// Un club sans barre ne doit prescrire aucun mouvement a la barre.
const dispoKeepcool = new Set(inventaireKeepcool);
const compact = buildProgram({
  focus: 'full',
  equipment: 'free',
  sessionsPerWeek: 3,
  catalog: catalogue.filter((exercise) => dispoKeepcool.has(exercise.slug)),
});
for (const template of compact.templates) {
  for (const entry of template.exercises) {
    assert.ok(
      dispoKeepcool.has(entry.exercise.slug),
      `${entry.exercise.slug} n est pas dans ce club`,
    );
  }
}

// La rotation doit rester une rotation : commencer les trois seances par le
// meme mouvement reviendrait a n'en avoir qu'une, repetee.
const tetes = haut.templates.map((template) => template.exercises[0]?.exercise.slug);
assert.equal(new Set(tetes).size, tetes.length, 'chaque seance a sa propre tete');

// La composition est deterministe : deux appels de suite doivent donner le
// meme programme, sans quoi regenerer apres un changement d'avis deplacerait
// des exercices sans raison.
const rejoue = buildProgram({
  focus: 'upper',
  equipment: 'any',
  sessionsPerWeek: 3,
  catalog: catalogue,
});
assert.deepEqual(
  rejoue.templates.map((template) => template.exercises.map((entry) => entry.exercise.slug)),
  haut.templates.map((template) => template.exercises.map((entry) => entry.exercise.slug)),
  'composition deterministe',
);

// --- Illustrations ---

// Chaque exercice du catalogue doit avoir sa photo. C'est la verification qui
// compte : un exercice ajoute au catalogue sans illustration passerait
// inapercu jusqu'a ce que quelqu'un touche son nom et n'obtienne rien.
const sansPhoto = SEED_EXERCISES.filter(
  (exercise) => illustrationFor(exercise.slug) === null,
).map((exercise) => exercise.slug);
assert.deepEqual(sansPhoto, [], 'tout exercice du catalogue a une illustration');

// Et reciproquement : une entree qui ne designe plus aucun exercice telecharge
// deux images que personne n'affichera.
const orphelines = Object.keys(ILLUSTRATION_SOURCES).filter(
  (slug) => !SEED_EXERCISES.some((exercise) => exercise.slug === slug),
);
assert.deepEqual(orphelines, [], 'aucune illustration orpheline');

const frames = illustrationFor('chest-press');
assert.deepEqual(
  frames,
  ['/exercices/chest-press/0.jpg', '/exercices/chest-press/1.jpg'],
  'les deux poses du mouvement',
);
// Un exercice cree depuis un import n'a pas de photo, et n'en invente pas.
assert.equal(illustrationFor('machine-inconnue-du-club'), null, 'aucune photo inventee');

// Le lien de demonstration echappe le nom : « Écarté à la poulie » contient
// un accent et des espaces, qui casseraient l'adresse tels quels.
assert.ok(
  demoSearchUrl('Écarté à la poulie').startsWith('https://www.youtube.com/results?search_query='),
  'lien de recherche',
);
assert.ok(!demoSearchUrl('Écarté à la poulie').includes(' '), 'aucune espace dans l adresse');

// L'echec se lit dans la serie affichee : « 6 reps » et « 6 reps a l'echec »
// ne demandent pas la meme charge la semaine suivante.
assert.equal(
  formatSet({ weightKg: 6, reps: 10, seconds: null, toFailure: true }),
  '6 kg × 10 (échec)',
  'echec marque',
);
assert.equal(
  formatSet({ weightKg: 6, reps: 10, seconds: null }),
  '6 kg × 10',
  'sans echec, rien ne s affiche',
);

// --- Progression ---

// Une repetition unique vaut sa charge : c'est le seul maximum mesure.
assert.equal(estimatedOneRepMax(100, 1), 100, '1RM d une serie unique');
assert.equal(estimatedOneRepMax(60, 10), 80, 'Epley a 10 repetitions');
assert.equal(estimatedOneRepMax(null, 10), null, 'sans charge, pas de 1RM');
assert.equal(estimatedOneRepMax(0, 10), null, 'charge nulle, pas de 1RM');

const serie = (
  sessionId: number,
  sessionDate: string,
  weightKg: number | null,
  reps: number | null,
  seconds: number | null = null,
): ProgressSet => ({
  sessionId,
  sessionDate,
  exerciseId: 1,
  weightKg,
  reps,
  seconds,
  toFailure: false,
});

// Une traction se lit en repetitions, jusqu'au jour ou elle est lestee.
assert.equal(progressMetric('strength', [serie(1, '2026-09-01', null, 8)]), 'reps', 'poids du corps');
assert.equal(
  progressMetric('strength', [serie(1, '2026-09-01', null, 8), serie(2, '2026-09-08', 5, 6)]),
  'load',
  'une serie lestee bascule sur la charge',
);
assert.equal(progressMetric('hold', [serie(1, '2026-09-01', 10, 10)]), 'time', 'gainage en duree');

const couche = { id: 1, name: 'Développé couché', kind: 'strength' as const, muscleGroup: 'Pectoraux' };

// 60 x 6 puis 60 x 10 : la charge maximale ne bouge pas, le 1RM estime si.
const progres = exerciseProgress(couche, [
  serie(2, '2026-09-08', 60, 10),
  serie(1, '2026-09-01', 60, 6),
  serie(1, '2026-09-01', 50, 10),
]);
assert.ok(progres !== null, 'progression calculee');
assert.equal(progres.metric, 'load', 'mesure en charge');
assert.deepEqual(
  progres.points.map((point) => point.sessionDate),
  ['2026-09-01', '2026-09-08'],
  'seances dans l ordre chronologique',
);
assert.equal(progres.points[0]!.value, 72, 'meilleur 1RM de la premiere seance');
assert.equal(progres.points[0]!.volume, 860, 'tonnage de la premiere seance');
assert.equal(progres.change, 8, 'ecart sur la periode');
assert.equal(progres.record.sessionId, 2, 'record sur la derniere seance');

// Une seance sans mesure est omise, et non rendue a zero.
const lacunaire = exerciseProgress(couche, [serie(1, '2026-09-01', 60, 8), serie(2, '2026-09-08', null, null)]);
assert.equal(lacunaire?.points.length, 1, 'seance sans mesure omise');
assert.equal(lacunaire?.change, null, 'une seule seance, pas d ecart');
assert.equal(exerciseProgress(couche, []), null, 'aucune seance, aucune progression');

// Les semaines vides restent sur le graphique.
const semaines = weeklyTotals(
  [serie(1, '2026-09-14', 50, 10), serie(1, '2026-09-14', 50, 10), serie(2, '2026-09-01', 40, 10)],
  3,
  '2026-09-17',
);
assert.deepEqual(
  semaines.map((week) => [week.weekStart, week.volume, week.sessions]),
  [
    ['2026-08-31', 400, 1],
    ['2026-09-07', 0, 0],
    ['2026-09-14', 1000, 1],
  ],
  'tonnage par semaine, semaines vides comprises',
);

assert.equal(formatMetric('load', 72.5), '72,5 kg', 'charge formatee');
assert.equal(formatMetric('time', 90), '1 min 30 s', 'duree formatee');
assert.equal(formatChange('reps', -3), '−3 rép.', 'regression signee');
assert.equal(formatChange('load', 0), '=', 'stagnation');

// --- Partage des recettes ---------------------------------------------------

const aPartager: ShareableRecipe = {
  id: 1,
  name: 'Poulet au curry',
  servings: 6,
  prepMinutes: 35,
  notes: '  Meilleur rechauffe le lendemain.  ',
  steps: ['Faire revenir le poulet 5 min', 'Ajouter le riz'],
  ingredients: [
    { label: 'Blanc de poulet', quantityG: 600, unitName: null, unitGrams: null },
    { label: 'Oeuf', quantityG: 100, unitName: 'oeuf', unitGrams: 50 },
  ],
};

const texte = formatShareableRecipe(aPartager);
assert.ok(texte.startsWith('Poulet au curry\n6 parts · 35 min'), 'nom puis parts et duree');
assert.ok(texte.includes('- Blanc de poulet — 600 g'), 'ingredient au poids');
assert.ok(texte.includes('- Oeuf — 2 oeufs (100 g)'), 'ingredient en unites');
assert.ok(texte.includes('1. Faire revenir le poulet 5 min'), 'etapes numerotees');
assert.ok(texte.includes('Note : Meilleur rechauffe le lendemain.'), 'note elaguee');

// Ni macros ni references internes ne sortent : le type ne les porte pas, et
// le texte ne doit pas les reintroduire par une autre porte.
assert.ok(!texte.includes('kcal'), 'aucune macro partagee');

const sansRien = formatShareableRecipe({
  ...aPartager,
  prepMinutes: null,
  notes: '   ',
  steps: [],
});
assert.ok(sansRien.startsWith('Poulet au curry\n6 parts\n'), 'sans duree, les parts seules');
assert.ok(!sansRien.includes('Preparation'), 'aucune etape, aucune rubrique');
assert.ok(!sansRien.includes('Note'), 'note blanche omise');

const second: ShareableRecipe = { ...aPartager, id: 2, name: 'Soupe', servings: 1 };
const ensemble = formatShareableRecipes([aPartager, second], 'du 15 au 21 septembre');
assert.ok(
  ensemble.startsWith('Recettes de la semaine du 15 au 21 septembre'),
  'la semaine ouvre un envoi groupe',
);
assert.ok(ensemble.includes('Soupe\n1 part'), 'la seconde recette suit');
assert.equal(ensemble.split('———').length - 1, 2, 'un separateur par jointure');

// Une seule recette ne parle pas de la semaine : c'est un plat qu'on envoie.
const seule = formatShareableRecipes([second], 'du 15 au 21 septembre');
assert.equal(seule, formatShareableRecipe(second), 'une recette seule part telle quelle');
assert.equal(formatShareableRecipes([], 'du 15 au 21 septembre'), '', 'rien a partager');

assert.equal(shareableRecipesTitle([second], 'du 15 au 21 septembre'), 'Soupe', 'titre du plat');
assert.equal(
  shareableRecipesTitle([aPartager, second], 'du 15 au 21 septembre'),
  'Recettes de la semaine du 15 au 21 septembre',
  'titre de la semaine',
);

// Remplacer un exercice en cours de seance : pec deck occupe, tirage horizontal.
{
  const ex = (
    id: number,
    name: string,
    muscleGroup: string,
    kind: Exercise['kind'] = 'strength',
  ): Exercise => ({
    id,
    slug: `ex-${id}`,
    name,
    kind,
    muscleGroup,
    region: 'upper',
    equipment: 'machine',
    rank: 1,
    aliases: [],
  });
  const pecDeck = ex(1, 'Pec deck reverse', 'epaules');
  const tirage = ex(2, 'Tirage horizontal', 'dos');
  const oiseau = ex(3, 'Oiseau halteres', 'epaules');
  const planche = ex(4, 'Planche', 'abdos', 'hold');
  const catalogue = new Map([pecDeck, tirage, oiseau, planche].map((e) => [e.id, e]));
  const entree = (id: number, position: number, exercise: Exercise): TemplateExercise => ({
    id,
    position,
    exercise,
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 12,
    targetSeconds: null,
    supersetGroup: null,
    restSeconds: null,
    notes: null,
  });
  const prevu = [entree(10, 0, pecDeck), entree(11, 1, oiseau)];

  assert.deepEqual(
    [...parseSwaps(['0:2', 'x', '1:0', '2:abc'])],
    [
      [0, 2],
      [1, 0],
    ],
    'couples valides, 0 garde le prevu',
  );
  // Une seance sans modele : ses series seules disent ce qu'elle contenait.
  const saisie = resolveSessionExercises(
    [],
    [
      { exerciseId: 2, position: 1, setIndex: 1 },
      { exerciseId: 2, position: 1, setIndex: 2 },
      { exerciseId: 4, position: 0, setIndex: 1 },
    ],
    new Map(),
    catalogue,
  );
  assert.deepEqual(
    saisie.map((entry) => [entry.position, entry.exercise.id, entry.targetSets]),
    [
      [0, 4, 1],
      [1, 2, 2],
    ],
    'les rangs hors modele apparaissent, dans l ordre, avec leurs series',
  );
  assert.ok(saisie.every((entry) => entry.id < 0 && entry.locked), 'lignes synthetiques verrouillees');
  const complete = resolveSessionExercises(
    prevu,
    [{ exerciseId: 3, position: 1, setIndex: 1 }, { exerciseId: 2, position: 5, setIndex: 1 }],
    new Map(),
    catalogue,
  );
  assert.equal(complete.length, 3, 'le rang ajoute s ajoute au modele sans rien remplacer');

  assert.deepEqual(
    composedFromSets([
      { exerciseId: 2, position: 1, setIndex: 2, reps: 12, seconds: null },
      { exerciseId: 2, position: 1, setIndex: 1, reps: 10, seconds: null },
      { exerciseId: 4, position: 0, setIndex: 1, reps: null, seconds: 45 },
    ]),
    [
      { exerciseId: 4, sets: 1, reps: null, seconds: 45 },
      { exerciseId: 2, sets: 2, reps: 12, seconds: null },
    ],
    'la seance faite se relit rang par rang, avec la cible la plus haute tenue',
  );
  assert.deepEqual(
    composedToPrescription({ exerciseId: 2, sets: 4, reps: 8, seconds: null }, 'strength'),
    { targetSets: 4, targetRepsMin: 8, targetRepsMax: 8, targetSeconds: null },
    'une cible unique : deux bornes egales',
  );
  assert.equal(
    composedToPrescription({ exerciseId: 9, sets: 3, reps: null, seconds: 1200 }, 'cardio').targetSets,
    1,
    'un cardio n a qu une serie',
  );
  assert.equal(defaultComposed(planche).seconds, 45, 'un gainage se propose en duree');
  assert.equal(defaultComposed(tirage).reps, 10, 'une force se propose en repetitions');

  const garde = resolveSessionExercises(prevu, [], new Map([[0, 0]]), catalogue);
  assert.equal(garde[0]?.exercise.id, 1, 'rang:0 garde l exercice prevu');
  assert.equal(garde[0]?.planned, null, 'rien n est remplace');
  assert.deepEqual([...parseSwaps('3:7')], [[3, 7]], 'une valeur seule');
  assert.equal(parseSwaps(undefined).size, 0, 'rien dans l adresse');

  const intention = resolveSessionExercises(prevu, [], new Map([[0, 2]]), catalogue);
  assert.equal(intention[0]?.exercise.id, 2, 'le tirage prend la place du pec deck');
  assert.equal(intention[0]?.planned?.id, 1, 'on sait ce qui etait prevu');
  assert.equal(intention[0]?.locked, false, 'sans serie, le remplacement se defait');
  assert.equal(intention[0]?.position, 0, 'le rang ne change pas');

  const inscrit = resolveSessionExercises(
    prevu,
    [{ exerciseId: 2, position: 0, setIndex: 1 }],
    new Map(),
    catalogue,
  );
  assert.equal(inscrit[0]?.exercise.id, 2, 'les series font foi, sans adresse');
  assert.equal(inscrit[0]?.locked, true, 'une serie faite fige le remplacement');

  const commence = resolveSessionExercises(
    prevu,
    [{ exerciseId: 1, position: 0, setIndex: 1 }],
    new Map([[0, 2]]),
    catalogue,
  );
  assert.equal(commence[0]?.exercise.id, 1, 'une serie faite sur le prevu l emporte');

  const doublon = resolveSessionExercises(prevu, [], new Map([[0, 3]]), catalogue);
  assert.equal(doublon[0]?.exercise.id, 1, 'pas deux rangs sur le meme exercice');

  const candidats = swapCandidates(pecDeck, [pecDeck, tirage, oiseau, planche], new Set([3]));
  assert.deepEqual(candidats.closest.map((e) => e.id), [], 'l oiseau est deja dans la seance');
  assert.deepEqual(candidats.others.map((e) => e.id), [2], 'une planche ne remplace pas une serie chargee');

  assert.equal(formatClock(65), '1:05', 'minutes et secondes');
  assert.equal(formatClock(3727), '1:02:07', 'au-dela de l heure');
  assert.equal(formatClock(-3), '0:00', 'jamais negatif');
}

// Suggestion de charge : la double progression, d'abord les reps, puis la charge.
{
  const developpe: Exercise = {
    id: 1, slug: 'dc', name: 'Developpe couche', kind: 'strength', muscleGroup: 'pecs',
    region: 'upper', equipment: 'free', rank: 1, aliases: [],
  };
  const prescrit: TemplateExercise = {
    id: 1, position: 0, exercise: developpe, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10,
    targetSeconds: null, supersetGroup: null, restSeconds: null, notes: null,
  };
  const serie = (weightKg: number | null, reps: number) => ({ weightKg, reps, seconds: null });

  assert.equal(suggestLoad(prescrit, []), null, 'rien a proposer sans historique');

  const monte = suggestLoad(prescrit, [serie(60, 10), serie(60, 10), serie(60, 10)]);
  assert.equal(monte?.trend, 'up', 'haut de fourchette partout : on charge');
  assert.equal(monte?.weightKg, 62.5, 'une marche de 2,5 kg');
  assert.equal(monte?.reps, 8, 'on repart du bas de la fourchette');

  const incomplet = suggestLoad(prescrit, [serie(60, 10), serie(60, 10)]);
  assert.equal(incomplet?.trend, 'same', 'toutes les series prescrites doivent y etre');

  const garde = suggestLoad(prescrit, [serie(60, 10), serie(60, 9), serie(60, 8)]);
  assert.equal(garde?.weightKg, 60, 'on garde la charge');
  assert.equal(garde?.reps, 9, 'une repetition de plus que la plus faible');

  const baisse = suggestLoad(prescrit, [serie(60, 6), serie(60, 5), serie(60, 5)]);
  assert.equal(baisse?.trend, 'down', 'aucune serie au bas : trop lourd');
  assert.equal(baisse?.weightKg, 55, 'environ dix pour cent, arrondi a 2,5');

  const leger = suggestLoad(prescrit, [serie(8, 10), serie(8, 10), serie(8, 10)]);
  assert.equal(leger?.weightKg, 9, 'un kilo de marche sous vingt kilos');

  const corps = suggestLoad(prescrit, [serie(null, 7), serie(null, 6), serie(null, 6)]);
  assert.equal(corps?.weightKg, null, 'au poids du corps, pas de charge inventee');
  assert.equal(corps?.reps, 7, 'une repetition de plus');

  const gainage: TemplateExercise = {
    ...prescrit,
    exercise: { ...developpe, kind: 'hold' },
    targetRepsMin: null,
    targetRepsMax: null,
    targetSeconds: 45,
  };
  const tenu = suggestLoad(gainage, [
    { weightKg: null, reps: null, seconds: 45 },
    { weightKg: null, reps: null, seconds: 50 },
    { weightKg: null, reps: null, seconds: 45 },
  ]);
  assert.equal(tenu?.seconds, 55, 'cinq secondes de plus que la meilleure');

  // Le repos suit la prescription quand le programme n'en fixe pas.
  assert.equal(restSecondsFor(prescrit), 150, 'series lourdes : deux minutes et demie');
  assert.equal(restSecondsFor({ ...prescrit, targetRepsMin: 12, targetRepsMax: 15 }), 75, 'isolation');
  assert.equal(restSecondsFor({ ...prescrit, restSeconds: 200 }), 200, 'le reglage l emporte');
  assert.equal(restSecondsFor(gainage), 60, 'gainage : une minute');
  assert.equal(
    restSecondsFor({ ...gainage, exercise: { ...developpe, kind: 'cardio' } }),
    null,
    'le cardio n a pas de repos',
  );

  // Remplacement retenu : deux seances de suite, meme rang, meme remplacant.
  const recent = [
    [{ exerciseId: 9, position: 0 }],
    [{ exerciseId: 9, position: 0 }],
  ];
  assert.equal(habitualSwaps([prescrit], recent).get(0), 9, 'deux fois de suite : habitude');
  assert.equal(habitualSwaps([prescrit], recent.slice(0, 1)).size, 0, 'une fois ne suffit pas');
  assert.equal(
    habitualSwaps([prescrit], [[{ exerciseId: 9, position: 0 }], [{ exerciseId: 8, position: 0 }]]).size,
    0,
    'deux remplacants differents : pas d habitude',
  );
  assert.equal(
    habitualSwaps([prescrit], [[{ exerciseId: 1, position: 0 }], [{ exerciseId: 1, position: 0 }]]).size,
    0,
    'le prevu n est pas un remplacement',
  );

  // Records.
  const avant = personalBest('strength', [serie(60, 8), serie(62.5, 6)]);
  assert.equal(avant?.metric, 'load', 'charge : 1RM estime');
  assert.ok(beatsPersonalBest(avant, serie(62.5, 8)), 'plus de reps a la meme charge : record');
  assert.ok(!beatsPersonalBest(avant, serie(60, 8)), 'egaler n est pas battre');
  assert.equal(personalBest('strength', []), null, 'pas de record sans historique');
  assert.ok(!beatsPersonalBest(null, serie(100, 10)), 'la premiere fois n est pas un record');
  const tractions = personalBest('strength', [serie(null, 8)]);
  assert.equal(tractions?.metric, 'reps', 'au poids du corps : repetitions');
  assert.ok(!beatsPersonalBest(tractions, serie(10, 5)), 'une serie lestee change de mesure');
}

// Cycle calorique : l'entrainement deplace des calories sans en ajouter a la semaine.
{
  const corps: BodyProfile = {
    sex: 'male', ageYears: 30, heightCm: 180, weightKg: 75, activity: 'moderate',
    goal: 'maintain', ratePercentPerWeek: 0,
  };
  const neutre = computeEnergyTarget(corps);
  assert.equal(neutre.cycleKcal, 0, 'sans entrainement suivi, rien ne bouge');
  assert.equal(neutre.trainingDay, null, 'ni jour d entrainement ni jour de repos');

  const seance = computeEnergyTarget(corps, undefined, { trainingDay: true, sessionsPerWeek: 3 });
  const repos = computeEnergyTarget(corps, undefined, { trainingDay: false, sessionsPerWeek: 3 });
  assert.ok(seance.targetKcal > neutre.targetKcal, 'le jour de seance recoit plus');
  assert.ok(repos.targetKcal < neutre.targetKcal, 'le jour de repos cede');
  assert.equal(seance.trainingDay, true, 'jour d entrainement');
  assert.ok(seance.carbsG > neutre.carbsG, 'le supplement va surtout aux glucides');
  assert.equal(seance.proteinG, neutre.proteinG, 'les proteines suivent le poids, pas le jour');

  // 3 x (+171) + 4 x (-129) : la semaine reste a peu pres neutre (arrondis a 10).
  const semaine = 3 * trainingShift(75, { trainingDay: true, sessionsPerWeek: 3 })
    + 4 * trainingShift(75, { trainingDay: false, sessionsPerWeek: 3 });
  assert.ok(Math.abs(semaine) <= 40, `semaine neutre a l arrondi pres (${semaine})`);
  assert.equal(
    trainingShift(75, { trainingDay: true, sessionsPerWeek: 3 })
      - trainingShift(75, { trainingDay: false, sessionsPerWeek: 3 }),
    300,
    'l ecart entre les deux jours vaut le cout de la seance',
  );

  const manuel = computeEnergyTarget(
    { ...corps, manualTargetKcal: 2000 },
    undefined,
    { trainingDay: false, sessionsPerWeek: 5 },
  );
  assert.equal(manuel.targetKcal, 2000 + manuel.cycleKcal, 'la cible manuelle est la moyenne');

  const plancher = computeEnergyTarget(
    { ...corps, sex: 'female', manualTargetKcal: 1200 },
    undefined,
    { trainingDay: false, sessionsPerWeek: 5 },
  );
  assert.equal(plancher.targetKcal, 1200, 'jamais sous le minimum clinique');
  assert.equal(plancher.cycleKcal, 0, 'le plancher annule la part cedee');
}

// Pesees : moyenne par semaine, trous laisses vides.
{
  const semaines = weeklyWeights(
    [
      { day: '2026-09-14', weightKg: 80 },
      { day: '2026-09-16', weightKg: 81 },
      { day: '2026-09-24', weightKg: 79.5 },
    ],
    3,
    '2026-09-27',
  );
  assert.deepEqual(
    semaines.map((week) => week.weekStart),
    ['2026-09-07', '2026-09-14', '2026-09-21'],
    'trois semaines, lundi en tete',
  );
  assert.equal(semaines[0]?.weightKg, null, 'semaine sans pesee : vide');
  assert.equal(semaines[1]?.weightKg, 80.5, 'moyenne de la semaine');
  assert.equal(semaines[1]?.count, 2, 'deux pesees');
  assert.equal(weightChange(semaines), -1, 'ecart premiere-derniere semaine pesee');
  assert.equal(weightChange(semaines.slice(0, 2)), null, 'une seule semaine : pas d ecart');
}

// Favoris : lecture defensive du JSON, nom propose.
{
  const items = parseFavoriteItems([
    {
      foodLabel: 'Flocons d avoine, complets',
      quantityG: 60,
      macros: { kcal: 220, proteinG: 8, carbsG: 36, fatG: 4 },
      sourceKind: 'ciqual',
      sourceRef: '9310',
    },
    {
      foodLabel: 'Skyr',
      quantityG: 150,
      macros: { kcal: 95, proteinG: 16, carbsG: 6, fatG: 0 },
      sourceKind: 'product',
      sourceRef: null,
    },
    { foodLabel: 'Casse', quantityG: 0, macros: {}, sourceKind: 'ciqual', sourceRef: null },
    'nimporte quoi',
  ]);
  assert.equal(items.length, 2, 'les elements abimes sont ecartes');
  assert.equal(suggestFavoriteName(items), 'Flocons d avoine, Skyr', 'les deux plus caloriques');
  assert.equal(favoriteTotals({ items }).kcal, 315, 'total du repas');
  assert.deepEqual(parseFavoriteItems({ pas: 'un tableau' }), [], 'pas un tableau : vide');
}

// --- Cru et cuit, parts et cible ---
{
  assert.equal(cookingYield('Riz blanc, cuit, non sale'), 2.8, 'le riz cuit gonfle');
  assert.equal(cookingYield('Riz complet, cuit'), 2.6, 'le riz complet un peu moins');
  assert.equal(cookingYield('Pates alimentaires cuites'), 2.3, 'les pates');
  assert.equal(cookingYield('pates blanches cuites'), 2.3, 'le terme du catalogue aussi');
  assert.equal(cookingYield('Riz blanc, cru'), null, 'un aliment cru n a pas de rendement');
  assert.equal(cookingYield('Poulet, filet, sans peau, cuit a la poele'), 0.75, 'la viande perd un quart');
  assert.equal(cookingYield('Jambon cuit, decouenne'), null, 'le jambon se vend cuit');
  assert.equal(cookingYield('Pois chiche, cuit'), null, 'les legumineuses en conserve');
  assert.equal(cookingYield('Crevette, cuite'), null, 'les crevettes se vendent cuites');
  assert.equal(cookingYield('Courgette, cuite'), null, 'les legumes ne comptent pas');
  assert.equal(cookingYield(null), null, 'sans nom, rien');
  assert.equal(rawGrams(400, 2.8), 143, '400 g de riz cuit : 143 g cru');
  assert.equal(rawGrams(300, 0.75), 400, '300 g de poulet cuit : 400 g cru');
  assert.equal(rawGrams(150, null), 150, 'sans rendement, le poids ne change pas');
  assert.equal(
    formatIngredientQuantity({ quantityG: 400, unitName: null, unitGrams: null, cookedYield: 2.8 }),
    '143 g cru · ≈ 400 g cuit',
    'le poids a peser d abord, le poids cuit ensuite',
  );

  assert.equal(portionWeight([{ quantityG: 400 }, { quantityG: 300 }], 2), 350, 'une part pese la moitie');
  assert.equal(portionWeight([{ quantityG: 100 }], 3), 35, 'arrondi a cinq grammes');

  assert.equal(suggestedServings(500, 2000, 'dinner'), 1.25, '600 kcal de budget, part de 500');
  assert.equal(suggestedServings(500, 1400, 'dinner'), 0.75, 'cible basse, part reduite');
  assert.equal(suggestedServings(100, 3000, 'lunch'), 3, 'plafond a trois parts');
  assert.equal(suggestedServings(500, null, 'lunch'), null, 'sans cible, rien a proposer');
  assert.equal(suggestedServings(0, 2000, 'lunch'), null, 'sans calories, rien a proposer');
}

// --- Partage des seances ---
{
  assert.equal(normalizeHandle('  @Camille_S '), 'camille_s', 'arobase, espaces et casse retires');
  assert.equal(isValidHandle('camille_s'), true, 'lettres, chiffres et tiret bas');
  assert.equal(isValidHandle('ab'), false, 'trop court');
  assert.equal(isValidHandle('a'.repeat(21)), false, 'trop long');
  assert.equal(isValidHandle('camille.s'), false, 'pas de point');
  assert.equal(isValidHandle('camillé'), false, 'pas d accent');
  assert.equal(cleanDisplayName('  Camille   S. '), 'Camille S.', 'espaces resserres');
  assert.equal(cleanDisplayName('   '), null, 'vide : pas de nom');
  assert.equal(personLabel({ handle: 'cam', displayName: null }), '@cam', 'sans nom, l identifiant');
  assert.equal(personLabel({ handle: 'cam', displayName: 'Camille' }), 'Camille', 'le nom d abord');
  assert.equal(isSessionVisibility('detailed'), true, 'visibilite connue');
  assert.equal(isSessionVisibility('public'), false, 'pas de public : on partage a ses abonnes');
}


// Mesure d'usage : la methode d'une entree, et un evenement de repas toujours dans la liste.
{
  assert.equal(entryMethod('barcode', 'product'), 'barcode', 'la methode declaree l emporte');
  assert.equal(entryMethod(undefined, 'manual'), 'manual', 'sans declaration, saisie libre : manuelle');
  assert.equal(entryMethod(undefined, 'product'), 'search', 'sans declaration, sinon : recherche');
  assert.equal(USAGE_EVENTS.includes(mealEvent('favorite')), true, 'repas favori dans la liste');
  assert.equal(new Set(USAGE_EVENTS).size, USAGE_EVENTS.length, 'aucun evenement en double');
}

console.log('Toutes les verifications pures passent.');
