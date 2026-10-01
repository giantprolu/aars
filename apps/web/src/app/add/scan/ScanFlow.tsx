'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ScannerView } from './ScannerView';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QuantityPad } from '@/components/QuantityPad';
import { buildQuantityShortcuts, type QuantityShortcut } from '@/lib/shortcuts';
import { createEntry, fetchRecentQuantities } from '@/lib/client/entries';
import { cacheProduct, resolveBarcode } from '@/lib/client/products';
import { ProductForm, type ProductFormValues } from '@/components/ProductForm';
import type { Meal } from '@/lib/meal';
import type { OffPartialProduct, ReferenceFood } from '@/lib/types';

/**
 * Chemin de scan complet (FR-11 à FR-16).
 *
 * Le parcours vise trois interactions depuis l'ouverture pour un produit en
 * cache : le bouton d'ajout, la ligne « Scanner », puis un raccourci de
 * quantité suivi de la validation (UX-DR-4).
 *
 * Chaque étape porte son propre en-tête : la sortie ferme le parcours tant
 * qu'aucun produit n'est trouvé, et redevient un retour d'un cran dès qu'il y
 * a une étape précédente où revenir.
 */

type Step =
  | { name: 'scanning' }
  | { name: 'resolving'; barcode: string }
  | { name: 'quantity'; product: ReferenceFood; shortcuts: QuantityShortcut[] }
  | { name: 'unresolved'; barcode: string; partial: OffPartialProduct | null; message: string };

export function ScanFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'scanning' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToQuantity = useCallback(async (product: ReferenceFood) => {
    const recent = await fetchRecentQuantities('product', product.ref, product.name);
    setStep({
      name: 'quantity',
      product,
      shortcuts: buildQuantityShortcuts({
        servingSizeG: product.servingSizeG,
        recentQuantities: recent,
      }),
    });
  }, []);

  const handleBarcode = useCallback(
    async (barcode: string) => {
      setStep({ name: 'resolving', barcode });
      const result = await resolveBarcode(barcode);

      if (result.kind === 'cached' || result.kind === 'fetched') {
        await goToQuantity(result.product);
        return;
      }

      // Chaque échec porte son propre message : l'interface aiguille sur la
      // variante plutôt que d'afficher une erreur générique (AD-12, UX-DR-6).
      setStep({
        name: 'unresolved',
        barcode,
        partial: result.kind === 'incomplete' ? result.partial : null,
        message:
          result.kind === 'not_found'
            ? 'Produit introuvable. Saisis ses valeurs.'
            : result.kind === 'incomplete'
              ? 'Fiche incomplète. Complète les valeurs manquantes.'
              : 'Service indisponible. Saisis les valeurs.',
      });
    },
    [goToQuantity],
  );

  /** La fiche saisie rejoint le cache, puis le parcours reprend son cours (FR-15). */
  async function saveProduct(barcode: string, values: ProductFormValues) {
    setSubmitting(true);
    setError(null);

    const stored = await cacheProduct({
      barcode,
      name: values.name,
      per100g: values.per100g,
      servingSizeG: values.servingSizeG,
      source: 'manual',
    });

    setSubmitting(false);
    if (!stored) {
      setError('Enregistrement du produit impossible.');
      return;
    }
    await goToQuantity(stored);
  }

  async function save(quantityG: number, meal: Meal) {
    if (step.name !== 'quantity') {
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await createEntry({
      foodLabel: step.product.name,
      per100g: step.product.per100g,
      quantityG,
      sourceKind: 'product',
      sourceRef: step.product.ref,
      meal,
    });

    if (result.kind === 'created') {
      router.replace('/');
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.kind === 'unauthorized' ? 'Session expirée.' : 'Enregistrement impossible.');
  }

  function restart() {
    setError(null);
    setStep({ name: 'scanning' });
  }

  if (step.name === 'quantity') {
    return (
      <>
        <NavHeader label="Scanner" onDismiss={restart} />
        <QuantityPad
          foodLabel={step.product.name}
          sourceLabel="Produit scanné"
          per100g={step.product.per100g}
          shortcuts={step.shortcuts}
          submitting={submitting}
          onSubmit={save}
        />
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </>
    );
  }

  if (step.name === 'resolving') {
    return (
      <>
        <NavHeader label="Journal" href="/" />
        <Badge variant="outline" className="tabular font-mono">
          {step.barcode}
        </Badge>
        <p className="mt-3 text-[17px] font-semibold tracking-tight">Recherche du produit…</p>
        <Skeleton className="mt-5 h-14" />
        <Skeleton className="mt-2.5 h-14" />
      </>
    );
  }

  if (step.name === 'unresolved') {
    const barcode = step.barcode;
    return (
      <>
        <NavHeader label="Scanner" onDismiss={restart} />

        <div role="alert">
          <Badge variant="outline" className="tabular font-mono">
            {barcode}
          </Badge>
          <PageTitle title={step.message} className="mt-2 mb-5" />
        </div>

        <ProductForm
          initialName={step.partial?.name ?? null}
          initialPer100g={step.partial?.per100g ?? {}}
          initialServingSizeG={step.partial?.servingSizeG ?? null}
          submitting={submitting}
          onSubmit={(values) => saveProduct(barcode, values)}
        />

        {error ? <ErrorAlert>{error}</ErrorAlert> : null}

        <Button type="button" variant="outline" onClick={restart} className="mt-2.5 w-full">
          Scanner un autre code
        </Button>
      </>
    );
  }

  return (
<ScannerView onBarcode={(barcode) => void handleBarcode(barcode)} />
  );
}
