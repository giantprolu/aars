import {
  BlockSkeleton,
  NavHeaderSkeleton,
  PageTitleSkeleton,
  RowsSkeleton,
} from '@/components/Skeletons';

/** Silhouette de l'historique : la courbe, puis les journées. */
export default function HistoryLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <BlockSkeleton className="mt-4 h-[92px]" />
      <RowsSkeleton rows={6} className="mt-3.5" />
    </>
  );
}
