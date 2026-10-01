import { notFound } from 'next/navigation';
import { DayBreakdown } from '@/components/DayBreakdown';
import { EmptyState } from '@/components/EmptyState';
import { MealJournal } from '@/components/MealJournal';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { journalForDate } from '@/server/services/entries';
import { requireUserId } from '@/server/guard';
import { formatJournalDate, formatRelativeJournalDate, isJournalDate } from '@/lib/date';

export const dynamic = 'force-dynamic';

/**
 * Détail d'un journal passé (FR-21).
 *
 * En lecture seule : aucune suppression ni modification n'est possible ici.
 * C'est la garantie des macros figées rendue visible dans l'interface, et non
 * une simple omission de fonctionnalité.
 *
 * Les valeurs viennent de `entries` seule, sans jointure vers une table de
 * référence (AD-1) : corriger une fiche produit ne change rien ici.
 */
export default async function HistoryDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isJournalDate(date)) {
    notFound();
  }

  const { totals, entries } = await journalForDate(await requireUserId(), date);

  // Le titre dit la date, la ligne dessous dit la distance. « Hier » situe
  // dans la mémoire, « mardi 16 septembre » dans le calendrier ; pour une date
  // ancienne les deux se confondent, et la seconde ligne se tait.
  const relative = formatRelativeJournalDate(date);
  const absolute = formatJournalDate(date);

  return (
    <>
      <NavHeader label="Historique" href="/history" />
      <PageTitle
        title={absolute}
        {...(relative === absolute ? {} : { description: relative })}
        className="mb-4"
      />

      {entries.length === 0 ? (
        <EmptyState>Aucune entrée ce jour-là.</EmptyState>
      ) : (
        <>
          <DayBreakdown macros={totals.macros} />
          <MealJournal entries={entries} initiallyOpen />
          <p className="mt-5 text-center text-[12.5px] text-muted-foreground">
            Journée clôturée. Les valeurs sont figées à l&apos;écriture.
          </p>
        </>
      )}
    </>
  );
}
