import { EmptyState } from '@/components/EmptyState';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { historyPage } from '@/server/services/entries';
import { requireUserId } from '@/server/guard';
import { formatMonthYear } from '@/lib/date';
import { DayRow } from './DayRow';
import { LoadMore } from './LoadMore';
import { Sparkline } from './Sparkline';

export const dynamic = 'force-dynamic';

/** Première page de l'historique. Les suivantes arrivent progressivement (FR-20). */
const PAGE_SIZE = 30;

/**
 * Liste des journaux passés (FR-20).
 * Seules les dates portant au moins une entrée apparaissent : la requête
 * groupe sur `entries`, une date sans entrée n'a donc aucune ligne.
 */
export default async function HistoryPage() {
  const days = await historyPage(await requireUserId(), PAGE_SIZE, 0);
  const firstDay = days[0];

  return (
    <>
      <NavHeader label="Journal" href="/" />
      <PageTitle
        title="Historique"
        // Le mois du jour le plus récent : c'est là que la liste commence, et
        // non le mois courant, qui peut n'avoir aucune entrée.
        {...(firstDay ? { description: formatMonthYear(firstDay.entryDate) } : {})}
        className="mb-4"
      />

      {days.length === 0 ? (
        <EmptyState>Rien d&apos;enregistré pour l&apos;instant.</EmptyState>
      ) : (
        <>
          <Sparkline days={days} />

          <p className="mt-5 text-[12.5px] text-muted-foreground">Par jour</p>
          <ul>
            {days.map((day) => (
              <DayRow key={day.entryDate} day={day} />
            ))}
          </ul>

          {days.length === PAGE_SIZE ? <LoadMore initialOffset={PAGE_SIZE} /> : null}
        </>
      )}
    </>
  );
}
