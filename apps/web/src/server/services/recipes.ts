import 'server-only';
import {
  MAX_INGREDIENTS,
  MAX_STEPS,
  ingredientsForServings,
  isValidServings,
  type RecipeInput,
  type Recipe,
} from '@/lib/recipe';
import type { ShareableRecipe } from '@/lib/share-recipes';
import { isValidQuantity } from '@/lib/nutrition';
import {
  countRecipes,
  deleteRecipe,
  findRecipe,
  insertRecipe,
  listRecipes,
  missingReferences,
  updateRecipe,
} from '../db/queries/recipes';
import { basketWeeksForRecipe, listBasket } from '../db/queries/basket';
import { syncListsForRecipe, syncListsForWeeks } from './shopping';

/**
 * Service des recettes.
 *
 * C'est ici que se décide ce qu'est une recette enregistrable. La couche
 * requêtes écrit ce qu'on lui donne ; la validation ne doit donc exister
 * qu'une fois, et à cet étage — une route HTTP qui validerait pour son compte
 * laisserait passer tout ce qui n'entre pas par elle.
 */

export type { Recipe };

export const MAX_NAME_LENGTH = 80;
export const MAX_PREP_MINUTES = 600;

/**
 * Pourquoi une recette a été refusée.
 *
 * Nommer le motif plutôt que rendre un booléen : le formulaire doit pouvoir
 * dire ce qui cloche, et « enregistrement impossible » n'aide personne à
 * corriger une quantité.
 */
export type RecipeRejection =
  | 'name'
  | 'servings'
  | 'ingredients'
  | 'quantity'
  | 'steps'
  | 'unknown_reference';

export type SaveRecipeResult =
  | { kind: 'saved'; id: number }
  | { kind: 'invalid'; reason: RecipeRejection }
  | { kind: 'not_found' };

/**
 * Contrôles qui ne demandent pas la base. Séparés de ceux qui l'interrogent :
 * inutile d'aller vérifier l'existence de vingt références si le nom est vide.
 */
function checkShape(input: RecipeInput): RecipeRejection | null {
  if (input.name.trim().length === 0 || input.name.length > MAX_NAME_LENGTH) {
    return 'name';
  }
  if (!isValidServings(input.servings)) {
    return 'servings';
  }
  if (input.ingredients.length === 0 || input.ingredients.length > MAX_INGREDIENTS) {
    return 'ingredients';
  }
  if (input.steps.length > MAX_STEPS) {
    return 'steps';
  }
  if (
    input.prepMinutes !== null &&
    (!Number.isInteger(input.prepMinutes) ||
      input.prepMinutes < 0 ||
      input.prepMinutes > MAX_PREP_MINUTES)
  ) {
    return 'steps';
  }
  for (const ingredient of input.ingredients) {
    // La même borne que le journal : une recette sert à le remplir, une
    // quantité qu'il refuserait n'a rien à faire ici non plus.
    if (!isValidQuantity(ingredient.quantityG)) {
      return 'quantity';
    }
    if (ingredient.label.trim().length === 0) {
      return 'ingredients';
    }
    // L'unité va par deux : un nom sans poids ne se convertit pas, un poids
    // sans nom ne s'affiche pas.
    if ((ingredient.unitName === null) !== (ingredient.unitGrams === null)) {
      return 'ingredients';
    }
    if (ingredient.unitGrams !== null && ingredient.unitGrams <= 0) {
      return 'ingredients';
    }
  }
  return null;
}

/** Nettoie ce que le client envoie : espaces en trop, étapes vides. */
function normalize(input: RecipeInput): RecipeInput {
  return {
    ...input,
    name: input.name.trim(),
    notes: input.notes === null || input.notes.trim() === '' ? null : input.notes.trim(),
    steps: input.steps.map((step) => step.trim()).filter((step) => step.length > 0),
    ingredients: input.ingredients.map((ingredient) => ({
      ...ingredient,
      label: ingredient.label.trim(),
      unitName:
        ingredient.unitName === null || ingredient.unitName.trim() === ''
          ? null
          : ingredient.unitName.trim(),
    })),
  };
}

async function validate(input: RecipeInput): Promise<RecipeRejection | null> {
  const shape = checkShape(input);
  if (shape !== null) {
    return shape;
  }
  const missing = await missingReferences(input.ingredients);
  return missing.length > 0 ? 'unknown_reference' : null;
}

export function recipesFor(userId: number): Promise<Recipe[]> {
  return listRecipes(userId);
}

export function recipeFor(userId: number, id: number): Promise<Recipe | null> {
  return findRecipe(userId, id);
}

