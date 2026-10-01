'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { deleteRecipe } from '@/lib/client/recipes';

/**
 * Suppression d'une recette, confirmée dans l'AlertDialog de shadcn/ui.
 *
 * Pas de fenêtre de confirmation du navigateur : sur une application installée
 * sur l'écran d'accueil, elle apparaît comme un avertissement de page web et
 * rompt l'illusion — sans compter qu'elle bloque tout le reste tant qu'on ne
 * l'a pas fermée.
 *
 * Supprimer une recette ne touche à aucune entrée déjà journalisée : celles-ci
 * portent leurs propres macros (AD-1) et ne référencent pas la recette.
 */
export function DeleteRecipe({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    const outcome = await deleteRecipe(id);

    if (outcome.kind === 'deleted') {
      router.replace('/kitchen');
      router.refresh();
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className="mt-6 w-full text-destructive hover:text-destructive"
          >
            <Trash2Icon />
            {busy ? 'Suppression…' : 'Supprimer la recette'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La fiche disparaît du carnet. Les repas déjà inscrits au journal ne changent pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirm()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {failed ? <ErrorAlert>Suppression impossible.</ErrorAlert> : null}
    </>
  );
}
