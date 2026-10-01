/**
 * Recettes : types partagés et calculs purs (AD-8).
 *
 * Une recette n'est pas une entrée de journal, et la différence commande tout
 * ce module. L'entrée fige ses macros parce que le passé ne doit plus bouger
 * (AD-1) ; la recette ne porte que la référence de chaque ingrédient, et ses
 * macros sont recalculées à chaque lecture. Corriger un ingrédient mal saisi
 * doit corriger les repas à venir, jamais ceux déjà journalisés.
 *
 * Le figeage a donc lieu une seule fois, au moment où le plat devient des
 * lignes de journal : c'est `scaleMacros` qui s'en charge, comme pour un scan.
 */

import type { Macros } from './types';
import type { Meal } from './meal';
import { scaleMacros, sumMacros, ZERO_MACROS } from './nutrition';

/** Une recette référence les mêmes fiches que le journal : CIQUAL ou produit. */
export type IngredientRefKind = 'ciqual' | 'product';

export function isIngredientRefKind(value: unknown): value is IngredientRefKind {
  return value === 'ciqual' || value === 'product';
}

/**
 * Un ingrédient, tel qu'il est rendu au client.
 *
 * `per100g` vaut `null` quand la fiche de référence est devenue introuvable :
 * un aliment CIQUAL redevenu incomplet au réimport, un produit purgé du cache.
 * Le cas est rare mais il se produit, et il ne doit pas se solder par un total
 * silencieusement faux. L'ingrédient reste affiché, signalé, et exclu du calcul.
 */
/**
 * Rendements de cuisson : grammes cuits obtenus pour un gramme cru.
 *
 * Une recette décrite au poids cuit a des macros justes — c'est bien le riz
 * cuit qu'on mange — mais une liste de courses et une balance fausses : on
 * n'achète ni ne pèse 400 g de riz cuit, on pèse 145 g de riz cru. Le rendement
 * fait le pont, sans toucher aux références nutritionnelles déjà vérifiées.
 *
 * La liste est volontairement courte : les féculents secs, qui gonflent de
 * deux à trois fois, et les viandes et poissons, qui perdent un quart de leur
 * poids. Ce sont les seuls écarts qui changent ce qu'on achète. Les légumes
 * cuits, les légumineuses (achetées en conserve, déjà cuites), le jambon et
 * les crevettes (vendus cuits) n'en ont pas : leur poids affiché est celui
 * qu'on achète. Les valeurs sont des moyennes de cuisson à l'eau ou à la poêle,
 * à dix pour cent près, ce qui suffit pour acheter et pour peser.
 */
const COOKING_YIELDS: readonly { pattern: RegExp; yield: number }[] = [
  { pattern: /\briz\b.*\bcomplet/, yield: 2.6 },
  { pattern: /\briz\b/, yield: 2.8 },
  { pattern: /\bpates?\b|\bspaghetti|\bmacaroni|\btagliatelle|\bpenne/, yield: 2.3 },
  { pattern: /\bquinoa/, yield: 2.7 },
  { pattern: /\bsemoule|\bcouscous/, yield: 2.4 },
  { pattern: /\bboulgour|\bboulghour/, yield: 2.5 },
  { pattern: /\blentilles? corail/, yield: 2.2 },
  { pattern: /\blentille/, yield: 2.5 },
  { pattern: /\bpoulet|\bdinde|\bboeuf|\bsteak|\bhache|\bporc|\bveau|\bagneau/, yield: 0.75 },
  { pattern: /\bsaumon|\bcabillaud|\bcolin|\btruite|\bmerlu|\bthon frais|\bdorade|\bpoisson/, yield: 0.8 },
];

/** Ce qui se vend déjà cuit : aucun rendement, même si le nom dit « cuit ». */
const SOLD_COOKED = /\bjambon|\bcrevette|\bconserve|\bappertise|\broti\b.*\btranche|\bpois chiche|\bharicot|\bfeve/;

/** Les mots d'un aliment cuit, dans les tables et dans les recettes. */
const COOKED = /\bcuit|\bcuite|\broti|\bgrille|\bpoele|\bvapeur|\bbouilli/;

function normalizeFoodName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ');
}

/**
 * Le rendement de cuisson d'un aliment cuit, d'après son nom, ou `null`.
 *
 * `null` veut dire « le poids affiché est celui qu'on achète » : l'aliment est
 * cru, vendu cuit, ou d'un rendement trop proche de un pour qu'il compte.
 */
export function cookingYield(foodName: string | null): number | null {
  if (foodName === null) {
    return null;
  }
  const name = normalizeFoodName(foodName);
  if (!COOKED.test(name) || SOLD_COOKED.test(name)) {
    return null;
  }
  return COOKING_YIELDS.find((entry) => entry.pattern.test(name))?.yield ?? null;
}

