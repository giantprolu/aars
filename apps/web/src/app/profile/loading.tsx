import {
  BottomBarSkeleton,
  NavHeaderSkeleton,
  PageTitleSkeleton,
  RowsSkeleton,
} from '@/components/Skeletons';

/** Silhouette de l'objectif : les mesures, puis la cible. */
export default function ProfileLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <RowsSkeleton rows={4} className="mt-4" />
      <RowsSkeleton rows={3} className="mt-3.5" />
      <BottomBarSkeleton />
    </>
  );
}
