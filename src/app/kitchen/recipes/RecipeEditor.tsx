'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MIN_QUERY_LENGTH, SEARCH_DEBOUNCE_MS, searchFoods } from '@/lib/client/search';
import { cacheProduct } from '@/lib/client/products';
import { createRecipe, updateRecipe } from '@/lib/client/recipes';
import {
  MAX_INGREDIENTS,
  MAX_SERVINGS,
  formatIngredientQuantity,
  recipeMacros,
  type Recipe,
  type RecipeIngredient,
} from '@/lib/recipe';
import { MAX_QUANTITY_G, formatGrams, formatKcal, scaleMacros } from '@/lib/nutrition';
import type { SearchHit } from '@/lib/types';

/**
 * Rédaction d'une recette.
 *
 * Un ingrédient est ajouté à 100 g puis ajusté sur place, plutôt que par un
 * pavé de quantité ouvert à chaque fois comme dans le parcours d'ajout au
 * journal. La différence tient à ce qu'on fait : le journal enregistre un
 * geste, une quantité à la fois, et peut s'offrir un écran par aliment ; une
 * recette s'écrit d'un bloc, six ingrédients de suite, et six allers-retours
 * la rendraient pénible à saisir.
 *
 * Les étapes tiennent dans une seule zone de texte, une par ligne. Une liste
 * de champs ajoutables coûterait deux touches par étape pour le même résultat.
 */

/** Quantité proposée à l'ajout, en grammes. Toujours corrigée, jamais devinée juste. */
const DEFAULT_QUANTITY_G = 100;

/** Ce que l'éditeur manipule : un ingrédient, plus la fiche qui l'a produit. */
type DraftIngredient = Omit<RecipeIngredient, 'id' | 'position'>;

const SOURCE_LABEL: Record<SearchHit['origin'], string> = {
  ciqual: 'CIQUAL',
  cache: 'Scanné',
  off: 'Open Food Facts',
};

function toDraft(ingredient: RecipeIngredient): DraftIngredient {
  return {
    refKind: ingredient.refKind,
    refValue: ingredient.refValue,
    label: ingredient.label,
    quantityG: ingredient.quantityG,
    unitName: ingredient.unitName,
    unitGrams: ingredient.unitGrams,
    per100g: ingredient.per100g,
  };
}

