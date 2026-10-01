import 'server-only';
import { z } from 'zod';
import { MAX_INGREDIENTS, MAX_SERVINGS, MAX_STEPS } from '@/lib/recipe';
import { MAX_QUANTITY_G } from '@/lib/nutrition';
import { MAX_NAME_LENGTH, MAX_PREP_MINUTES, type RecipeRejection } from '../services/recipes';

/**
 * Analyse du corps des requêtes de recette (spine, Zod à la frontière).
 *
 * Dans un module à part et non dans la route : un fichier `route.ts` ne peut
 * exporter que ses gestionnaires, et deux routes — la collection et l'élément —
 * partagent le même schéma. Le dupliquer aurait laissé les deux dériver.
 *
 * Ce schéma contrôle la forme ; le service contrôle le sens. Zod ne sait pas
 * si une référence existe, et n'a pas à le savoir.
 */

export const ingredientSchema = z.object({
  refKind: z.enum(['ciqual', 'product']),
  refValue: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  quantityG: z.number().int().positive().max(MAX_QUANTITY_G - 1),
  unitName: z.string().trim().min(1).max(24).nullable(),
  unitGrams: z.number().finite().positive().max(MAX_QUANTITY_G).nullable(),
});

export const recipeSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  servings: z.number().finite().positive().max(MAX_SERVINGS),
  steps: z.array(z.string().trim().max(500)).max(MAX_STEPS),
  prepMinutes: z.number().int().min(0).max(MAX_PREP_MINUTES).nullable(),
  notes: z.string().trim().max(1000).nullable(),
  ingredients: z.array(ingredientSchema).min(1).max(MAX_INGREDIENTS),
});

/**
 * Le motif de refus, dit en français.
 *
 * La liste est fermée et vit à côté de la règle qu'elle décrit : un message
 * réécrit dans chaque écran finirait par annoncer une contrainte que le
 * service n'applique plus.
 */
export const REJECTION_MESSAGES: Record<RecipeRejection, string> = {
  name: 'Le nom de la recette est vide ou trop long.',
  servings: 'Le nombre de parts est invalide.',
  ingredients: 'La liste des ingrédients est vide ou mal formée.',
  quantity: 'Une quantité est hors des bornes admises.',
  steps: 'Les étapes ou le temps de préparation sont invalides.',
  unknown_reference: 'Un ingrédient ne correspond à aucune fiche connue.',
};
