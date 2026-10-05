import { Badge } from '@/components/ui/badge';
import { CATEGORY_LABELS, FLAG_LABELS, STATUS_LABELS } from '@/lib/types';

/** P0 et P1 en rouge : ce qui ne peut pas attendre. */
export function PriorityBadge({ priority }: { priority: number }) {
  return (
    <Badge variant={priority <= 1 ? 'destructive' : priority === 2 ? 'default' : 'secondary'} className="tabular-nums">
      P{priority}
    </Badge>
  );
}

export function CaseBadges({
  status,
  category,
  flags,
}: {
  status: string;
  category: string | null;
  flags: string[];
}) {
  return (
    <>
      <Badge variant="outline">{STATUS_LABELS[status] ?? status}</Badge>
      {category ? <Badge variant="secondary">{CATEGORY_LABELS[category] ?? category}</Badge> : null}
      {flags.map((flag) => (
        <Badge key={flag} variant={flag === 'CRITICAL_SAFETY' ? 'destructive' : 'outline'}>
          {FLAG_LABELS[flag] ?? flag}
        </Badge>
      ))}
    </>
  );
}

const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** « il y a 3 heures », « il y a 2 jours ». */
export function since(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return hours < 48 ? relative.format(-Math.round(hours), 'hour') : relative.format(-Math.round(hours / 24), 'day');
}
