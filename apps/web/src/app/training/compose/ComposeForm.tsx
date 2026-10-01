'use client';

import { ChevronDownIcon, ChevronUpIcon, MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { ExercisePicker } from '@/components/ExercisePicker';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { composeSession } from '@/lib/client/training';
import {
  defaultComposed,
  MAX_REPS,
  MAX_SECONDS,
  MAX_SETS,
  MAX_TEMPLATE_EXERCISES,
  MAX_TEMPLATE_NAME,
  type ComposedExercise,
  type Exercise,
} from '@/lib/workout';

/** Pas des boutons de réglage, par nature d'exercice. */
const SECONDS_STEP: Record<Exercise['kind'], number> = {
  strength: 0,
  hold: 15,
  cardio: 5 * 60,
};

function formatDuration(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

/** Un réglage à deux boutons, lisible d'un coup d'œil, sans clavier. */
function Stepper({
  label,
  value,
  display,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (next: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={`${label} : moins`}
      >
        <MinusIcon />
      </Button>
      <span className="tabular w-[62px] text-center text-[14.5px] font-medium" aria-live="polite">
        <span className="sr-only">{label} : </span>
        {display}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={`${label} : plus`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

/**
 * Composer une séance sans rien écrire.
 *
 * Tout se règle au doigt : on coche des exercices, on ajuste séries et
 * répétitions avec des boutons, on remonte ou descend une ligne. La saisie au
 * clavier existe déjà pour recopier une séance faite ; ici on prépare celle à
 * faire, souvent debout dans la salle, et un clavier y est de trop.
 *
 * La séance est gardée dans les favoris par défaut : on compose rarement une
 * séance pour ne jamais la refaire. Le choix contraire reste à un appui.
 */
export function ComposeForm({
  catalog,
  initialFavorites,
}: {
  catalog: readonly Exercise[];
  initialFavorites: readonly number[];
}) {
  const router = useRouter();
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<ComposedExercise[]>([]);
  const [keep, setKeep] = useState(true);
  const [picking, setPicking] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(() => new Set(initialFavorites));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = new Set(entries.map((entry) => entry.exerciseId));

  function toggle(exercise: Exercise) {
    setEntries((current) =>
      current.some((entry) => entry.exerciseId === exercise.id)
        ? current.filter((entry) => entry.exerciseId !== exercise.id)
        : current.length >= MAX_TEMPLATE_EXERCISES
          ? current
          : [...current, defaultComposed(exercise)],
    );
  }

  function patch(index: number, change: Partial<ComposedExercise>) {
    setEntries((current) =>
      current.map((entry, position) => (position === index ? { ...entry, ...change } : entry)),
    );
  }

  function move(index: number, delta: -1 | 1) {
    setEntries((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function submit(start: boolean) {
    setBusy(true);
    setError(null);
    const outcome = await composeSession({
      name: name.trim() === '' ? null : name,
      exercises: entries,
      keep,
      start,
    });
    if (outcome.kind === 'error') {
      setBusy(false);
      setError('La séance n’a pas pu être enregistrée.');
      return;
    }
    if (start && outcome.sessionId !== null) {
      router.replace(`/training/session/${outcome.sessionId}`);
      return;
    }
    router.replace('/training');
    router.refresh();
  }

  return (
    <>
      <NavHeader label="Sport" href="/training" />
      <PageTitle
        title="Composer une séance"
        description="Choisis tes exercices, règle séries et répétitions, et lance."
      />

      <div className="mt-5 grid gap-2">
        <Label htmlFor="compose-name">Nom</Label>
        <Input
          id="compose-name"
          value={name}
          maxLength={MAX_TEMPLATE_NAME}
          placeholder="Ma séance"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {entries.map((entry, index) => {
          const exercise = byId.get(entry.exerciseId);
          if (exercise === undefined) {
            return null;
          }
          const timed = exercise.kind !== 'strength';
          return (
            <Card key={entry.exerciseId} className="py-3">
              <CardContent className="px-3.5">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium tracking-tight">
                      {exercise.name}
                    </p>
                    {exercise.muscleGroup !== null ? (
                      <p className="text-[12.5px] text-muted-foreground">{exercise.muscleGroup}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Monter ${exercise.name}`}
                  >
                    <ChevronUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, 1)}
                    disabled={index === entries.length - 1}
                    aria-label={`Descendre ${exercise.name}`}
                  >
                    <ChevronDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggle(exercise)}
                    aria-label={`Retirer ${exercise.name}`}
                  >
                    <XIcon />
                  </Button>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  {exercise.kind === 'cardio' ? null : (
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] text-muted-foreground">Séries</span>
                      <Stepper
                        label={`Séries de ${exercise.name}`}
                        value={entry.sets}
                        display={String(entry.sets)}
                        onChange={(sets) => patch(index, { sets })}
                        step={1}
                        min={1}
                        max={MAX_SETS}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-muted-foreground">
                      {timed ? 'Durée' : 'Reps'}
                    </span>
                    {timed ? (
                      <Stepper
                        label={`Durée de ${exercise.name}`}
                        value={entry.seconds ?? SECONDS_STEP[exercise.kind]}
                        display={formatDuration(entry.seconds ?? SECONDS_STEP[exercise.kind])}
                        onChange={(seconds) => patch(index, { seconds })}
                        step={SECONDS_STEP[exercise.kind]}
                        min={SECONDS_STEP[exercise.kind]}
                        max={MAX_SECONDS}
                      />
                    ) : (
                      <Stepper
                        label={`Répétitions de ${exercise.name}`}
                        value={entry.reps ?? 10}
                        display={String(entry.reps ?? 10)}
                        onChange={(reps) => patch(index, { reps })}
                        step={1}
                        min={1}
                        max={MAX_REPS}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button
        type="button"
        variant={entries.length === 0 ? 'default' : 'outline'}
        onClick={() => setPicking(true)}
        disabled={entries.length >= MAX_TEMPLATE_EXERCISES}
        className="mt-3 w-full"
      >
        <PlusIcon />
        {entries.length === 0 ? 'Choisir des exercices' : 'Ajouter des exercices'}
      </Button>

      <Card className="mt-4">
        <CardContent className="flex items-center gap-3.5">
          <div className="min-w-0 flex-1">
            <Label htmlFor="compose-keep" className="text-[14.5px]">
              Garder dans mes favoris
            </Label>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {keep
                ? 'Elle se relancera d’un appui depuis l’accueil du Sport.'
                : 'Faite une fois, elle restera dans l’historique seulement.'}
            </p>
          </div>
          <Switch id="compose-keep" checked={keep} onCheckedChange={setKeep} />
        </CardContent>
      </Card>

      {error ? <ErrorAlert className="mt-3">{error}</ErrorAlert> : null}

      <BottomBar className="flex gap-2.5">
        {keep ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void submit(false)}
            disabled={busy || entries.length === 0}
            className="flex-1"
          >
            Enregistrer
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={() => void submit(true)}
          disabled={busy || entries.length === 0}
          className="flex-[1.4]"
        >
          {busy ? 'Un instant…' : 'Commencer'}
        </Button>
      </BottomBar>

      <ExercisePicker
        open={picking}
        title="Choisir des exercices"
        description="Coche ceux de la séance. L’étoile les garde en tête de liste."
        catalog={catalog}
        favorites={favorites}
        onFavoritesChange={setFavorites}
        selected={chosen}
        excluded={new Set()}
        multiple
        onToggle={toggle}
        onClose={() => setPicking(false)}
      />
    </>
  );
}
