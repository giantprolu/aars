import { RowsSkeleton, ScreenHeaderSkeleton, SectionLabelSkeleton } from '@/components/Skeletons';

/** Silhouette du Sport : le programme de la semaine, puis les séances passées. */
export default function TrainingLoading() {
  return (
    <>
      <ScreenHeaderSkeleton action={false} />
      <SectionLabelSkeleton />
      <RowsSkeleton rows={3} />
      <SectionLabelSkeleton className="mt-5" />
      <RowsSkeleton rows={2} />
    </>
  );
}
