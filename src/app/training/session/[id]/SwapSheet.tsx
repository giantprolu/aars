import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { normalizeExerciseName } from '@/lib/workout-log';
import { EQUIPMENT_LABELS, swapCandidates, type Exercise } from '@/lib/workout';

/**
 * Choisir l'exercice qui en remplace un autre, devant la machine occupée.
 *
 * Les plus proches d'abord — même groupe musculaire — parce que c'est ce qu'on
 * cherche en premier, puis tout le reste de la salle : quand tout est pris, on
 * fait ce qui est libre, et l'écran n'a pas à en juger. La recherche est là
 * pour le cas où l'on sait déjà ce qu'on va faire.
 */
export function SwapSheet({
  target,
  catalog,
  excluded,
  onPick,
  onClose,
}: {
  /** L'exercice à remplacer, ou `null` quand la feuille est fermée. */
  target: Exercise | null;
  catalog: readonly Exercise[];
  /** Les exercices déjà dans la séance, qu'on ne peut pas choisir deux fois. */
  excluded: ReadonlySet<number>;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const needle = normalizeExerciseName(query);
  const matches = (exercise: Exercise) =>
    needle === '' ||
    [exercise.name, ...exercise.aliases].some((name) =>
      normalizeExerciseName(name).includes(needle),
    );
  const { closest, others } =
    target === null ? { closest: [], others: [] } : swapCandidates(target, catalog, excluded);
  const groups = [
    { label: 'Même groupe musculaire', items: closest.filter(matches) },
    {
      label: closest.length > 0 ? 'Autres exercices' : 'Exercices de la salle',
      items: others.filter(matches),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) {
          setQuery('');
          onClose();
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="text-[17px]">Remplacer l’exercice</SheetTitle>
          <SheetDescription>
            {target === null ? '' : `À la place de ${target.name}, pour cette séance seulement.`}
          </SheetDescription>
        </SheetHeader>

        <Input
          type="search"
          placeholder="Chercher un exercice"
          aria-label="Chercher un exercice"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-4"
        />

        {groups.length === 0 ? (
          <p className="mt-6 text-[13.5px] text-muted-foreground">
            Aucun exercice de la salle ne correspond.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.label} className="mt-5">
            <h3 className="mb-1 text-[12.5px] font-medium text-muted-foreground">{group.label}</h3>
            <ul className="divide-y">
              {group.items.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      onPick(exercise);
                    }}
                    className="flex w-full items-baseline justify-between gap-3 py-3 text-left"
                  >
                    <span className="text-[15px] font-medium tracking-tight">{exercise.name}</span>
                    <span className="flex-none text-[12.5px] text-muted-foreground">
                      {EQUIPMENT_LABELS[exercise.equipment]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </SheetContent>
    </Sheet>
  );
}
