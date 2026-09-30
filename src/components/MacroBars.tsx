import { Progress } from '@/components/ui/progress';
import { formatGrams } from '@/lib/nutrition';
import type { Macros } from '@/lib/types';

/**
 * Les trois macros côte à côte, chacune sa barre, son intitulé et sa valeur.
 *
 * Les couleurs de graphique ne servent qu'ici. Le nom et la valeur sont
 * toujours écrits : la couleur n'est jamais le seul canal d'information.
 */

export const MACROS = [
  { key: 'proteinG', label: 'Protéines', indicator: 'bg-protein', track: 'bg-protein-soft', ink: 'text-protein-ink' },
  { key: 'carbsG', label: 'Glucides', indicator: 'bg-carb', track: 'bg-carb-soft', ink: 'text-carb-ink' },
  { key: 'fatG', label: 'Lipides', indicator: 'bg-fat', track: 'bg-fat-soft', ink: 'text-fat-ink' },
] as const satisfies readonly {
  key: keyof Omit<Macros, 'kcal'>;
  label: string;
  indicator: string;
  track: string;
  ink: string;
}[];

export type MacroKey = (typeof MACROS)[number]['key'];

export function MacroBars({
  macros,
  ratios,
}: {
  macros: Macros;
  /** Part de chaque barre, entre 0 et 1. */
  ratios: Record<MacroKey, number>;
}) {
  return (
    <div className="flex gap-3.5">
      {MACROS.map((macro) => (
        <div key={macro.key} className="min-w-0 flex-1">
          <Progress
            value={ratios[macro.key] * 100}
            aria-label={macro.label}
            indicatorClassName={macro.indicator}
            className={macro.track}
          />
          <p className={`mt-2 text-[12.5px] font-medium ${macro.ink}`}>{macro.label}</p>
          <p className="tabular mt-px font-medium">{formatGrams(macros[macro.key])} g</p>
        </div>
      ))}
    </div>
  );
}