export async function createRecipe(
  userId: number,
  input: RecipeInput,
): Promise<SaveRecipeResult> {
  const clean = normalize(input);
  const rejection = await validate(clean);
  if (rejection !== null) {
    return { kind: 'invalid', reason: rejection };
  }
  return { kind: 'saved', id: await insertRecipe(userId, clean) };
}

/**
 * Enregistre une recette modifiée, et réaligne ce qu'elle fait acheter.
 *
 * Le réalignement n'est pas un détail d'intendance : les quantités d'une liste
 * de courses se déduisent des ingrédients et des parts de la recette. Corriger
 * « 200 g de riz » en « 400 g » sans toucher à la liste laissait acheter la
 * moitié de ce qu'il fallait, et rien à l'écran ne disait que la liste datait
 * d'avant la correction.
 *
 * Ce qui est déjà coché ou écrit à la main survit, comme pour un geste du
 * panier : le détail vit dans `planListSync`, avec ses raisons.
 */
export async function saveRecipe(
  userId: number,
  id: number,
  input: RecipeInput,
): Promise<SaveRecipeResult> {
  const clean = normalize(input);
  const rejection = await validate(clean);
  if (rejection !== null) {
    return { kind: 'invalid', reason: rejection };
  }
  if (!(await updateRecipe(userId, id, clean))) {
    return { kind: 'not_found' };
  }

  await syncListsForRecipe(userId, id);
  return { kind: 'saved', id };
}

/**
 * Supprime une recette, et retire des listes ouvertes ce qu'elle réclamait.
 *
 * Les semaines se lisent avant la suppression : la cascade emporte les lignes
 * de panier qui les portaient, et il n'y aurait ensuite plus rien à quoi
 * rattacher les listes à réaligner. Un article déjà coché reste, lui : il est
 * dans le chariot, et le voir disparaître ferait douter de l'avoir pris.
 */
export async function removeRecipe(userId: number, id: number): Promise<boolean> {
  const weeks = await basketWeeksForRecipe(userId, id);
  if (!(await deleteRecipe(userId, id))) {
    return false;
  }

  await syncListsForWeeks(userId, weeks);
  return true;
}

export function recipeCount(userId: number): Promise<number> {
  return countRecipes(userId);
}

/**
 * Les plats du panier d'une semaine, prêts à être partagés.
 *
 * Le panier et non le carnet : on partage ce qu'on va cuisiner cette semaine,
 * au moment où les courses sont faites, et le carnet entier noierait les cinq
 * plats du sac dans quarante fiches sans rapport. Le choix de n'en envoyer
 * qu'une partie se fait ensuite, à l'écran.
 *
 * Les quantités sont mises à l'échelle des parts du panier, comme le fait la
 * fiche et comme l'a fait la liste de courses. C'est la même fonction pour les
 * trois, et il le faut : le texte envoyé doit dire les grammes qu'on a dans
 * son sac, pas ceux qu'annonçait la recette avant qu'on change ses parts.
 *
 * Ce qui sort d'ici est volontairement maigre — ni macros, ni références
 * internes. Le détail et ses raisons vivent dans `ShareableRecipe`.
 */
export async function shareableRecipesFor(
  userId: number,
  weekStart: string,
): Promise<ShareableRecipe[]> {
  const basket = await listBasket(userId, weekStart);
  if (basket.length === 0) {
    return [];
  }

  // Une lecture par plat, comme pour la liste de courses : le carnet entier
  // coûterait tous les ingrédients de toutes les recettes pour n'en garder que
  // celles de la semaine.
  const recipes = await Promise.all(basket.map((item) => findRecipe(userId, item.recipeId)));

  const shareable: ShareableRecipe[] = [];
  for (const [index, recipe] of recipes.entries()) {
    // La recette a pu disparaître entre la lecture du panier et la sienne.
    // Le partage n'est pas le lieu où le signaler : les autres plats partent.
    if (recipe === null) {
      continue;
    }
    const servings = basket[index]?.servings ?? recipe.servings;
    shareable.push({
      id: recipe.id,
      name: recipe.name,
      servings,
      prepMinutes: recipe.prepMinutes,
      steps: recipe.steps,
      notes: recipe.notes,
      ingredients: ingredientsForServings(recipe.ingredients, recipe.servings, servings).map(
        (ingredient) => ({
          label: ingredient.label,
          quantityG: ingredient.quantityG,
          unitName: ingredient.unitName,
          unitGrams: ingredient.unitGrams,
        }),
      ),
    });
  }

  return shareable;
}
