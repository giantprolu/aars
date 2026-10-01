/**
 * Repas favoris. Fonctions pures (AD-8).
 *
 * Un favori est une photographie d'un repas du journal : ses aliments, leurs
 * quantités et leurs macros figées. Le refaire recopie ces lignes telles
 * quelles dans le journal du jour, sans repasser par une table de référence.
 */

import { sumMacros } from './nutrition';
import type { Meal } from './meal';
import type { Macros, SourceKind } from './types';

export interface FavoriteItem {
  foodLabel: string;
  quantityG: number;
  macros: Macros;
  sourceKind: SourceKind;
  sourceRef: string | null;
}

export interface FavoriteMeal {
  id: number;
  name: string;
  meal: Meal;
  items: FavoriteItem[];
  createdAt: Date;
}

export const MAX_FAVORITE_NAME = 60;

/** Au-delà, ce n'est plus un repas qu'on refait, c'est une journée. */
export const MAX_FAVORITE_ITEMS = 30;

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isSourceKind(value: unknown): value is SourceKind {
  return value === 'ciqual' || value === 'product' || value === 'manual';
}

/**
 * Relit les éléments stockés en JSON.
 *
 * La colonne n'a pas de schéma en base : une ligne écrite par une version
 * antérieure, ou abîmée, est écartée élément par élément plutôt que de faire
 * échouer toute la liste des favoris.
 */
export function parseFavoriteItems(raw: unknown): FavoriteItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: FavoriteItem[] = [];
  for (const value of raw as unknown[]) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const item = value as Record<string, unknown>;
    const macros = item.macros as Record<string, unknown> | undefined;
    if (
      typeof item.foodLabel !== 'string' ||
      !isFiniteNonNegative(item.quantityG) ||
      item.quantityG === 0 ||
      typeof macros !== 'object' ||
      macros === null ||
      !isFiniteNonNegative(macros.kcal) ||
      !isFiniteNonNegative(macros.proteinG) ||
      !isFiniteNonNegative(macros.carbsG) ||
      !isFiniteNonNegative(macros.fatG) ||
      !isSourceKind(item.sourceKind) ||
      (item.sourceRef !== null && typeof item.sourceRef !== 'string')
    ) {
      continue;
    }
    items.push({
      foodLabel: item.foodLabel,
      quantityG: item.quantityG,
      macros: {
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
      },
      sourceKind: item.sourceKind,
      sourceRef: item.sourceRef,
    });
  }
  return items;
}

export function favoriteTotals(favorite: Pick<FavoriteMeal, 'items'>): Macros {
  return sumMacros(favorite.items.map((item) => item.macros));
}

/**
 * Le nom proposé à l'enregistrement : les deux aliments les plus caloriques.
 * C'est eux qu'on reconnaît d'un repas — « Flocons d'avoine, skyr » — et non
 * le sel ou le café qui l'accompagnent.
 */
export function suggestFavoriteName(items: readonly FavoriteItem[]): string {
  const names = [...items]
    .sort((a, b) => b.macros.kcal - a.macros.kcal)
    .slice(0, 2)
    .map((item) => item.foodLabel.split(',')[0]?.trim() ?? item.foodLabel);
  const name = names.join(', ');
  return name.length > MAX_FAVORITE_NAME ? `${name.slice(0, MAX_FAVORITE_NAME - 1)}…` : name;
}
