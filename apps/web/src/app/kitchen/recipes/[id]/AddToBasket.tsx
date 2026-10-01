'use client';

import { CheckIcon, ShoppingCartIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { addRecipeToBasket } from '@/lib/client/basket';

/**
 * Mettre cette recette au panier de la semaine en cours.
 *
 * Le geste existe pour les recettes écrites à la main. Celles du catalogue y
 * entrent au moment du choix ; sans ce bouton, une recette personnelle ne
 * pourrait jamais rejoindre la liste de courses, qui se déduit du panier.
 *
 * Les parts proposées sont celles de la recette : on cuisine ce qu'elle
 * produit, et c'est au panier qu'on ajuste ensuite si la semaine en demande
 * le double.
 *
 * Il vit dans la barre basse : l'échec se dit donc dans le bouton lui-même,
 * qui reste le seul endroit que le regard vient de quitter.
 */
export function AddToBasket({
  recipeId,
  servings,
  weekStart,
  alreadyChosen,
}: {
  recipeId: number;
  servings: number;
  weekStart: string;
  alreadyChosen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const outcome = await addRecipeToBasket({ weekStart, recipeId, servings });
    setBusy(false);

    if (outcome.kind === 'added') {
      router.refresh();
      return;
    }
    setError(outcome.kind === 'unauthorized' ? 'Session expirée' : 'Échec, réessayer');
  }

  if (alreadyChosen) {
    return (
      <Button type="button" variant="outline" disabled className="flex-1">
        <CheckIcon />
        Au panier
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void add()}
      disabled={busy}
      aria-describedby={error ? `basket-error-${recipeId}` : undefined}
      className={error ? 'flex-1 text-destructive' : 'flex-1'}
    >
      <ShoppingCartIcon />
      {busy ? 'Ajout…' : (error ?? 'Au panier')}
      {error ? (
        <span id={`basket-error-${recipeId}`} role="alert" className="sr-only">
          Ce plat n’a pas pu être mis au panier.
        </span>
      ) : null}
    </Button>
  );
}
