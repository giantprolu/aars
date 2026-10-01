/**
 * Le repas auquel une entrée se rattache (DESIGN.md, écran Journal).
 *
 * Module pur, sans dépendance à la base ni au réseau : la même liste sert à
 * contraindre la colonne, à valider le corps d'une requête et à dessiner le
 * sélecteur. Trois copies de cette liste dériveraient l'une de l'autre.
 *
 * L'ordre est celui du sélecteur de la maquette, et non l'ordre chronologique
 * d'une journée : la collation ferme la liste parce qu'elle n'a pas d'heure.
 */

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type Meal = (typeof MEALS)[number];

/** Intitulé complet, pour les en-têtes de section du journal. */
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

/**
 * Intitulé court, pour le sélecteur à quatre segments. « Petit-déjeuner » y
 * tiendrait sur deux lignes et ferait sauter la hauteur de la rangée.
 */
export const MEAL_SHORT_LABELS: Record<Meal, string> = {
  breakfast: 'Petit-déj',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

export function isMeal(value: unknown): value is Meal {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value);
}

/**
 * Le repas que l'heure suggère. Sert uniquement à présélectionner le sélecteur :
 * l'utilisateur garde le dernier mot, et c'est son choix qui est écrit.
 *
 * Les bornes sont larges à dessein. Elles n'ont pas à être justes, seulement à
 * tomber juste assez souvent pour que le geste habituel soit une validation.
 */
export function mealForHour(hour: number): Meal {
  if (hour < 11) {
    return 'breakfast';
  }
  if (hour < 15) {
    return 'lunch';
  }
  if (hour < 18) {
    return 'snack';
  }
  return 'dinner';
}
