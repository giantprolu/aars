import { AddModes } from './AddModes';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * Feuille de choix du mode d'ajout.
 *
 * Elle remplace l'écran /add : le choix du chemin ne coûte plus une navigation,
 * il s'ouvre par-dessus le journal, qui reste visible derrière. Le Sheet de
 * shadcn/ui fournit le piège à focus, la fermeture à la touche d'échappement
 * et le retour du focus au bouton d'origine.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis AddFab,
 * qui la porte déjà. La poser en ferait une frontière serveur/client où le
 * rappel `onOpenChange` devrait être une Server Action.
 */
export function AddSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="text-[17px]">Ajouter un aliment</SheetTitle>
          <SheetDescription>Cinq façons, au choix.</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <AddModes onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
