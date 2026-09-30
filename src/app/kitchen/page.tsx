import { ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/button';
import { requireUserId } from '@/server/guard';
import { basketFor } from '@/server/services/basket';
import { planForWeek, weekDays } from '@/server/services/meal-plan';
import { targetFor } from '@/server/services/profile';
import { recipesFor } from '@/server/services/recipes';
import { formatWeekRange, isJournalDate, startOfWeek, todayInParis } from '@/lib/date';
import { KitchenTabs } from './KitchenTabs';
import { WeekBasket } from './WeekBasket';
import { WeekPlanner } from './WeekPlanner';

// Le plan vient du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/**
 * La Cuisine s'ouvre sur la semaine, et non sur les recettes.
 *
 * L'ordre n'est pas neutre. On ouvre cet écran pour savoir ce qu'on mange ce
 * soir, pas pour relire ses fiches : c'est la question quotidienne, et c'est
 * elle qui doit être en première page. Les recettes sont l'outil, la semaine
 * est l'usage.
 *
 * Le panier vient avant le plan pour la même raison. Il porte les deux gestes
 * du début de semaine — choisir, puis acheter — et le plan celui du soir même.
 *
 * Composant serveur, aucun import client (AD-10).
 */
export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const userId = await requireUserId();
  const today = todayInParis();

  // Une date hors format retombe sur la semaine courante plutôt que de faire
  // échouer l'écran : le paramètre vient d'une URL, que n'importe qui édite.
  const requested = (await searchParams).from;
  const startDate = startOfWeek(
    requested !== undefined && isJournalDate(requested) ? requested : today,
  );

  const [planned, recipes, basket, target] = await Promise.all([
    planForWeek(userId, startDate),
    recipesFor(userId),
    basketFor(userId, startDate),
    targetFor(userId),
  ]);

  const basketRecipeIds = new Set(basket.map((item) => item.recipeId));

  return (
    <>
      <ScreenHeader
        title="Cuisine"
        kicker={formatWeekRange(startDate)}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/kitchen/shopping?from=${startDate}`}>
              <ShoppingCartIcon />
              Courses
            </Link>
          </Button>
        }
      />

      <KitchenTabs current="week" />

      <WeekBasket weekStart={startDate} basket={basket} />

      {recipes.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mx-auto max-w-[26ch] text-lg font-semibold tracking-tight">
            Une semaine se remplit avec des plats.
          </p>
          <p className="mx-auto mt-2 max-w-[32ch] text-muted-foreground">
            Choisis-les dans le catalogue, ou écris les tiens.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/kitchen/recipes">Écrire mes propres recettes</Link>
          </Button>
        </div>
      ) : (
        <WeekPlanner
          startDate={startDate}
          days={weekDays(startDate)}
          planned={planned}
          recipes={recipes}
          basketRecipeIds={basketRecipeIds}
          today={today}
          targetKcal={target?.targetKcal ?? null}
        />
      )}
    </>
  );
}
