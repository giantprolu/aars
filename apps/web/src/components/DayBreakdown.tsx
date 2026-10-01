import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Macros } from '@/lib/types';
import { formatKcal } from '@/lib/nutrition';
import { progressRatio } from '@/lib/journal';
import { MacroBars } from './MacroBars';

/**
 * Totaux d'une journée close (écran Détail d'un jour).
 *
 * Distinct de la carte du journal, et pas seulement de mise en page : une
 * journée passée n'a pas de reste à consommer. La cible d'aujourd'hui ne dit
 * rien de celle d'il y a trois semaines, et l'appliquer rétroactivement
 * ferait mentir la jauge.
 *
 * Les barres montrent donc la part de chaque macro dans l'énergie du jour,
 * quatre kilocalories par gramme de protéines et de glucides, neuf par gramme
 * de lipides. C'est une lecture close sur elle-même, qui reste vraie
 * indéfiniment.
 */
export function DayBreakdown({ macros }: { macros: Macros }) {
  return (
    <Card role="region" aria-label="Totaux de la journée">
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[12.5px] text-muted-foreground">Consommé</p>
            <p className="tabular mt-0.5 text-3xl font-semibold tracking-tight">
              {formatKcal(macros.kcal)}
            </p>
          </div>
          <Badge variant="secondary">kcal au total</Badge>
        </div>

        <Separator className="my-4" />

        <MacroBars
          macros={macros}
          ratios={{
            proteinG: progressRatio(macros.proteinG * 4, macros.kcal),
            carbsG: progressRatio(macros.carbsG * 4, macros.kcal),
            fatG: progressRatio(macros.fatG * 9, macros.kcal),
          }}
        />
      </CardContent>
    </Card>
  );
}
