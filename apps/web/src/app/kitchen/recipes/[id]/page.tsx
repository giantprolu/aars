import { ChefHatIcon, ClockIcon, PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BottomBar } from '@/components/BottomBar';
import { DishImage } from '@/components/DishImage';
import { NavHeader } from '@/components/ScreenHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { requireUserId } from '@/server/guard';
import { basketFor } from '@/server/services/basket';
import { recipeFor } from '@/server/services/recipes';
import { targetFor } from '@/server/services/profile';
import {
  formatServings,
  macrosPerServing,
  portionWeight,
  suggestedServings,
} from '@/lib/recipe';
import { formatGrams, formatKcal } from '@/lib/nutrition';
import { isJournalDate, startOfWeek, todayInParis } from '@/lib/date';
import { AddToBasket } from './AddToBasket';
import { DeleteRecipe } from './DeleteRecipe';
import { RecipeIngredients } from './RecipeIngredients';

export const dynamic = 'force-dynamic';

/**
 * Fiche d'une recette.
 *
 * Les macros affichées sont celles d'une part, et le total n'est rappelé qu'en
 * second : on ne mange pas une recette, on en mange une part. C'est aussi la
 * seule grandeur comparable à la cible de la journée.
 *
 * Les quantités, elles, sont celles du panier quand le plat y figure, et non
 * celles écrites dans la recette. On ouvre cette fiche depuis sa liste de
 * repas, le sac de courses posé sur la table : le riz qu'on y a mis pèse ce
 * que la liste a fait acheter, pas ce que la recette annonçait pour un nombre
 * de parts qu'on a changé depuis.
 */
export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const userId = await requireUserId();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    notFound();
  }

  const recipe = await recipeFor(userId, id);
  if (recipe === null) {
    notFound();
  }

  // La semaine d'où l'on vient, à défaut celle du jour : on arrive ici depuis
  // le panier d'une semaine précise, et c'est son panier qui décide des
  // quantités. Une date hors format retombe sur la semaine courante plutôt que
  // de faire échouer l'écran, le paramètre venant d'une URL.
  const requested = (await searchParams).from;
  const weekStart = startOfWeek(
    requested !== undefined && isJournalDate(requested) ? requested : todayInParis(),
  );
  const [basket, target] = await Promise.all([basketFor(userId, weekStart), targetFor(userId)]);
  const chosen = basket.find((item) => item.recipeId === recipe.id) ?? null;

  // Hors panier, la recette parle pour elle-même : ses propres parts.
  const servings = chosen === null ? recipe.servings : chosen.servings;
  // La part reste la part : la mise à l'échelle ne la change pas, et c'est
  // pourquoi elle se lit sur la recette et non sur les quantités affichées.
  const perServing = macrosPerServing(recipe);
  // Ce qu'une part pèse, et combien en manger pour tenir la cible : les deux
  // réponses que « une part » laissait en suspens.
  const plateGrams = portionWeight(recipe.ingredients, recipe.servings);
  const targetKcal = target?.targetKcal ?? null;
  const atLunch = suggestedServings(perServing.macros.kcal, targetKcal, 'lunch');
  const atDinner = suggestedServings(perServing.macros.kcal, targetKcal, 'dinner');
  const hasSteps = recipe.steps.length > 0;

  return (
    <>
      <NavHeader
        label="Recettes"
        href="/kitchen/recipes"
        action={
          <Button asChild variant="ghost" size="icon">
            <Link href={`/kitchen/recipes/${recipe.id}/edit`} aria-label="Modifier la recette">
              <PencilIcon className="size-[19px]" />
            </Link>
          </Button>
        }
      />

      <DishImage
        src={recipe.imageUrl}
        alt=""
        sizes="(max-width: 32rem) 100vw, 32rem"
        className="h-[190px] rounded-xl border"
      />

      <h1 className="mt-4 text-[22px] font-semibold tracking-tight">{recipe.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {recipe.prepMinutes === null ? null : (
          <Badge variant="outline" className="tabular">
            <ClockIcon />
            {recipe.prepMinutes} min
          </Badge>
        )}
        <Badge variant="outline" className="tabular">
          {formatServings(servings)}
        </Badge>
        {chosen === null ? null : <Badge variant="secondary">Au panier</Badge>}
      </div>

      <Card className="mt-4 bg-muted">
        <CardContent className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[12.5px] text-muted-foreground">Par part</p>
            <p className="tabular mt-px text-[26px] font-semibold tracking-tight">
              {perServing.unresolvedCount > 0 ? '≈ ' : ''}
              {formatKcal(perServing.macros.kcal)} kcal
            </p>
          </div>
          <p className="tabular text-right text-[12.5px] text-muted-foreground">
            {formatGrams(perServing.macros.proteinG)} g P · {formatGrams(perServing.macros.carbsG)}{' '}
            g G · {formatGrams(perServing.macros.fatG)} g L
          </p>
        </CardContent>
        <CardContent className="tabular -mt-2 flex flex-col gap-0.5 text-[12.5px] text-muted-foreground">
          {plateGrams > 0 ? <p>Une part ≈ {plateGrams.toLocaleString('fr-FR')} g dans l’assiette</p> : null}
          {atLunch !== null && atDinner !== null ? (
            <p>
              Pour ta cible : {formatServings(atLunch)} au déjeuner,{' '}
              {formatServings(atDinner)} au dîner
            </p>
          ) : null}
        </CardContent>
      </Card>

      {perServing.unresolvedCount > 0 ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>
            {perServing.unresolvedCount === 1
              ? "Un ingrédient n'a plus de fiche nutritionnelle : le total est incomplet."
              : `${perServing.unresolvedCount} ingrédients n'ont plus de fiche nutritionnelle : le total est incomplet.`}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="ingredients" className="mt-4 gap-0">
        <TabsList className="w-full">
          <TabsTrigger value="ingredients">Ingrédients</TabsTrigger>
          <TabsTrigger value="steps" disabled={!hasSteps}>
            Préparation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingredients" className="mt-2.5">
          <RecipeIngredients
            ingredients={recipe.ingredients}
            recipeServings={recipe.servings}
            initialServings={servings}
            basketServings={chosen === null ? null : chosen.servings}
          />
        </TabsContent>

        {hasSteps ? (
          <TabsContent value="steps" className="mt-3">
            <ol className="flex flex-col gap-3">
              {recipe.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span
                    aria-hidden
                    className="tabular flex size-6 flex-none items-center justify-center rounded-full bg-muted text-[12px] font-semibold"
                  >
                    {index + 1}
                  </span>
                  <span className="text-[15px] leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </TabsContent>
        ) : null}
      </Tabs>

      <DeleteRecipe id={recipe.id} name={recipe.name} />

      <BottomBar className="flex gap-2.5">
        <AddToBasket
          recipeId={recipe.id}
          servings={recipe.servings}
          weekStart={weekStart}
          alreadyChosen={chosen !== null}
        />
        {hasSteps ? (
          <Button asChild className="flex-[1.4]">
            <Link href={`/kitchen/recipes/${recipe.id}/cook`}>
              <ChefHatIcon />
              Cuisiner pas à pas
            </Link>
          </Button>
        ) : null}
      </BottomBar>
    </>
  );
}
