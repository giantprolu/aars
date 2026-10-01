'use client';

import { CheckIcon, ChevronRightIcon, MinusIcon, PlusIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { journalRecipe } from '@/lib/client/recipes';
import { MAX_PLANNED_SERVINGS } from '@/lib/basket';
import { MEALS, MEAL_LABELS, isMeal, type Meal } from '@/lib/meal';
import { useInitialMeal } from '@/lib/client/meal-param';
import { formatKcal, formatGrams, scaleMacros } from '@/lib/nutrition';
import { formatServings, suggestedServings } from '@/lib/recipe';
import type { Macros } from '@/lib/types';
import { parseDecimal } from '@/lib/utils';

/**
 * Ajout d'un plat du carnet au journal, cinquième chemin de /add.
 *
 * Les quatre autres partent d'un aliment : on cherche une fiche, on pèse, on
 * enregistre une ligne. Celui-ci part d'un plat déjà écrit, dont les
 * ingrédients et les parts sont connus — il ne reste qu'à dire combien de
 * parts ont été mangées. La quantité en grammes n'a donc pas de sens ici, et
 * `QuantityPad` n'est pas réutilisé : la grandeur qu'on manipule est la part.
 *
 * Ce que cela écrit est ce qu'écrit déjà « J'ai mangé ça » du plan : une ligne
 * par ingrédient, mise à l'échelle des parts, avec les produits réellement
 * achetés quand on les connaît. Un plat cuisiné hors plan ne doit pas arriver
 * au journal sous une autre forme que le même plat prévu la veille.
 */

/** Ce que l'écran montre d'une recette. Les macros sont calculées au serveur. */
export interface RecipeChoice {
  id: number;
  name: string;
  servings: number;
  prepMinutes: number | null;
  ingredientCount: number;
  perServing: Macros;
  /** Au moins un ingrédient sans fiche : le chiffre est un plancher. */
  partial: boolean;
}

type Step =
  | { name: 'pick' }
  | { name: 'servings'; recipe: RecipeChoice }
  /** Des lignes sont parties, d'autres non : on ne quitte pas sans le dire. */
  | { name: 'partial'; created: number; skipped: string[] };

/** Pas des boutons moins et plus. Une demi-part : on se ressert rarement par quart. */
const STEP_SERVINGS = 0.5;

/** Ce qu'on mange d'un plat, par défaut. Une part : on cuisine pour plusieurs jours. */
const DEFAULT_SERVINGS = 1;

function formatServingsInput(value: number): string {
  return String(value).replace('.', ',');
}

/** Sans accents ni casse : « creme » doit trouver « Crème brûlée ». */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function RecipeFlow({
  recipes,
  targetKcal,
}: {
  recipes: readonly RecipeChoice[];
  /** La cible du jour, pour proposer la part qui y tient ; `null` sans profil. */
  targetKcal: number | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [term, setTerm] = useState('');
  // La saisie reste du texte : « 1, » doit survivre le temps de taper le 5.
  const [servingsText, setServingsText] = useState(String(DEFAULT_SERVINGS));
  const servings = parseDecimal(servingsText);
  const initialMeal = useInitialMeal();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  // Tant qu'on n'a pas touché aux parts, elles suivent la cible et le repas :
  // passer du déjeuner au dîner change la part conseillée.
  const [servingsTouched, setServingsTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function suggestedFor(recipe: RecipeChoice, forMeal: Meal): number {
    return suggestedServings(recipe.perServing.kcal, targetKcal, forMeal) ?? DEFAULT_SERVINGS;
  }

  function pick(recipe: RecipeChoice) {
    setError(null);
    setServingsTouched(false);
    setServingsText(formatServingsInput(suggestedFor(recipe, meal)));
    setStep({ name: 'servings', recipe });
  }

  function changeMeal(next: Meal) {
    setMeal(next);
    if (step.name === 'servings' && !servingsTouched) {
      setServingsText(formatServingsInput(suggestedFor(step.recipe, next)));
    }
  }

  function stepBy(delta: number) {
    setServingsTouched(true);
    const current = Number.isFinite(servings) ? servings : 0;
    const next = Math.min(MAX_PLANNED_SERVINGS, Math.max(STEP_SERVINGS, current + delta));
    setServingsText(formatServingsInput(Math.round(next * 2) / 2));
  }

  async function save(recipeId: number) {
    setSubmitting(true);
    setError(null);

    const outcome = await journalRecipe(recipeId, { meal, servings });
    setSubmitting(false);

    if (outcome.kind !== 'journaled') {
      setError(
        outcome.kind === 'unauthorized'
          ? 'Session expirée.'
          : outcome.kind === 'refused'
            ? outcome.message
            : 'Enregistrement impossible.',
      );
      return;
    }

    // Les ingrédients sans fiche sont dits, jamais tus : le total de la journée
    // est plus bas qu'il ne devrait, et rien d'autre ne le dirait. Filer au
    // journal emporterait le seul écran qui pouvait encore les nommer.
    if (outcome.skipped.length > 0) {
      setStep({ name: 'partial', created: outcome.created, skipped: outcome.skipped });
      return;
    }

    router.replace('/');
    router.refresh();
  }

  if (step.name === 'partial') {
    return (
      <>
        <NavHeader label="Journal" href="/" mode="close" />
        <div className="pt-2">
          <span
            aria-hidden
            className="flex size-11 items-center justify-center rounded-full bg-muted [&_svg]:size-6"
          >
            <CheckIcon />
          </span>
          <h1 className="mt-3.5 text-[22px] font-semibold tracking-tight">
            {step.created === 1 ? '1 ligne ajoutée' : `${step.created} lignes ajoutées`}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sans fiche, donc non comptés : {step.skipped.join(', ')}. Le total de la journée est
            plus bas que ce que tu as mangé.
          </p>
        </div>
        <BottomBar>
          {/*
            Un bouton et non un lien : le journal doit être relu, pas seulement
            affiché. Les lignes qui viennent d'être écrites sont exactement ce
            qu'on vient voir.
          */}
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              router.replace('/');
              router.refresh();
            }}
          >
            Voir le journal
          </Button>
        </BottomBar>
      </>
    );
  }

  if (step.name === 'servings') {
    const { recipe } = step;
    const valid = Number.isFinite(servings) && servings > 0 && servings <= MAX_PLANNED_SERVINGS;
    // Ce qui compte est ce qu'on va manger, pas ce que la recette produit :
    // une part de plus double le chiffre affiché.
    const eaten = valid ? scaleMacros(recipe.perServing, servings * 100) : null;

    return (
      <>
        <NavHeader
          label="Mes recettes"
          onDismiss={() => {
            setError(null);
            setStep({ name: 'pick' });
          }}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !submitting) {
              void save(recipe.id);
            }
          }}
        >
          <div className="pt-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight">{recipe.name}</h2>
              <Badge variant="outline">Recette</Badge>
            </div>
            <p className="tabular mt-1 text-[13px] text-muted-foreground">
              {recipe.partial ? '≈ ' : ''}
              {formatKcal(recipe.perServing.kcal)} kcal · {formatGrams(recipe.perServing.proteinG)}{' '}
              P · {formatGrams(recipe.perServing.carbsG)} G ·{' '}
              {formatGrams(recipe.perServing.fatG)} L, par part
            </p>
          </div>

          <Separator className="my-4" />

          <Label htmlFor="servings">Parts mangées</Label>
          <div className="mt-2 flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => stepBy(-STEP_SERVINGS)}
              aria-label="Retirer une demi-part"
            >
              <MinusIcon className="size-[19px]" />
            </Button>
            <Input
              id="servings"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={servingsText}
              onChange={(event) => {
                setServingsTouched(true);
                setServingsText(event.target.value);
              }}
              aria-invalid={!valid}
              aria-describedby={valid ? undefined : 'servings-error'}
              className="tabular h-11 flex-1 text-center text-[19px] font-semibold md:text-[19px]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => stepBy(STEP_SERVINGS)}
              aria-label="Ajouter une demi-part"
            >
              <PlusIcon className="size-[19px]" />
            </Button>
          </div>

          {valid ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {!servingsTouched &&
              suggestedServings(recipe.perServing.kcal, targetKcal, meal) !== null
                ? `Ajusté à ta cible pour ce repas. `
                : ''}
              Sur les {formatServings(recipe.servings)} de la recette.{' '}
              {recipe.ingredientCount === 1
                ? '1 ligne au journal'
                : `${recipe.ingredientCount} lignes au journal`}
              , une par ingrédient.
            </p>
          ) : (
            <p id="servings-error" role="alert" className="mt-2 text-destructive">
              Entre une demi-part et {MAX_PLANNED_SERVINGS} parts.
            </p>
          )}

          <Separator className="mt-5 mb-3.5" />

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12.5px] text-muted-foreground">Ajouté au journal</p>
              <p className="tabular mt-px text-[25px] font-semibold tracking-tight">
                {eaten ? `${recipe.partial ? '≈ ' : ''}${formatKcal(eaten.kcal)} kcal` : '—'}
              </p>
            </div>
            {eaten ? (
              <p className="tabular text-right text-[12.5px] text-muted-foreground">
                {formatGrams(eaten.proteinG)} g P
                <br />
                {formatGrams(eaten.carbsG)} g G
                <br />
                {formatGrams(eaten.fatG)} g L
              </p>
            ) : null}
          </div>

          {error ? <ErrorAlert>{error}</ErrorAlert> : null}

          <BottomBar className="flex gap-2.5">
            <Select value={meal} onValueChange={(value) => isMeal(value) && changeMeal(value)}>
              <SelectTrigger aria-label="Repas" className="h-10 flex-1 data-[size=default]:h-10">
                <span className="text-muted-foreground">Repas :</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEALS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MEAL_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!valid || submitting} className="flex-1">
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </BottomBar>
        </form>
      </>
    );
  }

  const needle = fold(term.trim());
  const shown = needle === '' ? recipes : recipes.filter((r) => fold(r.name).includes(needle));

  return (
    <>
      <NavHeader label="Ajouter" href="/add" />

      {recipes.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mx-auto max-w-[26ch] text-lg font-semibold tracking-tight">
            Aucune recette pour l’instant.
          </p>
          <p className="mx-auto mt-2 max-w-[32ch] text-muted-foreground">
            Le plus rapide est de choisir des plats dans le catalogue : ils s’installent dans ton
            carnet et deviennent ajoutables d’un geste.
          </p>
          <div className="mt-5 flex flex-col items-center gap-2.5">
            <Button asChild>
              <Link href="/kitchen/catalog">Parcourir le catalogue</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/kitchen/recipes/new">Écrire une recette</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              autoComplete="off"
              aria-label="Filtrer mes recettes"
              placeholder="Filtrer mes recettes"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className="pl-9 [&::-webkit-search-cancel-button]:hidden"
            />
          </div>

          {shown.length === 0 ? (
            <p className="mt-5 text-muted-foreground">Aucune recette ne correspond.</p>
          ) : (
            <ul className="mt-2">
              {shown.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    type="button"
                    onClick={() => pick(recipe)}
                    className="flex w-full items-center gap-3 border-b py-2.5 text-left transition-colors active:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium tracking-tight">
                        {recipe.name}
                      </span>
                      <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                        {formatServings(recipe.servings)}
                        {' · '}
                        {recipe.ingredientCount === 1
                          ? '1 ingrédient'
                          : `${recipe.ingredientCount} ingrédients`}
                        {recipe.prepMinutes === null ? '' : ` · ${recipe.prepMinutes} min`}
                      </span>
                    </span>
                    <span className="tabular flex-none text-[13px] font-medium">
                      {/*
                        Le total est dit partiel plutôt que faux : un ingrédient
                        qu'on n'a pas su résoudre fait un chiffre trop bas.
                      */}
                      {recipe.partial ? '≈ ' : ''}
                      {formatKcal(recipe.perServing.kcal)}
                      <span className="font-normal text-muted-foreground"> kcal / part</span>
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="size-4 flex-none text-muted-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
