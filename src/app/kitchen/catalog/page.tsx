import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { requireUserId } from '@/server/guard';
import { basketFor, installedFor } from '@/server/services/basket';
import { profileFor } from '@/server/services/profile';
import { catalogFor } from '@/lib/meal-catalog';
import { cookingYield } from '@/lib/recipe';
import type { Goal } from '@/lib/energy';
import { formatWeekRange, isJournalDate, startOfWeek, todayInParis } from '@/lib/date';
import { CatalogPicker, type CatalogCard } from './CatalogPicker';

// Le panier vient du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];

function isGoal(value: string | undefined): value is Goal {
  return value !== undefined && (GOALS as readonly string[]).includes(value);
}

/**
 * Le choix des repas de la semaine.
 *
 * Premier écran du parcours : on choisit ici, on achète ensuite, on décide du
 * jour au dernier moment. C'est l'ordre dans lequel la semaine se décide
 * réellement, et non celui d'un planificateur qui demande de remplir
 * vingt et une cases avant de rendre le moindre service.
 *
 * L'onglet ouvert est celui de l'objectif du profil, sans y être enfermé : un
 * dîner de maintien n'est pas interdit à qui cherche à perdre du poids, et
 * l'onglet n'est qu'un point de départ.
 *
 * Seul l'objectif ouvert descend au client, et il descend en entier — étapes
 * et ingrédients compris, puisque le détail d'un plat s'ouvre sans aller-retour
 * au serveur. Envoyer les trois objectifs triplerait la charge utile pour
 * afficher la même liste de vingt-quatre noms.
 *
 * Composant serveur, aucun import client (AD-10).
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; goal?: string }>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  // Une date hors format retombe sur la semaine courante plutôt que de faire
  // échouer l'écran : le paramètre vient d'une URL, que n'importe qui édite.
  const weekStart = startOfWeek(
    params.from !== undefined && isJournalDate(params.from) ? params.from : todayInParis(),
  );

  const [profile, basket, installed] = await Promise.all([
    profileFor(userId),
    basketFor(userId, weekStart),
    installedFor(userId),
  ]);

  // L'objectif de l'URL l'emporte sur celui du profil : c'est un onglet, et
  // l'utilisateur vient de le toucher. Le maintien est le repli d'un compte
  // sans profil renseigné, comme le plus large des trois.
  const goal: Goal = isGoal(params.goal)
    ? params.goal
    : isGoal(profile?.goal)
      ? profile.goal
      : 'maintain';

  const chosenRecipeIds = new Set(basket.map((item) => item.recipeId));

  const meals: CatalogCard[] = catalogFor(goal).map((meal) => {
    const recipeId = installed.get(meal.slug);
    return {
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
        cookedYield: cookingYield(ingredient.searchTerm),
      })),
      kcal: meal.estimate.kcal,
      proteinG: meal.estimate.proteinG,
      inBasket: recipeId !== undefined && chosenRecipeIds.has(recipeId),
    };
  });

  return (
    <>
      <NavHeader label="Cuisine" href={`/kitchen?from=${weekStart}`} />
      <PageTitle title="Choisir mes repas" description={formatWeekRange(weekStart)} />

      <CatalogPicker
        weekStart={weekStart}
        goal={goal}
        meals={meals}
        basketCount={basket.length}
      />
    </>
  );
}