/** Le poids cru qui donne ce poids cuit, arrondi au gramme. */
export function rawGrams(cookedGrams: number, yieldRatio: number | null): number {
  if (yieldRatio === null || yieldRatio <= 0) {
    return cookedGrams;
  }
  return Math.max(1, Math.round(cookedGrams / yieldRatio));
}

export interface RecipeIngredient {
  id: number;
  position: number;
  refKind: IngredientRefKind;
  refValue: string;
  /** Désignation affichée, recopiée à la création puis modifiable librement. */
  label: string;
  /**
   * Rendement de cuisson de la fiche de référence (voir `cookingYield`), ou
   * `null` si le poids écrit est celui qu'on achète. Déduit du nom de la
   * fiche à chaque lecture, jamais stocké.
   */
  cookedYield: number | null;
  quantityG: number;
  /** Nom de l'unité usuelle au singulier — « œuf », « boîte » — si elle a un sens. */
  unitName: string | null;
  /** Poids d'une unité, en grammes. Toujours présent si `unitName` l'est. */
  unitGrams: number | null;
  per100g: Macros | null;
}

export interface Recipe {
  id: number;
  name: string;
  /** Nombre de parts que produit la recette telle qu'elle est écrite. */
  servings: number;
  steps: string[];
  prepMinutes: number | null;
  notes: string | null;
  ingredients: RecipeIngredient[];
}

/** Bornes de garde-fou, partagées par le formulaire et la validation serveur. */
export const MAX_SERVINGS = 20;
export const MAX_INGREDIENTS = 40;
export const MAX_STEPS = 30;

export function isValidServings(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_SERVINGS;
}

/**
 * Les macros totales d'une recette, et le nombre d'ingrédients qu'on n'a pas
 * su résoudre.
 *
 * Le compte est rendu à côté du total plutôt que laissé de côté : c'est lui
 * qui permet à l'écran de dire « total partiel » au lieu d'afficher un chiffre
 * juste en apparence.
 */
export function recipeMacros(ingredients: readonly RecipeIngredient[]): {
  macros: Macros;
  unresolvedCount: number;
} {
  const resolved = ingredients.filter((ingredient) => ingredient.per100g !== null);
  return {
    macros: sumMacros(
      resolved.map((ingredient) =>
        // Le filtre ci-dessus garantit la non-nullité, que le typage ne suit pas.
        scaleMacros(ingredient.per100g as Macros, ingredient.quantityG),
      ),
    ),
    unresolvedCount: ingredients.length - resolved.length,
  };
}

/** Les macros d'une part. C'est la seule grandeur que l'utilisateur lit. */
export function macrosPerServing(recipe: Recipe): {
  macros: Macros;
  unresolvedCount: number;
} {
  const total = recipeMacros(recipe.ingredients);
  if (!isValidServings(recipe.servings)) {
    return { macros: ZERO_MACROS, unresolvedCount: total.unresolvedCount };
  }
  // Une part vaut le total mis à l'échelle de 1/parts, ce que `scaleMacros`
  // sait faire en raisonnant en pourcentage : 100 / parts.
  return {
    macros: scaleMacros(total.macros, 100 / recipe.servings),
    unresolvedCount: total.unresolvedCount,
  };
}

/**
 * La quantité d'un ingrédient pour un nombre de parts donné, en grammes entiers.
 *
 * L'arrondi à l'entier n'est pas cosmétique : `isValidQuantity` refuse toute
 * quantité non entière, et une entrée de journal rejetée à l'écriture perdrait
 * l'ingrédient sans le dire. Le plancher à 1 g couvre l'épice pesée au gramme
 * sur une recette de six parts, dont la part arrondirait à zéro.
 */
export function quantityForServings(
  quantityG: number,
  recipeServings: number,
  servings: number,
): number {
  if (!isValidServings(recipeServings) || servings <= 0) {
    return 0;
  }
  const scaled = (quantityG * servings) / recipeServings;
  return scaled <= 0 ? 0 : Math.max(1, Math.round(scaled));
}

