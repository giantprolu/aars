/**
 * Plan automatique de la semaine (Cuisine+) : la répartition, sans base
 * (AD-8). Le service `plan-auto` lit le plan, le panier et le catalogue, et
 * confie ici le seul choix qui demande réflexion : quel plat sur quelle case.
 *
 * Une case est un repas d'un jour, du jour même à dimanche : midi et soir par
 * défaut, matin et collation aussi quand l'app les demande (05/10/2026). Une
 * part se pose sur une case, comme quand on place un plat à la main. Les plats tournent
 * d'une case à l'autre plutôt que de se suivre : trois soirs de curry de
 * suite, c'est ce qu'un plan fait à la main évite, et un plan automatique
 * doit au moins faire aussi bien.
 */

import { MEALS, type Meal } from './meal';

/**
 * Les repas remplis quand l'app ne dit rien : midi et soir, ceux d'avant le
 * 05/10/2026. Une version installée qui ne connaît qu'eux ne doit pas trouver
 * son plan rempli de matins qu'elle ne sait pas montrer.
 */
export const PLAN_MEALS = ['lunch', 'dinner'] as const satisfies readonly Meal[];

/** Midi et soir : les repas principaux, entre lesquels un plat peut passer. */
const MAIN_MEALS: readonly Meal[] = PLAN_MEALS;

export interface PlanSlot {
  date: string;
  meal: Meal;
}

/** Un plat qui a des parts à poser. `meal` à `null` : il va midi comme soir. */
export interface PlanDish {
  recipeId: number;
  portions: number;
  meal: Meal | null;
}

export interface PlanAssignment {
  slot: PlanSlot;
  recipeId: number;
}

/** Les cases libres, dans l'ordre du temps : jour par jour, matin avant soir. */
export function emptySlots(
  days: readonly string[],
  taken: readonly { planDate: string; meal: string }[],
  meals: readonly Meal[] = PLAN_MEALS,
): PlanSlot[] {
  const occupied = new Set(taken.map((item) => `${item.planDate}|${item.meal}`));
  const wanted = MEALS.filter((meal) => meals.includes(meal));
  return days.flatMap((date) =>
    wanted.filter((meal) => !occupied.has(`${date}|${meal}`)).map((meal) => ({ date, meal })),
  );
}

/**
 * Un plat peut-il aller sur cette case ?
 *
 * Le matin et la collation ne prennent que leurs propres plats : des lasagnes
 * au petit-déjeuner ne remplissent pas une case, elles la gâchent. Midi et
 * soir prennent un plat sans moment, et, faute de mieux, celui de l'autre.
 */
function fits(dish: Meal | null, slot: Meal, strict: boolean): boolean {
  if (!MAIN_MEALS.includes(slot)) {
    return dish === slot;
  }
  if (dish === null || dish === slot) {
    return true;
  }
  return !strict && MAIN_MEALS.includes(dish);
}

/**
 * Pose les parts sur les cases, en tournant d'un plat à l'autre.
 *
 * Un plat destiné au soir ne va pas au midi tant qu'un autre peut y aller :
 * une première passe respecte les repas, une seconde remplit les midis et
 * soirs qui restent avec un plat de l'autre repas principal (voir `fits`). Les parts entières seules
 * comptent : une demi-part ne fait pas un repas.
 */
export function assignPortions(
  slots: readonly PlanSlot[],
  dishes: readonly PlanDish[],
): { assigned: PlanAssignment[]; unassigned: PlanSlot[] } {
  const left = dishes.map((dish) => ({ ...dish, portions: Math.floor(dish.portions) }));
  const assigned: PlanAssignment[] = [];
  let pending: PlanSlot[] = [...slots];

  for (const strict of [true, false]) {
    let cursor = 0;
    const stillEmpty: PlanSlot[] = [];
    for (const slot of pending) {
      let picked = -1;
      for (let step = 0; step < left.length; step += 1) {
        const index = (cursor + step) % left.length;
        const dish = left[index]!;
        if (dish.portions > 0 && fits(dish.meal, slot.meal, strict)) {
          picked = index;
          break;
        }
      }
      if (picked < 0) {
        stillEmpty.push(slot);
        continue;
      }
      left[picked]!.portions -= 1;
      assigned.push({ slot, recipeId: left[picked]!.recipeId });
      cursor = picked + 1;
    }
    pending = stillEmpty;
  }

  return { assigned, unassigned: pending };
}

/** Ce qu'il faut du catalogue pour un plat : son `slug`, son repas, ses parts. */
export interface CatalogChoice {
  slug: string;
  slot: string;
  servings: number;
}

/**
 * Les plats du catalogue qui couvrent les cases restées vides.
 *
 * L'ordre change avec la semaine : choisir toujours les premiers plats du
 * catalogue servirait les mêmes chaque lundi. Les plats sont rangés par une
 * empreinte de leur `slug` et du rang de la semaine — le même ordre pour une
 * même semaine, un autre la suivante — et ceux déjà au panier sont sautés.
 */
export function pickCatalogMeals(
  catalog: readonly CatalogChoice[],
  need: Partial<Record<Meal, number>>,
  exclude: ReadonlySet<string>,
  weekIndex: number,
): string[] {
  const picked: string[] = [];
  for (const meal of MEALS) {
    const wanted = need[meal] ?? 0;
    if (wanted <= 0) {
      continue;
    }
    const candidates = catalog
      .filter((item) => item.slot === meal && !exclude.has(item.slug))
      .map((item) => ({ item, rank: fnv1a(`${weekIndex}:${item.slug}`) }))
      .sort((a, b) => a.rank - b.rank || a.item.slug.localeCompare(b.item.slug));
    let covered = 0;
    for (const { item } of candidates) {
      if (covered >= wanted) {
        break;
      }
      picked.push(item.slug);
      covered += Math.max(1, Math.floor(item.servings));
    }
  }
  return picked;
}

/** Empreinte FNV-1a sur 32 bits : un ordre stable, sans hasard. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Le rang d'une semaine depuis l'origine des temps Unix, pour la rotation. */
export function weekIndexOf(weekStart: string): number {
  const time = Date.parse(`${weekStart}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / (7 * 86_400_000)) : 0;
}
