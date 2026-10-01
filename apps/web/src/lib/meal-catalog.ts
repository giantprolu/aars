/**
 * Le catalogue de repas : des plats tout écrits, rangés par objectif.
 *
 * Les cinq plats de départ de `starter-recipes` répondaient à une question
 * étroite — « comment ne pas ouvrir un planificateur vide ». Celle-ci est plus
 * large : quelqu'un qui veut perdre du poids n'a pas à inventer vingt dîners
 * pour savoir quoi acheter samedi. Le catalogue lui en propose une trentaine
 * par objectif, et c'est son choix qui engendre la liste de courses.
 *
 * Les plats eux-mêmes vivent en base, dans `catalog_meals` : en ajouter un ou
 * lui donner une photo ne demande pas de déploiement (`npm run seed:catalog`).
 * Ce module n'en garde que la forme et les intitulés d'écran.
 *
 * Trois décisions structurent le catalogue.
 *
 * **Un plat choisi devient une recette de l'utilisateur**, recopiée dans sa
 * table, et non une référence vers une fiche partagée. Tout ce qui existe déjà
 * — le plan, la liste de courses, le mode cuisine, la journalisation — travaille
 * sur `recipes`, et le catalogue n'a pas à ouvrir un second chemin parallèle.
 * Le prix est qu'une correction du catalogue ne rattrape pas les copies déjà
 * installées ; le gain est que le plat s'édite, se renomme et se supprime comme
 * n'importe quel autre, ce qui est exactement ce qu'on veut d'une recette.
 *
 * **Les ingrédients sont décrits par un terme de recherche**, jamais par un
 * code CIQUAL, pour la raison qui valait déjà pour les plats de départ : les
 * codes de l'ANSES changent de millésime en millésime, et une liste figée
 * finirait par installer des recettes pointant vers rien.
 *
 * **Les macros affichées dans le catalogue sont un ordre de grandeur**, rangé
 * avec le plat et non calculé à l'affichage. Résoudre quatre cents termes de recherche
 * pour dessiner une liste de choix coûterait une seconde par ouverture d'écran,
 * pour une précision dont le choix n'a pas besoin : on lit ce chiffre pour
 * distinguer un dîner léger d'un dîner riche, pas pour compter sa journée. Les
 * vraies macros arrivent avec la recette installée, calculées depuis CIQUAL
 * comme partout ailleurs. `npm run verify:catalog` recalcule ces estimations
 * depuis CIQUAL et signale tout écart, pour qu'elles ne dérivent pas en
 * silence.
 */

import type { Goal } from './energy';
import type { Meal } from './meal';

export interface CatalogIngredient {
  /** Désignation affichée dans la recette, courte et lisible. */
  label: string;
  /** Ce qu'on cherche dans CIQUAL pour trouver la fiche nutritionnelle. */
  searchTerm: string;
  /** Quantité pour la recette entière, toutes parts comprises. */
  quantityG: number;
  unitName?: string;
  unitGrams?: number;
}

/**
 * L'ordre de grandeur d'une part. Indicatif, et dit comme tel à l'écran.
 *
 * Deux valeurs et non quatre : ce sont les seules qui départagent deux plats
 * au moment de choisir. Les glucides et les lipides se lisent sur la recette
 * une fois installée, où ils sont justes.
 */
export interface CatalogEstimate {
  kcal: number;
  proteinG: number;
}

export interface CatalogMeal {
  /**
   * Identifiant stable du plat. C'est lui qui traverse le réseau et qui est
   * retenu sur la recette installée, jamais le nom : renommer un plat dans son
   * carnet ne doit pas le faire réapparaître comme non installé.
   */
  slug: string;
  name: string;
  /** Repas auquel le plat est destiné, pour trier l'écran de choix. */
  slot: Meal;
  /** Nombre de parts que produit la recette telle qu'elle est écrite. */
  servings: number;
  prepMinutes: number;
  steps: string[];
  ingredients: CatalogIngredient[];
  estimate: CatalogEstimate;
  /** Photo du plat, servie par Vercel Blob ; `null` tant qu'il n'en a pas. */
  imageUrl: string | null;
}

/**
 * Intitulés d'objectif employés par l'écran de choix.
 *
 * Distincts de ceux du profil, qui parlent au futur d'un réglage — « perdre du
 * poids » — là où le catalogue nomme une famille de plats.
 */
export const CATALOG_GOAL_LABELS: Record<Goal, string> = {
  lose: 'Perte de poids',
  maintain: 'Maintien',
  gain: 'Prise de masse',
};

/** Une ligne de plus sous l'intitulé, pour dire ce que l'objectif change. */
export const CATALOG_GOAL_NOTES: Record<Goal, string> = {
  lose: 'Volumineux et protéinés, autour de 350 à 500 kcal la part.',
  maintain: 'Équilibrés, autour de 500 à 700 kcal la part.',
  gain: 'Denses, autour de 800 à 1000 kcal la part.',
};
