import {
  BottomBarSkeleton,
  NavHeaderSkeleton,
  PageTitleSkeleton,
  RowsSkeleton,
  SectionLabelSkeleton,
} from '@/components/Skeletons';

/** Silhouette d'une recette : ses ingrédients, puis ses étapes. */
export default function RecipeLoading() {
  return (
    <>
      <NavHeaderSkeleton />
      <PageTitleSkeleton />
      <SectionLabelSkeleton className="mt-4" />
      <RowsSkeleton rows={5} />
      <SectionLabelSkeleton className="mt-3.5" />
      <RowsSkeleton rows={3} />
      <BottomBarSkeleton />
    </>
  );
}
