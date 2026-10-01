/**
 * Mise en forme du journal pour l'affichage. Fonctions pures (AD-8).
 *
 * Le regroupement vit ici et non dans une requête : les sous-totaux affichés
 * sont ceux des macros déjà figées de chaque entrée (AD-1), il n'y a donc rien
 * à redemander à Postgres. Les totaux de la journée, eux, restent sommés en
 * base (AD-9) — ce sont eux qui font foi.
 */

import type { Entry, Macros } from './types';
import { MEALS, MEAL_LABELS, type Meal } from './meal';
import { sumMacros } from './nutrition';

/** Une section du journal : un repas, ses entrées, et leur sous-total. */
export interface MealSection {
  meal: Meal;
  label: string;
  entries: Entry[];
  macros: Macros;
}

/**
 * Regroupe les entrées d'une journée par repas, dans l'ordre de `MEALS`.
 *
 * Les repas sans entrée sont omis plutôt que rendus vides : une journée qui
 * afficherait quatre en-têtes dont trois creux se lirait comme un formulaire
 * à remplir, quand le journal ne demande rien.
 */
export function groupByMeal(entries: readonly Entry[]): MealSection[] {
  return MEALS.map((meal) => {
    const kept = entries.filter((entry) => entry.meal === meal);
    return {
      meal,
      label: MEAL_LABELS[meal],
      entries: kept,
      macros: sumMacros(kept.map((entry) => entry.macros)),
    };
  }).filter((section) => section.entries.length > 0);
}

/**
 * Part consommée d'une cible, bornée à 1 pour l'affichage.
 *
 * Le dépassement est dit par le chiffre, jamais par une jauge qui déborderait :
 * une barre plus longue que sa piste se lit comme un défaut de rendu, et le
 * produit ne porte aucun jugement sur la journée (DESIGN.md).
 */
export function progressRatio(consumed: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, consumed / target));
}
