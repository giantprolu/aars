import Image from 'next/image';
import Link from 'next/link';
import { ImageOffIcon } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { PhotoUploader } from '@/components/PhotoUploader';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GOAL_LABELS, MEAL_LABELS, type CatalogMeal } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'missing', label: 'Sans photo' },
  { key: 'lose', label: GOAL_LABELS.lose },
  { key: 'maintain', label: GOAL_LABELS.maintain },
  { key: 'gain', label: GOAL_LABELS.gain },
] as const;

type Filter = (typeof FILTERS)[number]['key'];

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const asked = (await searchParams).filter;
  const filter: Filter = FILTERS.some((entry) => entry.key === asked) ? (asked as Filter) : 'missing';
  const { meals } = await apiGet<{ meals: CatalogMeal[] }>('/catalog');
  const shown = filter === 'missing' ? meals.filter((meal) => meal.imageUrl === null) : meals.filter((meal) => meal.goal === filter);
  const missing = meals.filter((meal) => meal.imageUrl === null).length;

  return (
    <>
      <PageTitle title="Catalogue" description={`${meals.length} plats, ${missing} sans photo. Une photo posée ici sert à tous les comptes.`}>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {FILTERS.map((entry) => (
            <Link
              key={entry.key}
              href={`/catalogue?filter=${entry.key}`}
              className={cn('rounded-md px-3 py-1', entry.key === filter ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
            >
              {entry.label}
            </Link>
          ))}
        </div>
      </PageTitle>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{filter === 'missing' ? 'Tous les plats ont leur photo.' : 'Aucun plat.'}</p>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Photo</TableHead>
                <TableHead>Plat</TableHead>
                <TableHead className="hidden sm:table-cell">Repas</TableHead>
                <TableHead className="hidden md:table-cell">Objectif</TableHead>
                <TableHead className="hidden text-right md:table-cell">kcal / part</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((meal) => (
                <TableRow key={meal.slug}>
                  <TableCell>
                    <div className="relative size-12 overflow-hidden rounded-md bg-muted">
                      {meal.imageUrl ? (
                        <Image src={meal.imageUrl} alt="" fill unoptimized className="object-cover" sizes="48px" />
                      ) : (
                        <ImageOffIcon className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal font-medium">
                    {meal.name}
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                      {MEAL_LABELS[meal.slot]} · {GOAL_LABELS[meal.goal]}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">{MEAL_LABELS[meal.slot]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{GOAL_LABELS[meal.goal]}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{meal.estimateKcal}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <PhotoUploader kind="catalog" id={meal.slug} hasPhoto={meal.imageUrl !== null} size="sm" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
