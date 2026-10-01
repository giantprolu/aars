/**
 * Calcul du prorata nutritionnel. Fonctions pures, sans dépendance (AD-8).
 *
 * C'est l'unique endroit où des macros pour 100 g deviennent des macros pour
 * une quantité consommée. Le résultat est figé dans l'entrée (AD-1) et écrit
 * en numeric(10,3) (AD-9), d'où l'arrondi à trois décimales avant écriture.
 */

import type { Macros } from './types';

/** Borne haute de garde-fou sur une quantité, en grammes (FR-8). */
export const MAX_QUANTITY_G = 5000;

const SCALE_DECIMALS = 3;

function roundToScale(value: number): number {
  const factor = 10 ** SCALE_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Applique une quantité à des valeurs exprimées pour 100 g.
 * 250 kcal/100 g sur 150 g donne 375 kcal.
 */
export function scaleMacros(per100g: Macros, quantityG: number): Macros {
  const ratio = quantityG / 100;
  return {
    kcal: roundToScale(per100g.kcal * ratio),
    proteinG: roundToScale(per100g.proteinG * ratio),
    carbsG: roundToScale(per100g.carbsG * ratio),
    fatG: roundToScale(per100g.fatG * ratio),
  };
}

/** Une quantité acceptable : entier strictement positif, sous la borne (FR-8). */
export function isValidQuantity(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value < MAX_QUANTITY_G;
}

/** Une valeur nutritionnelle acceptable : finie, positive, raisonnable. */
export function isValidNutrient(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 10000;
}

/** Vrai quand les quatre valeurs sont exploitables. Sert au drapeau `is_complete`. */
export function isCompleteMacros(macros: Partial<Macros>): macros is Macros {
  return (
    typeof macros.kcal === 'number' &&
    typeof macros.proteinG === 'number' &&
    typeof macros.carbsG === 'number' &&
    typeof macros.fatG === 'number' &&
    isValidNutrient(macros.kcal) &&
    isValidNutrient(macros.proteinG) &&
    isValidNutrient(macros.carbsG) &&
    isValidNutrient(macros.fatG)
  );
}

export const ZERO_MACROS: Macros = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
};

/** Somme de macros. Réservée à l'affichage : les totaux du journal viennent de Postgres (AD-9). */
export function sumMacros(items: readonly Macros[]): Macros {
  return items.reduce<Macros>(
    (total, item) => ({
      kcal: roundToScale(total.kcal + item.kcal),
      proteinG: roundToScale(total.proteinG + item.proteinG),
      carbsG: roundToScale(total.carbsG + item.carbsG),
      fatG: roundToScale(total.fatG + item.fatG),
    }),
    ZERO_MACROS,
  );
}

/** Arrondi d'affichage : les kcal à l'unité, les grammes au dixième. */
export function formatKcal(value: number): string {
  return Math.round(value).toLocaleString('fr-FR');
}

export function formatGrams(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
