import { notFound } from 'next/navigation';
import { requireUserId } from '@/server/guard';
import { recipeFor } from '@/server/services/recipes';
import { basketFor } from '@/server/services/basket';
import { planForWeek } from '@/server/services/meal-plan';
import { startOfWeek, todayInParis } from '@/lib/date';
import { CookMode } from './CookMode';

export const dynamic = 'force-dynamic';

/**
 * Mode cuisine d'une recette.
 *
 * Le plat prévu aujourd'hui pour cette recette est cherché ici : s'il existe
 * et n'a pas encore été mangé, c'est lui que la fin du parcours marquera, avec
 * le nombre de parts prévu. Sans cette lecture, cuisiner un plat du plan en
 * créerait un second à côté, et la journée compterait le repas deux fois.
 *
 * Deux nombres de parts cohabitent donc, et les confondre serait une erreur :
 * on cuisine la fournée entière — celle du panier, celle qu'on a achetée — et
 * on n'en mange qu'une partie ce soir. Les ingrédients suivent la première,
 * le journal la seconde.
 */
export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    notFound();
  }

  const recipe = await recipeFor(userId, id);
  if (recipe === null) {
    notFound();
  }

  const today = todayInParis();
  const weekStart = startOfWeek(today);
  const [planned, basket] = await Promise.all([
    planForWeek(userId, weekStart),
    basketFor(userId, weekStart),
  ]);

  const match = planned.find(
    (entry) =>
      entry.planDate === today && entry.recipeId === recipe.id && entry.journaledAt === null,
  );

  // Hors panier, la fournée est celle que la recette produit : on n'a rien
  // acheté pour elle, il n'y a donc pas d'autre vérité que la sienne.
  const chosen = basket.find((item) => item.recipeId === recipe.id) ?? null;
  const batchServings = chosen === null ? recipe.servings : chosen.servings;

  return (
    <CookMode
      recipe={recipe}
      batchServings={batchServings}
      plannedId={match?.id ?? null}
      plannedServings={match?.servings ?? null}
    />
  );
}
