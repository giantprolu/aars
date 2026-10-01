import {
  BlockSkeleton,
  RowsSkeleton,
  ScreenHeaderSkeleton,
  SectionLabelSkeleton,
} from '@/components/Skeletons';

/**
 * Silhouette du journal, et repli de toute route qui n'a pas la sienne.
 *
 * Le journal est l'écran d'accueil : sa forme est celle de la cible du jour,
 * puis des repas.
 */
export default function JournalLoading() {
  return (
    <div className="pb-16">
      <ScreenHeaderSkeleton />
      <BlockSkeleton className="h-[188px]" />
      <SectionLabelSkeleton className="mt-5" />
      <RowsSkeleton rows={3} />
    </div>
  );
}