/**
 * Les ingrédients d'une recette pour un nombre de parts donné.
 *
 * La même mise à l'échelle que celle de la liste de courses, parce que c'est
 * littéralement la même fonction : `quantityForServings`, appelée avec les
 * mêmes arguments. Ce n'est pas une coïncidence qu'on entretient, c'est la
 * condition pour que l'écran et le rayon disent le même nombre de grammes.
 *
 * La fiche montrait jusqu'ici les quantités écrites dans la recette, quand la
 * liste avait acheté de quoi faire les parts du panier : une recette de quatre
 * parts mise au panier pour six annonçait 500 g de riz sur sa fiche et en
 * faisait acheter 750. Des deux chiffres, c'est celui du panier qui est vrai —
 * c'est lui qu'on a dans son sac.
 *
 * Seules les quantités changent. Les références, les unités et les libellés
 * sont ceux de la recette : mettre à l'échelle ne transforme pas un œuf en
 * autre chose.
 */
export function ingredientsForServings(
  ingredients: readonly RecipeIngredient[],
  recipeServings: number,
  servings: number,
): RecipeIngredient[] {
  return ingredients.map((ingredient) => ({
    ...ingredient,
    quantityG: quantityForServings(ingredient.quantityG, recipeServings, servings),
  }));
}

/**
 * Le poids d'une part dans l'assiette, en grammes, arrondi à cinq grammes.
 *
 * La somme des quantités écrites, divisée par les parts. Les féculents et les
 * viandes sont écrits au poids cuit, les légumes au poids cru : l'eau que les
 * seconds perdent rend le chiffre un peu haut, ce qui reste le bon sens d'erreur
 * pour servir une assiette. Il répond à la question que « une part » laisse
 * ouverte : combien de grammes du plat mettre dans son assiette.
 */
export function portionWeight(
  ingredients: readonly { quantityG: number }[],
  servings: number,
): number {
  if (!isValidServings(servings)) {
    return 0;
  }
  const total = ingredients.reduce((sum, ingredient) => sum + ingredient.quantityG, 0);
  return Math.round(total / servings / 5) * 5;
}

/**
 * La part de la cible du jour qu'un repas occupe.
 *
 * Une répartition ordinaire, pas une prescription : elle sert à proposer un
 * nombre de parts, que l'utilisateur corrige d'un appui. Le total fait un.
 */
export const MEAL_TARGET_SHARES: Record<Meal, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

/** Bornes et pas du nombre de parts proposé : un quart de part suffit à viser juste. */
const SUGGESTED_STEP = 0.25;
const SUGGESTED_MIN = 0.5;
const SUGGESTED_MAX = 3;

/**
 * Le nombre de parts qui fait tenir ce repas dans la cible du jour.
 *
 * C'est l'adaptation des portions à l'objectif : la recette ne change pas —
 * elle se cuisine et s'achète pareil pour tout le monde — mais ce qu'on en
 * mange suit la cible. Quelqu'un à 2 800 kcal mange une part et demie du plat
 * qui en fait une pour quelqu'un à 1 800.
 *
 * `null` quand on ne peut rien proposer : pas de cible, ou une part sans
 * calories connues.
 */
export function suggestedServings(
  kcalPerServing: number,
  targetKcal: number | null,
  meal: Meal,
): number | null {
  if (targetKcal === null || targetKcal <= 0 || !(kcalPerServing > 0)) {
    return null;
  }
  const exact = (targetKcal * MEAL_TARGET_SHARES[meal]) / kcalPerServing;
  const stepped = Math.round(exact / SUGGESTED_STEP) * SUGGESTED_STEP;
  return Math.min(SUGGESTED_MAX, Math.max(SUGGESTED_MIN, stepped));
}

/**
 * Un nombre de parts, écrit : « 6 parts », « 1 part », « 0,5 part ».
 *
 * Partagé par le panier, la fiche et le mode cuisine, qui affichent tous les
 * trois la même grandeur. Trois formateurs auraient fini par arrondir
 * différemment, et c'est exactement le genre d'écart qui fait douter du reste.
 */
export function formatServings(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return rounded > 1 ? `${text} parts` : `${text} part`;
}

/**
 * Pluriel d'une unité. Les noms déjà terminés par une sifflante sont
 * invariables — « une tranche », « deux tranches », mais « un ananas » reste
 * « deux ananas ».
 */
function pluralize(unitName: string, count: number): string {
  if (count < 2) {
    return unitName;
  }
  return /[sxz]$/i.test(unitName) ? unitName : `${unitName}s`;
}

