import { NavHeaderSkeleton, PageTitleSkeleton } from '@/components/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Silhouette du carnet : une grille de vignettes. */
export default function RecipesLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[132px] rounded-xl" />
        ))}
      </div>
    </>
  );
}
