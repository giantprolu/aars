'use client';

import { CheckIcon, Share2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatServings } from '@/lib/recipe';
import {
  formatShareableRecipes,
  shareableRecipesTitle,
  type ShareableRecipe,
} from '@/lib/share-recipes';

/**
 * Partage des recettes de la semaine, depuis la liste de courses.
 *
 * L'endroit n'est pas un hasard. On partage ses recettes au moment où les
 * courses sont faites : le sac est posé, on sait ce qu'on va cuisiner, et
 * c'est là qu'on envoie les plats à qui cuisinera avec soi. Sur la fiche d'une
 * recette, le même bouton aurait demandé d'en ouvrir cinq pour en envoyer
 * cinq.
 *
 * Tout est coché d'avance parce que c'est le cas courant — la semaine entière
 * part d'un geste — et la sélection reste possible pour le cas où l'on ne
 * partage qu'un plat. L'inverse, une feuille qui s'ouvre vide, faisait cocher
 * cinq cases pour faire la chose la plus fréquente.
 *
 * Deux chemins de sortie, et le second n'est pas un repli poli. La feuille de
 * partage du système n'existe pas partout : sur un navigateur de bureau, sur
 * un navigateur qui la refuse, `navigator.share` est absent ou lève. Le
 * presse-papiers prend alors le relais, et le texte est le même — il a été
 * composé avant, hors de toute promesse.
 */

/** Ce que la feuille dit d'un plat, sous son nom. */
function summary(recipe: ShareableRecipe): string {
  const count =
    recipe.ingredients.length === 1
      ? '1 ingrédient'
      : `${recipe.ingredients.length} ingrédients`;
  return `${formatServings(recipe.servings)} · ${count}`;
}

export function ShareRecipes({
  recipes,
  weekLabel,
  complete,
}: {
  recipes: readonly ShareableRecipe[];
  /** La semaine, écrite : « du 15 au 21 septembre ». */
  weekLabel: string;
  /** Vrai quand tous les articles sont pris : le partage passe alors devant. */
  complete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Tout est coché à chaque ouverture, y compris la deuxième : une sélection
  // gardée d'un envoi précédent enverrait un plat de moins sans le dire.
  useEffect(() => {
    if (open) {
      setSelected(new Set(recipes.map((recipe) => recipe.id)));
      setState('idle');
    }
  }, [open, recipes]);

  // La confirmation s'efface d'elle-même : laissée en place, elle décrirait au
  // bout d'une minute une copie qu'on ne se rappelle plus avoir faite.
  useEffect(() => {
    if (state === 'idle') {
      return;
    }
    const timer = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  if (recipes.length === 0) {
    return null;
  }

  const chosen = recipes.filter((recipe) => selected.has(recipe.id));

  function toggle(id: number): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  /**
   * Compose puis envoie.
   *
   * Le texte est composé sur-le-champ, sans rien attendre : la feuille de
   * partage du système exige d'être ouverte par un geste, et un aller-retour
   * réseau avant l'appel aurait fait perdre ce droit — le partage échouait
   * alors sur iOS sans qu'on sache pourquoi.
   */
  function share(): void {
    const text = formatShareableRecipes(chosen, weekLabel);
    if (text === '') {
      return;
    }

    if (typeof navigator.share !== 'function') {
      void copy(text);
      return;
    }

    navigator
      .share({ title: shareableRecipesTitle(chosen, weekLabel), text })
      .then(() => setOpen(false))
      .catch((error: unknown) => {
        // Renoncer n'est pas échouer : refermer la feuille du système sans
        // choisir de destination ne doit rien copier ni rien dire.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        void copy(text);
      });
  }

  const trigger = (
    <Button
      type="button"
      variant={complete ? 'default' : 'outline'}
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      className="w-full"
    >
      <Share2Icon />
      Partager les recettes
    </Button>
  );

  return (
    <>
      {complete ? (
        <Card className="mt-5">
          <CardContent>
            <p className="text-[14.5px] font-semibold tracking-tight">Les courses sont faites.</p>
            <p className="mt-1 mb-3.5 text-muted-foreground">
              Envoie les plats de la semaine, quantités comprises, à qui cuisinera avec toi.
            </p>
            {trigger}
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5">
          {trigger}
          <p className="mt-1 text-center text-[12.5px] text-muted-foreground">
            Les plats de la semaine, avec les quantités de ton panier.
          </p>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
        >
          <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />
          <SheetHeader className="p-0 pr-10">
            <SheetTitle className="text-[17px]">Partager mes recettes</SheetTitle>
            <SheetDescription>
              Semaine {weekLabel}. Les quantités partagées sont celles de ton panier.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between">
            <span className="tabular text-[13px] font-semibold tracking-tight">
              {chosen.length} sur {recipes.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelected(
                  chosen.length === recipes.length
                    ? new Set()
                    : new Set(recipes.map((recipe) => recipe.id)),
                )
              }
            >
              {chosen.length === recipes.length ? 'Tout décocher' : 'Tout cocher'}
            </Button>
          </div>

          <Separator className="mt-1" />

          <ul className="pt-1">
            {recipes.map((recipe) => {
              const id = `share-recipe-${recipe.id}`;
              return (
                <li key={recipe.id} className="flex items-center gap-3 border-b py-2.5">
                  <Checkbox
                    id={id}
                    checked={selected.has(recipe.id)}
                    onCheckedChange={() => toggle(recipe.id)}
                    className="size-[18px]"
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-[14.5px] font-medium tracking-tight">
                      {recipe.name}
                    </span>
                    <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
                      {summary(recipe)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            onClick={share}
            disabled={chosen.length === 0}
            className="mt-5 w-full"
          >
            {state === 'copied' ? <CheckIcon /> : <Share2Icon />}
            {state === 'copied'
              ? 'Recettes copiées'
              : chosen.length === recipes.length
                ? 'Partager toutes les recettes'
                : `Partager ${chosen.length === 1 ? 'la recette' : `les ${chosen.length} recettes`}`}
          </Button>

          {state === 'copied' ? (
            <p role="status" className="mt-2 text-center text-[12.5px] text-muted-foreground">
              Le texte est dans le presse-papiers : colle-le où tu veux.
            </p>
          ) : null}
          {state === 'failed' ? (
            <p role="alert" className="mt-2 text-center text-[12.5px] text-destructive">
              Le partage a été refusé par le navigateur, et la copie aussi.
            </p>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
