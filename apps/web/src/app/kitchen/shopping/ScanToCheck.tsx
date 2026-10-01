import { useCallback, useEffect, useState } from 'react';
import { ScannerView } from '@/app/add/scan/ScannerView';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveBarcode } from '@/lib/client/products';
import { bestMatch, type MatchableItem } from '@/lib/shopping';
import type { ShoppingItem } from '@/server/db/queries/shopping';

/**
 * Scan d'un produit en rayon pour cocher un article.
 *
 * Le viseur est celui du parcours d'ajout au journal, monté ici tel quel : il
 * porte déjà le zoom, la torche, la mise au point continue et la saisie
 * manuelle en repli, qui font la différence entre un décodage en une seconde
 * et un échec attribué à l'application. Il occupe tout l'écran ; le choix de
 * l'article, lui, s'ouvre en feuille une fois le code lu.
 *
 * Le rapprochement est proposé, jamais appliqué d'office. Le score de
 * similarité suffit à écarter le bruit mais pas à trancher : « Riz » couvre
 * aussi bien « Riz basmati » que « Galette de riz soufflé », et c'est
 * l'utilisateur qui tient le paquet.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis
 * ShoppingList, qui la porte déjà.
 */

type Step =
  | { name: 'scanning' }
  | { name: 'resolving' }
  /** Produit reconnu, article proposé — ou aucun, à choisir dans la liste. */
  | { name: 'matched'; barcode: string; productName: string; suggested: ShoppingItem | null }
  | { name: 'unknown'; barcode: string };

export function ScanToCheck({
  open,
  items,
  onClose,
  onCheck,
}: {
  open: boolean;
  items: readonly ShoppingItem[];
  onClose: () => void;
  onCheck: (item: ShoppingItem, barcode: string) => void;
}) {
  const [step, setStep] = useState<Step>({ name: 'scanning' });

  /*
    Chaque ouverture repart du viseur, quel que soit l'état où l'on a quitté.

    Le retour de l'état précédent quand il convient déjà n'est pas une
    précaution de style : React s'arrête là, et aucun rendu ne suit. Écrire un
    objet neuf en rendait un, ce qui renouvelait la lambda passée au viseur et
    lui faisait rouvrir la caméra alors qu'elle s'ouvrait déjà.
  */
  useEffect(() => {
    if (open) {
      setStep((previous) => (previous.name === 'scanning' ? previous : { name: 'scanning' }));
    }
  }, [open]);

  const resolveAndMatch = useCallback(
    async (barcode: string) => {
      setStep({ name: 'resolving' });
      const resolved = await resolveBarcode(barcode);

      if (resolved.kind !== 'cached' && resolved.kind !== 'fetched') {
        // Produit inconnu d'Open Food Facts : l'article se coche quand même, et
        // c'est le bon comportement. On l'a bel et bien mis dans le chariot ;
        // seule la fiche manque, et elle ne sert qu'aux macros.
        setStep({ name: 'unknown', barcode });
        return;
      }

      const match = bestMatch(resolved.product.name, items as readonly MatchableItem[]);
      setStep({
        name: 'matched',
        barcode,
        productName: resolved.product.name,
        suggested: match === null ? null : (match.item as ShoppingItem),
      });
    },
    [items],
  );

  /* Stable tant que la liste ne bouge pas : le viseur n'a pas à rouvrir. */
  const onScannerBarcode = useCallback(
    (barcode: string) => void resolveAndMatch(barcode),
    [resolveAndMatch],
  );

  if (!open) {
    return null;
  }

  if (step.name === 'scanning') {
    return (
      <ScannerView title="En rayon" onClose={onClose} onBarcode={onScannerBarcode} />
    );
  }

  const pending = items.filter((item) => item.checkedAt === null);

  return (
    <Sheet open onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />

        {step.name === 'resolving' ? (
          <>
            <SheetHeader className="p-0 pr-10">
              <SheetTitle className="text-[17px]">Lecture de la fiche…</SheetTitle>
              <SheetDescription>Le produit est recherché par son code-barres.</SheetDescription>
            </SheetHeader>
            <Skeleton className="mt-4 h-12" />
            <Skeleton className="mt-2.5 h-12" />
          </>
        ) : (
          <>
            <SheetHeader className="p-0 pr-10">
              <SheetTitle className="text-[17px]">
                {step.name === 'matched' ? step.productName : 'Produit inconnu'}
              </SheetTitle>
              <SheetDescription>
                {step.name === 'matched'
                  ? step.suggested === null
                    ? 'Aucun article ne lui ressemble. Choisis celui qu’il coche.'
                    : 'Article proposé, à confirmer.'
                  : 'Aucune fiche pour ce code-barres. Coche quand même l’article qu’il concerne.'}
              </SheetDescription>
            </SheetHeader>

            {step.name === 'matched' && step.suggested !== null ? (
              <Button
                type="button"
                onClick={() => onCheck(step.suggested as ShoppingItem, step.barcode)}
                className="mt-4 w-full"
              >
                Cocher « {step.suggested.label} »
              </Button>
            ) : null}

            <h3 className="mt-5 mb-1 text-[12.5px] text-muted-foreground">
              {step.name === 'matched' && step.suggested !== null
                ? 'Ou un autre article'
                : 'Articles à prendre'}
            </h3>
            <Separator />

            {pending.length === 0 ? (
              <p className="py-4 text-muted-foreground">Tout est déjà coché.</p>
            ) : (
              <ul>
                {pending
                  .filter((item) => !(step.name === 'matched' && item.id === step.suggested?.id))
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onCheck(item, step.barcode)}
                        className="flex min-h-11 w-full items-center border-b py-2.5 text-left text-[14.5px] font-medium tracking-tight transition-colors active:bg-accent"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => setStep({ name: 'scanning' })}
              className="mt-4 w-full"
            >
              Scanner un autre produit
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