export function RecipeEditor({ recipe }: { recipe: Recipe | null }) {
  const router = useRouter();

  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [prepMinutes, setPrepMinutes] = useState(
    recipe?.prepMinutes === null || recipe?.prepMinutes === undefined
      ? ''
      : String(recipe.prepMinutes),
  );
  const [steps, setSteps] = useState((recipe?.steps ?? []).join('\n'));
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(
    (recipe?.ingredients ?? []).map(toDraft),
  );

  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (term.trim().length < MIN_QUERY_LENGTH) {
      setHits(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const outcome = await searchFoods(term, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setSearching(false);
      setHits(outcome.kind === 'hits' ? outcome.hits : []);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  /**
   * Ajoute un résultat à la liste.
   *
   * Un produit venu de la recherche Open Food Facts n'est pas encore en base.
   * Sans cette mise en cache, la recette porterait une référence vers un
   * produit que rien ne connaît, et le serveur la refuserait — à juste titre,
   * puisqu'aucune macro ne pourrait en être tirée.
   */
  async function add(hit: SearchHit) {
    if (ingredients.length >= MAX_INGREDIENTS) {
      setError(`Une recette ne peut pas dépasser ${MAX_INGREDIENTS} ingrédients.`);
      return;
    }

    if (hit.origin === 'off') {
      const stored = await cacheProduct({
        barcode: hit.ref,
        name: hit.name,
        per100g: hit.per100g,
        servingSizeG: hit.servingSizeG,
        source: 'off',
      });
      if (stored === null) {
        setError("Ce produit n'a pas pu être enregistré. Réessaie.");
        return;
      }
    }

    setError(null);
    setIngredients((current) => [
      ...current,
      {
        refKind: hit.kind,
        refValue: hit.ref,
        label: hit.name,
        quantityG: DEFAULT_QUANTITY_G,
        unitName: null,
        unitGrams: null,
        per100g: hit.per100g,
      },
    ]);
    setTerm('');
    setHits(null);
    searchRef.current?.focus();
  }

  function patch(index: number, change: Partial<DraftIngredient>) {
    setIngredients((current) =>
      current.map((ingredient, position) =>
        position === index ? { ...ingredient, ...change } : ingredient,
      ),
    );
  }

  function remove(index: number) {
    setIngredients((current) => current.filter((_, position) => position !== index));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    const parsedServings = Number(servings.replace(',', '.'));
    const parsedPrep = prepMinutes.trim() === '' ? null : Number(prepMinutes);

    const outcome = await (recipe === null
      ? createRecipe({
          name,
          servings: parsedServings,
          steps: steps.split('\n'),
          prepMinutes: parsedPrep,
          notes: null,
          ingredients: ingredients.map((ingredient) => ({
            refKind: ingredient.refKind,
            refValue: ingredient.refValue,
            label: ingredient.label,
            quantityG: ingredient.quantityG,
            unitName: ingredient.unitName,
            unitGrams: ingredient.unitGrams,
          })),
        })
      : updateRecipe(recipe.id, {
          name,
          servings: parsedServings,
          steps: steps.split('\n'),
          prepMinutes: parsedPrep,
          notes: null,
          ingredients: ingredients.map((ingredient) => ({
            refKind: ingredient.refKind,
            refValue: ingredient.refValue,
            label: ingredient.label,
            quantityG: ingredient.quantityG,
            unitName: ingredient.unitName,
            unitGrams: ingredient.unitGrams,
          })),
        }));

    if (outcome.kind === 'saved') {
      router.replace(`/kitchen/recipes/${outcome.id}`);
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(
      outcome.kind === 'invalid'
        ? outcome.message
        : outcome.kind === 'unauthorized'
          ? 'Session expirée.'
          : 'Enregistrement impossible.',
    );
  }

  // Le total se recalcule à chaque frappe : c'est lui qui dit si la recette
  // tient dans la journée, et l'attendre après enregistrement serait trop tard.
  const total = recipeMacros(
    ingredients.map((ingredient, position) => ({ ...ingredient, id: -position, position })),
  );
  const parsedServings = Number(servings.replace(',', '.'));
  const perServing =
    Number.isFinite(parsedServings) && parsedServings > 0
      ? scaleMacros(total.macros, 100 / parsedServings)
      : null;

  const canSubmit =
    name.trim().length > 0 &&
    ingredients.length > 0 &&
    Number.isFinite(parsedServings) &&
    parsedServings > 0 &&
    parsedServings <= MAX_SERVINGS &&
    !submitting;

  return (
    <>
      <NavHeader
        label={recipe === null ? 'Recettes' : recipe.name}
        href={recipe === null ? '/kitchen/recipes' : `/kitchen/recipes/${recipe.id}`}
      />
      <PageTitle
        title={recipe === null ? 'Nouvelle recette' : 'Modifier la recette'}
        className="mb-5"
      />

      <div className="flex flex-col gap-3.5">
        <div className="grid gap-2">
          <Label htmlFor="recipe-name">Nom du plat</Label>
          <Input
            id="recipe-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Riz, œufs et légumes"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="recipe-servings">Parts</Label>
            <Input
              id="recipe-servings"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              className="tabular"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recipe-prep">Préparation (min)</Label>
            <Input
              id="recipe-prep"
              type="number"
              inputMode="numeric"
              min={0}
              value={prepMinutes}
              onChange={(event) => setPrepMinutes(event.target.value)}
              placeholder="20"
              className="tabular"
            />
          </div>
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-[13px] font-semibold tracking-tight">Ingrédients</h2>

      {ingredients.length === 0 ? (
        <p className="text-muted-foreground">Cherche un aliment ci-dessous pour commencer.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ingredients.map((ingredient, index) => (
            <li key={`${ingredient.refKind}-${ingredient.refValue}-${index}`}>
              <Card className="gap-0 py-3">
                <CardContent className="px-3.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        type="text"
                        aria-label="Nom de l'ingrédient"
                        value={ingredient.label}
                        onChange={(event) => patch(index, { label: event.target.value })}
                        className="h-9 border-transparent px-1.5 font-medium shadow-none dark:bg-transparent"
                      />
                      <p className="tabular mt-0.5 px-1.5 text-[12.5px] text-muted-foreground">
                        {ingredient.per100g === null ? (
                          <span className="text-destructive">Fiche introuvable</span>
                        ) : (
                          <>
                            {formatKcal(scaleMacros(ingredient.per100g, ingredient.quantityG).kcal)}{' '}
                            kcal · {formatIngredientQuantity(ingredient)}
                          </>
                        )}
                      </p>
                    </div>

                    <div className="relative w-[92px] flex-none">
                      <Input
                        type="number"
                        aria-label={`Quantité en grammes de ${ingredient.label}`}
                        inputMode="numeric"
                        min={1}
                        max={MAX_QUANTITY_G - 1}
                        value={ingredient.quantityG}
                        onChange={(event) =>
                          patch(index, { quantityG: Math.round(Number(event.target.value)) })
                        }
                        className="tabular h-9 pr-6 text-right"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
                      >
                        g
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      aria-label={`Retirer ${ingredient.label}`}
                      className="-mr-1 text-muted-foreground"
                    >
                      <XIcon />
                    </Button>
                  </div>

                  {/*
                    L'unité usuelle est repliée : elle ne sert qu'aux ingrédients
                    qui se comptent, et l'imposer à tous ferait six champs vides
                    pour une recette qui n'en demande qu'un.
                  */}
                  <Accordion type="single" collapsible>
                    <AccordionItem value="unit" className="border-b-0">
                      <AccordionTrigger className="px-1.5 py-2 text-[12.5px] font-normal text-muted-foreground">
                        Compter en unités
                      </AccordionTrigger>
                      <AccordionContent className="pb-1">
                        <div className="flex gap-2.5 px-1.5">
                          <Input
                            type="text"
                            aria-label="Nom de l'unité"
                            placeholder="œuf"
                            value={ingredient.unitName ?? ''}
                            onChange={(event) =>
                              patch(index, {
                                unitName:
                                  event.target.value.trim() === '' ? null : event.target.value,
                              })
                            }
                            className="h-9 flex-1"
                          />
                          <Input
                            type="number"
                            aria-label="Poids d'une unité en grammes"
                            placeholder="50"
                            min={1}
                            value={ingredient.unitGrams ?? ''}
                            onChange={(event) =>
                              patch(index, {
                                unitGrams:
                                  event.target.value.trim() === ''
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                            className="tabular h-9 w-[96px] text-right"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-3">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={searchRef}
          type="search"
          autoComplete="off"
          aria-label="Ajouter un ingrédient"
          placeholder="Ajouter un ingrédient"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="pl-9"
        />
      </div>

      {searching ? <Skeleton aria-label="Recherche…" className="mt-3 h-12" /> : null}

      {hits !== null && hits.length === 0 && !searching ? (
        <p className="mt-3 text-muted-foreground">Aucun aliment trouvé.</p>
      ) : null}

      {hits !== null && hits.length > 0 ? (
        <ul className="mt-2">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.ref}`}>
              <button
                type="button"
                onClick={() => void add(hit)}
                className="flex w-full items-center gap-3 border-b py-2.5 text-left transition-colors active:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium tracking-tight">
                    {hit.name}
                  </span>
                  <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                    {formatKcal(hit.per100g.kcal)} kcal / 100 g
                  </span>
                </span>
                <Badge variant={hit.origin === 'ciqual' ? 'outline' : 'secondary'}>
                  {SOURCE_LABEL[hit.origin]}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-2">
        <Label htmlFor="recipe-steps">Étapes, une par ligne</Label>
        <Textarea
          id="recipe-steps"
          rows={6}
          value={steps}
          onChange={(event) => setSteps(event.target.value)}
          placeholder={'Mettre le riz à cuire.\nFaire revenir les légumes 8 minutes.'}
          className="leading-relaxed"
        />
      </div>

      {perServing !== null && ingredients.length > 0 ? (
        <Card className="mt-5 bg-muted">
          <CardContent>
            <CardTitle className="text-[12.5px] font-normal text-muted-foreground">
              Par part
            </CardTitle>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="tabular text-[26px] font-semibold tracking-tight">
                {total.unresolvedCount > 0 ? '≈ ' : ''}
                {formatKcal(perServing.kcal)} kcal
              </p>
              <p className="tabular text-right text-[12.5px] text-muted-foreground">
                {formatGrams(perServing.proteinG)} P · {formatGrams(perServing.carbsG)} G ·{' '}
                {formatGrams(perServing.fatG)} L
              </p>
            </div>
            {total.unresolvedCount > 0 ? (
              <p className="mt-2 text-[12.5px] text-destructive">
                {total.unresolvedCount === 1
                  ? "Un ingrédient n'a pas de fiche : le total est incomplet."
                  : `${total.unresolvedCount} ingrédients n'ont pas de fiche : le total est incomplet.`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <BottomBar>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="w-full"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer la recette'}
        </Button>
      </BottomBar>
    </>
  );
}
