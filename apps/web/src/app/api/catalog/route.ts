import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { installedFor } from '@/server/services/basket';
import { MAX_CHOSEN_MEALS, catalogFor, installCatalogMeals } from '@/server/services/catalog';
import { profileFor } from '@/server/services/profile';
import type { Goal } from '@/lib/energy';

export const runtime = 'nodejs';

const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];

function isGoal(value: string | null | undefined): value is Goal {
  return typeof value === 'string' && (GOALS as readonly string[]).includes(value);
}

/**
 * Le catalogue de plats pour les apps : ceux d'un objectif, chacun avec son
 * moment, sa photo, ses ingrédients et la recette du compte qui en est la
 * copie (`recipeId`, `null` s'il n'est pas installé).
 *
 * `?goal=` choisit un autre objectif que celui du profil, comme l'onglet de
 * la PWA ; un compte sans profil voit le maintien, le plus large des trois.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const asked = new URL(request.url).searchParams.get('goal');
  const [profile, installed] = await Promise.all([profileFor(userId), installedFor(userId)]);
  const goal: Goal = isGoal(asked) ? asked : isGoal(profile?.goal) ? profile.goal : 'maintain';

  const meals = (await catalogFor(goal)).map((meal) => ({
    slug: meal.slug,
    name: meal.name,
    slot: meal.slot,
    servings: meal.servings,
    prepMinutes: meal.prepMinutes,
    steps: meal.steps,
    ingredients: meal.ingredients.map((ingredient) => ({
      label: ingredient.label,
      quantityG: ingredient.quantityG,
      unitName: ingredient.unitName ?? null,
      unitGrams: ingredient.unitGrams ?? null,
    })),
    imageUrl: meal.imageUrl,
    kcal: meal.estimate.kcal,
    proteinG: meal.estimate.proteinG,
    recipeId: installed.get(meal.slug) ?? null,
  }));
  return Response.json({ goal, meals });
}

const installSchema = z.object({
  slugs: z.array(z.string().min(1).max(80)).min(1).max(MAX_CHOSEN_MEALS),
});

/**
 * Ajoute des plats aux recettes du compte, sans les mettre au panier : c'est
 * `POST /api/basket` (`source: 'catalog'`) qui choisit pour la semaine.
 * Rejouable : un plat déjà installé rend sa recette telle qu'elle est.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }
  const parsed = installSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const report = await installCatalogMeals(userId, parsed.data.slugs);
  return Response.json(
    {
      installed: report.installed,
      failed: report.failed,
      skippedIngredients: report.skippedIngredients,
      recipes: report.recipes.map((recipe) => ({ slug: recipe.slug, recipeId: recipe.recipeId })),
    },
    { status: 201 },
  );
}
