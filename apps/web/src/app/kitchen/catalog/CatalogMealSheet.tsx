import { ClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MEAL_LABELS } from '@/lib/meal';
import { formatIngredientQuantity } from '@/lib/recipe';
import type { CatalogCard } from './CatalogPicker';

/**
 * Le détail d'un plat du catalogue, avant de le choisir.
 *
 * La liste ne porte que des noms : c'est sur le nom qu'on parcourt trente
 * plats, et des ingrédients sous chacun rendraient l'écran illisible. Mais un
 * nom ne suffit pas à décider — « Bowl pois chiches et patate douce » ne dit ni
 * ce qu'il faut acheter ni combien de temps il prend. Le détail est donc à un
 * toucher, et non absent.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis
 * `CatalogPicker`, qui la porte déjà.
 */
export function CatalogMealSheet({
  card,
  picked,
  busy,
  onClose,
  onToggle,
}: {
  /** Le plat à détailler, ou `null` quand la feuille est fermée. */
  card: CatalogCard | null;
  /** Vrai si le plat fait partie de la sélection en cours. */
  picked: boolean;
  busy: boolean;
  onClose: () => void;
  onToggle: (slug: string) => void;
}) {
  return (
    <Sheet open={card !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />
        {card === null ? (
          <SheetTitle className="sr-only">Détail du plat</SheetTitle>
        ) : (
          <>
            <SheetHeader className="p-0 pr-10">
              <SheetTitle className="text-[17px]">{card.name}</SheetTitle>
              <SheetDescription>{MEAL_LABELS[card.slot]}</SheetDescription>
            </SheetHeader>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <Badge variant="outline" className="tabular">
                <ClockIcon />
                {card.prepMinutes} min
              </Badge>
              <Badge variant="outline" className="tabular">
                {card.servings === 1 ? '1 part' : `${card.servings} parts`}
              </Badge>
              <Badge variant="secondary" className="tabular">
                ≈ {card.kcal} kcal · {card.proteinG} g P par part
              </Badge>
            </div>
            {/*
              L'estimation est dite estimation. Les valeurs justes arrivent avec
              la recette installée, calculées depuis Ciqual comme partout : un
              chiffre de catalogue sert à départager deux plats, pas à compter
              une journée.
            */}
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Ordre de grandeur, pour départager deux plats.
            </p>

            <Separator className="mt-4" />
            <h3 className="mt-4 mb-1 text-[13px] font-semibold tracking-tight">Ingrédients</h3>
            <ul>
              {card.ingredients.map((ingredient) => (
                <li
                  key={ingredient.label}
                  className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate">{ingredient.label}</span>
                  <span className="tabular flex-none text-muted-foreground">
                    {formatIngredientQuantity(ingredient)}
                  </span>
                </li>
              ))}
            </ul>

            {card.steps.length > 0 ? (
              <>
                <h3 className="mt-5 mb-2 text-[13px] font-semibold tracking-tight">Préparation</h3>
                <ol className="flex flex-col gap-3">
                  {card.steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span
                        aria-hidden
                        className="tabular flex size-6 flex-none items-center justify-center rounded-full bg-muted text-[12px] font-semibold"
                      >
                        {index + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}

            {card.inBasket ? (
              <p className="mt-6 text-center text-muted-foreground">
                Ce plat est déjà au panier de la semaine.
              </p>
            ) : (
              <Button
                type="button"
                variant={picked ? 'outline' : 'default'}
                onClick={() => onToggle(card.slug)}
                disabled={busy}
                className="mt-6 w-full"
              >
                {picked ? 'Retirer de ma sélection' : 'Choisir ce plat'}
              </Button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
