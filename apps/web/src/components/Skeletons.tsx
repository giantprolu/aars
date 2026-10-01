import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Les silhouettes des écrans, montrées le temps que le serveur réponde.
 *
 * Elles existent pour une raison mesurable et non pour l'ornement : sans
 * `loading.tsx`, une navigation vers une page rendue à la demande laisse le
 * téléphone sur l'écran précédent, figé, jusqu'à ce que tout soit prêt. Rien
 * ne bouge, et l'application paraît en panne alors qu'elle travaille. Avec une
 * silhouette, la bascule est immédiate et l'attente devient lisible.
 *
 * Elles servent aussi le préchargement : Next ne précharge d'une page
 * dynamique que son `loading`, et seulement s'il existe. Les quatre
 * destinations de la barre d'onglets sont visibles en permanence, donc
 * préchargées — leur silhouette est déjà là quand le pouce arrive.
 *
 * Chaque silhouette reprend la forme de son écran, hauteurs comprises. Une
 * silhouette qui ne ressemble pas à ce qui la remplace produit un saut de mise
 * en page, c'est-à-dire exactement ce qu'elle devait éviter.
 */

/** En-tête d'une destination : titre, ligne de contexte, action à droite. */
export function ScreenHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 pt-3 pb-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1.5 h-4 w-28" />
      </div>
      {action ? <Skeleton className="size-9 shrink-0 rounded-md" /> : null}
    </div>
  );
}

/** En-tête d'un écran ouvert depuis un autre : la sortie et le nom d'où l'on vient. */
export function NavHeaderSkeleton() {
  return (
    <div className="flex h-14 items-center gap-2">
      <Skeleton className="size-9 rounded-md" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

/** Titre d'écran et sa ligne de contexte, rendus par le contenu. */
export function PageTitleSkeleton({ description = true }: { description?: boolean }) {
  return (
    <div>
      <Skeleton className="h-7 w-44" />
      {description ? <Skeleton className="mt-2 h-4 w-56" /> : null}
    </div>
  );
}

/**
 * Une carte de lignes, la forme la plus répandue de l'application : panier,
 * journal, liste de courses, réglages.
 */
export function RowsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-[55%]" />
            <Skeleton className="mt-1.5 h-3 w-[35%]" />
          </div>
          <Skeleton className="size-8 shrink-0 rounded-md" />
        </div>
      ))}
    </Card>
  );
}

/** Le titre d'une section, au-dessus de sa carte. */
export function SectionLabelSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('mb-2 h-3.5 w-28', className)} />;
}

/** Une carte pleine, pour un bloc qui n'est pas une liste. */
export function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('w-full rounded-xl', className)} />;
}

/**
 * La barre d'actions basse d'un écran qui en porte une.
 *
 * L'attribut `data-bottom-bar` est reproduit tel quel : c'est lui qui efface
 * la barre d'onglets. Sans lui, celle-ci reparaîtrait pendant le chargement
 * pour disparaître aussitôt après, et l'écran clignoterait à chaque ouverture.
 */
export function BottomBarSkeleton() {
  return (
    <>
      <div aria-hidden className="h-[calc(5.5rem+var(--safe-bottom))]" />
      <div
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background"
      >
        <div className="mx-auto max-w-lg px-5 pt-3 pb-[calc(1.25rem+var(--safe-bottom))]">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </>
  );
}
