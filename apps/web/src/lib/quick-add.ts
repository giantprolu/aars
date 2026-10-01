/**
 * Ce que le bouton + propose avant qu'on ait tapé quoi que ce soit.
 *
 * Partagé entre la route qui le calcule et les feuilles qui l'affichent. Module
 * pur, sans dépendance au serveur.
 */

import type { WeighIn } from './weight';

/** Un aliment noté récemment, qu'un appui refait à l'identique. */
export interface RecentFood {
  /** L'entrée d'origine, recopiée telle quelle. */
  entryId: number;
  label: string;
  quantityG: number;
  kcal: number;
}

/** Un repas favori, refait d'un appui. */
export interface QuickFavorite {
  id: number;
  name: string;
}

/**
 * La séance que la feuille « Une séance » met en tête : celle qui est ouverte
 * s'il y en a une, sinon la suivante du programme.
 */
export type QuickSession =
  | { kind: 'open'; sessionId: number; name: string; setCount: number }
  | { kind: 'next'; templateId: number; name: string; exerciseCount: number };

export interface QuickAddContext {
  favorites: QuickFavorite[];
  recents: RecentFood[];
  session: QuickSession | null;
  lastWeighIn: WeighIn | null;
}

/** Nombre de raccourcis sous la recherche : une ligne sur un téléphone. */
export const QUICK_CHIPS = 3;
