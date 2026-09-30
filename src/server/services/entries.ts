import 'server-only';
import type { DayTotals, Entry, Macros, SourceKind } from '@/lib/types';
import { isValidQuantity, scaleMacros } from '@/lib/nutrition';
import { hourInParis, todayInParis } from '@/lib/date';
import { type Meal, mealForHour } from '@/lib/meal';
import {
  deleteEntry,
  findEntry,
  insertEntry,
  listRecentEntries,
  listDayTotals,
  listEntriesForDate,
  recentQuantities,
  totalsForDate,
} from '../db/queries/entries';

/**
 * Service du journal.
 *
 * C'est l'unique endroit où des macros pour 100 g deviennent les macros figées
 * d'une entrée (AD-1, AD-8). Aucun autre module n'a le droit de faire ce calcul
 * avant écriture.
 */

export interface JournalView {
  totals: DayTotals;
  entries: Entry[];
}

export async function journalForDate(
  userId: number,
  entryDate: string,
): Promise<JournalView> {
  const [totals, entries] = await Promise.all([
    totalsForDate(userId, entryDate),
    listEntriesForDate(userId, entryDate),
  ]);
  return { totals, entries };
}

export function journalForToday(userId: number): Promise<JournalView> {
  return journalForDate(userId, todayInParis());
}

export interface RecordEntryInput {
  userId: number;
  foodLabel: string;
  /** Valeurs pour 100 g de l'aliment de référence, ou saisies à la main (FR-25). */
  per100g: Macros;
  quantityG: number;
  sourceKind: SourceKind;
  sourceRef: string | null;
  entryDate?: string;
  /**
   * Repas de rattachement. Absent, il est déduit de l'heure : le raccourci iOS
   * et les anciens clients n'en envoient pas, et refuser leur écriture pour
   * cette seule raison perdrait la mesure.
   */
  meal?: Meal;
}

export type RecordEntryResult =
  | { kind: 'created'; entry: Entry }
  | { kind: 'invalid_quantity' };

/** Enregistre une entrée en figeant ses macros (FR-10). */
export async function recordEntry(input: RecordEntryInput): Promise<RecordEntryResult> {
  if (!isValidQuantity(input.quantityG)) {
    return { kind: 'invalid_quantity' };
  }

  const entry = await insertEntry({
    userId: input.userId,
    entryDate: input.entryDate ?? todayInParis(),
    meal: input.meal ?? mealForHour(hourInParis()),
    foodLabel: input.foodLabel,
    quantityG: input.quantityG,
    macros: scaleMacros(input.per100g, input.quantityG),
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
  });

  return { kind: 'created', entry };
}

export function removeEntry(userId: number, id: number): Promise<boolean> {
  return deleteEntry(userId, id);
}

export function historyPage(
  userId: number,
  limit: number,
  offset: number,
): Promise<DayTotals[]> {
  return listDayTotals(userId, limit, offset);
}

export function quantityShortcuts(
  userId: number,
  sourceKind: SourceKind,
  sourceRef: string | null,
  foodLabel: string,
): Promise<number[]> {
  return recentQuantities(userId, sourceKind, sourceRef, foodLabel);
}

/** Entrées relues pour trouver les aliments récents : assez pour en isoler trois distincts. */
const RECENT_WINDOW = 60;

/**
 * Les derniers aliments distincts notés, la dernière saisie de chacun.
 *
 * Deux saisies du même aliment comptent pour un : la référence le dit quand
 * elle existe, la désignation sinon (une entrée faite à la main n'en a pas).
 * C'est la dernière quantité qui est gardée, celle qu'on refait d'un appui.
 */
export async function recentFoods(userId: number, count: number): Promise<Entry[]> {
  const seen = new Set<string>();
  const kept: Entry[] = [];
  for (const entry of await listRecentEntries(userId, RECENT_WINDOW)) {
    const key = `${entry.sourceKind}:${entry.sourceRef ?? entry.foodLabel}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(entry);
    if (kept.length === count) {
      break;
    }
  }
  return kept;
}

export type RepeatEntryResult = { kind: 'created'; entry: Entry } | { kind: 'not_found' };

/**
 * Refait une entrée passée, aujourd'hui et au repas choisi.
 *
 * Les macros sont recopiées telles quelles : ce sont celles, figées, de la
 * saisie d'origine (AD-1). Rien n'est recalculé, la même quantité du même
 * aliment vaut la même chose.
 */
export async function repeatEntry(
  userId: number,
  entryId: number,
  meal: Meal,
): Promise<RepeatEntryResult> {
  const source = await findEntry(userId, entryId);
  if (source === null) {
    return { kind: 'not_found' };
  }
  const entry = await insertEntry({
    userId,
    entryDate: todayInParis(),
    meal,
    foodLabel: source.foodLabel,
    quantityG: source.quantityG,
    macros: source.macros,
    sourceKind: source.sourceKind,
    sourceRef: source.sourceRef,
  });
  return { kind: 'created', entry };
}
