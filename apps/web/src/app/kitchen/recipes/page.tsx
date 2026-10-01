import { PlusIcon, UtensilsIcon } from 'lucide-react';
import Link from 'next/link';
import { DomainHeader } from '@/components/DomainHeader';
import { Button } from '@/components/ui/button';
import { requireUserId } from '@/server/guard';
import { recipesFor } from '@/server/services/recipes';
import { listForWeek } from '@/server/services/shopping';
import { identityFor } from '@/server/services/social';
import { startOfWeek, todayInParis } from '@/lib/date';
import { initialsOf } from '@/lib/social';
import { macrosPerServing } from '@/lib/recipe';
import { KitchenTabs } from '../KitchenTabs';
import { RecipeGrid, type RecipeTile } from './RecipeGrid';

// Les recettes viennent du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/**
 * Les recettes d'un compte.
 *
 * C'est le carnet, pas le point d'entrée. On arrive ici pour relire ou
 * corriger une fiche ; la semaine se remplit depuis le catalogue, qui met les
 * plats choisis au panier et donc à la liste de courses.
 *
 * Les macros affichées sont celles d'une part et non de la recette entière :
 * c'est la seule grandeur qu'on compare à une cible, et la seule qu'on mange.
 */
export default async function RecipesPage() {
  const userId = await requireUserId();
  const weekStart = startOfWeek(todayInParis());
  const [recipes, identity, shopping] = await Promise.all([
    recipesFor(userId),
    identityFor(userId),
    listForWeek(userId, weekStart),
  ]);
  const shoppingLeft =
    shopping === null ? null : shopping.items.filter((item) => item.checkedAt === null).length;

  const tiles: RecipeTile[] = recipes.map((recipe) => {
    const { macros, unresolvedCount } = macrosPerServing(recipe);
    return {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      kcalPerServing: macros.kcal,
      partial: unresolvedCount > 0,
      imageUrl: recipe.imageUrl,
    };
  });

  return (
    <div className="flex flex-col gap-3 pb-16">
      <DomainHeader
        title="Cuisine"
        kicker={recipes.length === 1 ? '1 recette' : `${recipes.length} recettes`}
        icon={UtensilsIcon}
        tone="cook"
        initials={initialsOf(identity.displayName ?? identity.handle)}
      />

      <KitchenTabs current="recipes" weekStart={weekStart} shoppingLeft={shoppingLeft} />

      {recipes.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mx-auto max-w-[26ch] text-lg font-semibold tracking-tight">
            Aucune recette pour l’instant.
          </p>
          <p className="mx-auto mt-2 max-w-[32ch] text-muted-foreground">
            Le plus rapide est de choisir des plats dans le catalogue : ils s’installent ici et
            partent directement en liste de courses.
          </p>
          <Button asChild className="mt-5">
            <Link href="/kitchen/catalog">Parcourir le catalogue</Link>
          </Button>
        </div>
      ) : (
        <RecipeGrid recipes={tiles} />
      )}

      <Button
        asChild
        size="icon"
        className="fixed right-[max(1rem,calc(50vw-16rem+1rem))] top-[calc(var(--viewport-height)_-_9rem_-_var(--safe-bottom))] z-30 size-12 rounded-full bg-cook text-cook-on shadow-[0_8px_20px_-6px_rgb(247_160_7/0.6)] hover:bg-cook/90"
      >
        <Link href="/kitchen/recipes/new" aria-label="Nouvelle recette">
          <PlusIcon className="size-6" />
        </Link>
      </Button>
    </div>
  );
}
