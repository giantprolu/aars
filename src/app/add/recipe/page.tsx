import { requireUserId } from '@/server/guard';
import { recipesFor } from '@/server/services/recipes';
import { macrosPerServing } from '@/lib/recipe';
import { RecipeFlow, type RecipeChoice } from './RecipeFlow';

// Le carnet vient du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/**
 * Ajout d'un plat du carnet au journal.
 *
 * Les macros d'une part sont calculées ici et non dans le navigateur : les
 * ingrédients d'une recette sont ce qu'elle a de plus lourd, et l'écran n'en
 * montre qu'un nombre et quelques chiffres. Descendre quarante fiches pour
 * afficher « 620 kcal / part » ferait payer la liste entière à chaque
 * ouverture.
 */
export default async function AddRecipePage() {
  const recipes = await recipesFor(await requireUserId());

  const choices: RecipeChoice[] = recipes.map((recipe) => {
    const { macros, unresolvedCount } = macrosPerServing(recipe);
    return {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      ingredientCount: recipe.ingredients.length,
      perServing: macros,
      partial: unresolvedCount > 0,
    };
  });

  return <RecipeFlow recipes={choices} />;
}
