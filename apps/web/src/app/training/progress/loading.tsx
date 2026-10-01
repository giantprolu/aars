import { BlockSkeleton, NavHeaderSkeleton, PageTitleSkeleton } from '@/components/Skeletons';

/**
 * Silhouette de la progression.
 *
 * Deux blocs hauts et non des lignes : ce sont des graphiques, et une
 * silhouette en liste ferait sauter la mise en page à leur arrivée.
 */
export default function ProgressLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <BlockSkeleton className="mt-4 h-[232px]" />
      <BlockSkeleton className="mt-3.5 h-[232px]" />
    </>
  );
}
