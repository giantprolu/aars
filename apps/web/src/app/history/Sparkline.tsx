import { Card, CardContent } from '@/components/ui/card';
import type { DayTotals } from '@/lib/types';
import { formatDayMonth } from '@/lib/date';
import { formatKcal } from '@/lib/nutrition';
import { cn } from '@/lib/utils';

/**
 * Moyenne récente et son graphique en colonnes (écran Historique).
 *
 * Quatorze colonnes au plus, du plus ancien au plus récent, la dernière en
 * couleur pleine.
 *
 * Les hauteurs sont rapportées au plus fort des jours montrés et non à la
 * cible : la cible d'aujourd'hui ne dit rien de celle d'il y a deux semaines,
 * et le graphique ne prétend donc rien mesurer d'autre que ses propres jours.
 */

/** Nombre de jours tracés. */
const SPAN = 14;

/** Hauteur minimale d'une colonne, en part de la boîte : un jour maigre reste visible. */
const MIN_RATIO = 0.08;

export function Sparkline({ days }: { days: readonly DayTotals[] }) {
  // `days` arrive du plus récent au plus ancien : le tracé se lit à l'endroit.
  const recent = [...days].slice(0, SPAN).reverse();
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }

  const average = recent.reduce((total, day) => total + day.macros.kcal, 0) / recent.length;
  const peak = Math.max(...recent.map((day) => day.macros.kcal));

  return (
    <Card role="region" aria-label="Moyenne récente">
      <CardContent>
        <p className="text-[12.5px] text-muted-foreground">
          Moyenne sur {recent.length === 1 ? '1 jour' : `${recent.length} jours`}
        </p>
        <p className="tabular mt-px text-[26px] font-semibold tracking-tight">
          {formatKcal(average)} kcal
        </p>

        <div aria-hidden className="mt-4 flex h-[76px] items-end gap-1">
          {recent.map((day, index) => (
            <div
              key={day.entryDate}
              className={cn(
                'flex-1 rounded-[3px]',
                index === recent.length - 1 ? 'bg-primary' : 'bg-muted',
              )}
              style={{
                height: `${Math.max(MIN_RATIO, peak > 0 ? day.macros.kcal / peak : 0) * 100}%`,
              }}
            />
          ))}
        </div>
        <div
          aria-hidden
          className="tabular mt-2 flex justify-between text-[12.5px] text-muted-foreground"
        >
          <span>{formatDayMonth(first.entryDate)}</span>
          <span>{formatDayMonth(last.entryDate)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
