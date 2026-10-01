import {
  BlockSkeleton,
  BottomBarSkeleton,
  NavHeaderSkeleton,
  PageTitleSkeleton,
  RowsSkeleton,
  SectionLabelSkeleton,
} from '@/components/Skeletons';

/** Silhouette des courses : l'avancement, puis les rayons. */
export default function ShoppingLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <BlockSkeleton className="mt-4 h-[84px]" />
      <SectionLabelSkeleton className="mt-3.5" />
      <RowsSkeleton rows={4} />
      <SectionLabelSkeleton className="mt-3.5" />
      <RowsSkeleton rows={3} />
      <BottomBarSkeleton />
    </>
  );
}
