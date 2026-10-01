/**
 * Mesure d'usage : la liste fermée de ce qui est compté. Module pur.
 *
 * Décision du 01/10/2026 (étape « mesurer ») : savoir ce que les gens font,
 * pas ce qu'ils mangent. Un événement n'est qu'un nom, compté par jour et par
 * compte. Aucun aliment, aucune quantité, aucune calorie, aucun poids n'y
 * entre : la base les a déjà, et une seconde copie à des fins de statistiques
 * serait une seconde base de santé.
 *
 * Ce que la base sait déjà n'est pas compté ici : l'inscription (`users`),
 * l'abonnement (`store_subscriptions`). Le rapport les lit à leur source.
 */

/** Façon dont un repas est entré au journal. */
export const MEAL_METHODS = [
  'search',
  'barcode',
  'photo',
  'manual',
  'recent',
  'favorite',
  'recipe',
  'planned',
] as const;

export type MealMethod = (typeof MEAL_METHODS)[number];

/**
 * Ce qu'un client peut déclarer sur `POST /api/entries`. Les autres méthodes
 * ont leur propre route, et c'est la route qui les compte.
 */
export const ENTRY_VIAS = ['search', 'barcode', 'photo'] as const satisfies readonly MealMethod[];

export type EntryVia = (typeof ENTRY_VIAS)[number];

export const USAGE_EVENTS = [
  /** L'écran Aujourd'hui s'est ouvert : un jour actif, base de la rétention. */
  'app_opened',
  /** Le profil a été enregistré, donc une cible calculée : l'activation. */
  'target_set',
  /** La dépense de Santé est arrivée : le pont fonctionne. */
  'activity_synced',
  /** Une limite gratuite a refusé une écriture : le paywall vu. */
  'paywall_hit',
  ...MEAL_METHODS.map((method) => `meal_${method}` as const),
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

export function mealEvent(method: MealMethod): UsageEvent {
  return `meal_${method}`;
}

/**
 * La méthode d'une entrée posée sur `POST /api/entries`.
 *
 * Un client qui ne la déclare pas (raccourci iOS, ancienne version de l'app)
 * est compté sur ce que l'entrée dit d'elle-même : une saisie libre est
 * manuelle, le reste vient d'une recherche.
 */
export function entryMethod(via: EntryVia | undefined, sourceKind: 'ciqual' | 'product' | 'manual'): MealMethod {
  if (via !== undefined) {
    return via;
  }
  return sourceKind === 'manual' ? 'manual' : 'search';
}
