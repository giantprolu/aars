import {
  BottomBarSkeleton,
  NavHeaderSkeleton,
  PageTitleSkeleton,
  RowsSkeleton,
  SectionLabelSkeleton,
} from '@/components/Skeletons';

/** Silhouette du catalogue : des plats à cocher, et la barre qui les retient. */
export default function CatalogLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <SectionLabelSkeleton className="mt-4" />
      <RowsSkeleton rows={5} />
      <SectionLabelSkeleton className="mt-3.5" />
      <RowsSkeleton rows={4} />
      <BottomBarSkeleton />
    </>
  );
}
