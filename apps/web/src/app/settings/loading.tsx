import { BlockSkeleton, RowsSkeleton, ScreenHeaderSkeleton } from '@/components/Skeletons';

/** Silhouette des Réglages : la carte d'objectif, puis les entrées. */
export default function SettingsLoading() {
  return (
    <>
      <ScreenHeaderSkeleton action={false} />
      <BlockSkeleton className="h-[76px]" />
      <RowsSkeleton rows={4} className="mt-3.5" />
      <RowsSkeleton rows={3} className="mt-3.5" />
    </>
  );
}