function formatCount(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

/**
 * Le nombre d'unités que représente une quantité, ou `null` si l'ingrédient
 * se compte au poids.
 */
export function unitCount(
  quantityG: number,
  unitName: string | null,
  unitGrams: number | null,
): number | null {
  if (unitName === null || unitGrams === null || unitGrams <= 0) {
    return null;
  }
  return quantityG / unitGrams;
}

/**
 * Quantité lisible d'un ingrédient : « 2 œufs », « 150 g », « 2,5 boîtes ».
 *
 * Le poids est rappelé entre parenthèses derrière l'unité. Il n'est pas
 * redondant : c'est lui qui explique le calcul des macros, et lui seul permet
 * de repérer qu'un œuf a été saisi à 500 g.
 */
export function formatIngredientQuantity(ingredient: {
  quantityG: number;
  unitName: string | null;
  unitGrams: number | null;
  cookedYield?: number | null;
}): string {
  // Un féculent ou une viande écrits au poids cuit se lisent au poids cru, celui
  // qu'on pèse et qu'on achète ; le poids cuit suit, c'est lui que comptent les
  // macros.
  if (ingredient.cookedYield !== undefined && ingredient.cookedYield !== null) {
    const raw = rawGrams(ingredient.quantityG, ingredient.cookedYield);
    return `${raw.toLocaleString('fr-FR')} g cru · ≈ ${Math.round(ingredient.quantityG).toLocaleString('fr-FR')} g cuit`;
  }
  const count = unitCount(ingredient.quantityG, ingredient.unitName, ingredient.unitGrams);
  const grams = `${Math.round(ingredient.quantityG).toLocaleString('fr-FR')} g`;
  if (count === null || ingredient.unitName === null) {
    return grams;
  }
  const rounded = Math.round(count * 10) / 10;
  return `${formatCount(rounded)} ${pluralize(ingredient.unitName, rounded)} (${grams})`;
}

/**
 * Le nombre d'unités à acheter, arrondi au supérieur.
 *
 * Une liste de courses n'est pas un calcul nutritionnel : on n'achète pas 2,4
 * œufs. Arrondir au-dessous ferait manquer l'ingrédient au moment de cuisiner,
 * ce qui est la seule erreur qu'une liste de courses n'a pas le droit de faire.
 */
export function shoppingUnitCount(
  quantityG: number,
  unitName: string | null,
  unitGrams: number | null,
): number | null {
  const count = unitCount(quantityG, unitName, unitGrams);
  return count === null ? null : Math.ceil(count);
}

/**
 * Ce qu'un client envoie pour créer ou remplacer une recette.
 *
 * Distinct de `Recipe` sur deux points : aucun identifiant, et aucune macro.
 * Les macros ne sont pas seulement inutiles ici, elles seraient nuisibles —
 * un client qui les enverrait pourrait décrire une salade à trois calories.
 * Elles se déduisent des références, côté serveur, et de nulle part ailleurs.
 */
export interface RecipeIngredientInput {
  refKind: IngredientRefKind;
  refValue: string;
  label: string;
  quantityG: number;
  unitName: string | null;
  unitGrams: number | null;
}

export interface RecipeInput {
  name: string;
  servings: number;
  steps: string[];
  prepMinutes: number | null;
  notes: string | null;
  ingredients: RecipeIngredientInput[];
}

/**
 * La durée annoncée par une étape, en secondes, ou `null`.
 *
 * Sert à proposer un minuteur sur les étapes qui en demandent un. La détection
 * est volontairement étroite : un nombre suivi d'une unité de temps, et rien
 * d'autre. Une heuristique plus large proposerait un minuteur de deux cents
 * minutes sur « préchauffer le four à 200 °C », et un minuteur qu'on ne peut
 * pas croire ne sert à rien.
 *
 * La première durée de l'étape est retenue. « Cuire 8 minutes, puis 2 minutes
 * de repos » propose huit minutes : c'est le premier geste qu'on va faire, et
 * l'étape reste là pour rappeler le second.
 */
export function stepDurationSeconds(step: string): number | null {
  const match = /\b(\d{1,3})\s*(s|sec|secondes?|min|minutes?|h|heures?)\b/i.exec(step);
  if (match === null) {
    return null;
  }

  const value = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (unit.startsWith('h')) {
    return value * 3600;
  }
  // « s » et « sec » sont des secondes, « min » des minutes : le test porte sur
  // « mi » pour ne pas confondre « min » avec « minutes » écrit en entier.
  return unit.startsWith('mi') ? value * 60 : value;
}

/** Ce qu'une quantité demande d'acheter, en unités si l'ingrédient s'en compte. */
export function purchaseLabel(item: {
  quantityG: number;
  unitName: string | null;
  unitGrams: number | null;
}): string {
  const count = shoppingUnitCount(item.quantityG, item.unitName, item.unitGrams);
  if (count === null || item.unitName === null) {
    return formatIngredientQuantity(item);
  }
  const plural = count >= 2 && !/[sxz]$/i.test(item.unitName) ? `${item.unitName}s` : item.unitName;
  return `${count} ${plural} (${Math.round(item.quantityG).toLocaleString('fr-FR')} g)`;
}
