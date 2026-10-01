import { RowsSkeleton, ScreenHeaderSkeleton, SectionLabelSkeleton } from '@/components/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Silhouette de la Cuisine : les onglets, le panier, puis la semaine. */
export default function KitchenLoading() {
  return (
    <>
      <ScreenHeaderSkeleton />
      <Skeleton className="h-9 w-full rounded-lg" />
      <SectionLabelSkeleton className="mt-[18px]" />
      <RowsSkeleton rows={3} />
      <div className="mt-2.5 flex gap-2">
        <Skeleton className="h-9 flex-[1.4] rounded-md" />
        <Skeleton className="h-9 flex-1 rounded-md" />
      </div>
      <SectionLabelSkeleton className="mt-5" />
      <RowsSkeleton rows={2} />
    </>
  );
}
