import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { DayTotals } from '@/lib/types';
import { formatRelativeJournalDate, todayInParis } from '@/lib/date';
import { formatGrams, formatKcal } from '@/lib/nutrition';

/**
 * Une ligne de l'historique (FR-20).
 * Partagée entre le rendu serveur de la première page et le chargement
 * progressif des suivantes, pour que les deux soient identiques.
 */
export function DayRow({ day }: { day: DayTotals }) {
  const ongoing = day.entryDate === todayInParis();

  return (
    <li>
      <Link
        href={`/history/${day.entryDate}`}
        className="flex items-center gap-3 border-b py-2.5 transition-colors active:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-medium tracking-tight first-letter:uppercase">
              {formatRelativeJournalDate(day.entryDate)}
            </span>
            {ongoing ? <Badge variant="outline">en cours</Badge> : null}
          </span>
          <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
            {formatGrams(day.macros.proteinG)} P · {formatGrams(day.macros.carbsG)} G ·{' '}
            {formatGrams(day.macros.fatG)} L
          </span>
        </span>
        <span className="tabular flex-none font-medium">{formatKcal(day.macros.kcal)}</span>
        <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
      </Link>
    </li>
  );
}
