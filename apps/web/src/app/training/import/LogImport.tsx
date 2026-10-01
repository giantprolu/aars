'use client';

import { ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { ExerciseSheet, type SheetExercise } from '@/components/ExerciseSheet';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  analyseWorkoutLog,
  saveWrittenSession,
  type AnalysedLinePayload,
} from '@/lib/client/training';
import { formatSet } from '@/lib/workout';

/**
 * Saisie d'une séance écrite à la main.
 *
 * Personne ne remplit une grille pendant qu'il s'entraîne. On note sa séance
 * en trois lignes, dans la langue de la salle, et c'est ce texte-là qu'il faut
 * accepter :
 *
 *     Chest press machine 4X12 27.5kg - 20 kg - 27.5 kg - 20 kg
 *
 * L'écran travaille en deux temps. La lecture propose un rapprochement avec le
 * catalogue et n'écrit rien ; l'enregistrement n'a lieu qu'après confirmation.
 * Un exercice mal reconnu se valide d'un geste distrait, alors qu'il se
 * corrige difficilement une fois la séance en base.
 *
 * Les séries lues ne sont pas modifiables ici, volontairement. Corriger une
 * charge dans une grille de confirmation demanderait autant de champs que la
 * saisie qu'on cherche justement à éviter : on corrige le texte, et on relit.
 */

const EXAMPLE = `Chest press machine 4X12 27.5kg - 20 kg - 27.5 kg - 20 kg
shoulder press machine 3X10 50 - 42.5 - 35
pec deck 2X12 et 1X10 (echec) 6-6-6`;

const WARNINGS: Record<AnalysedLinePayload['warning'], string | null> = {
  none: null,
  no_sets: 'Aucune série reconnue sur cette ligne.',
  weight_count: 'Le nombre de charges ne correspond pas au nombre de séries.',
};

/** L'exercice retenu pour une ligne : un identifiant, ou la création. */
type Choice = { kind: 'catalog'; id: number } | { kind: 'new' };

function initialChoice(line: AnalysedLinePayload): Choice {
  return line.matchedExerciseId === null
    ? { kind: 'new' }
    : { kind: 'catalog', id: line.matchedExerciseId };
}

export function LogImport({ today }: { today: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [sessionDate, setSessionDate] = useState(today);
  const [lines, setLines] = useState<AnalysedLinePayload[] | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [kept, setKept] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<SheetExercise | null>(null);

  async function analyse() {
    if (text.trim() === '') {
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await analyseWorkoutLog(text);
    setBusy(false);

    if (outcome.kind === 'error') {
      setError('La séance n’a pas pu être lue. Réessaie dans un instant.');
      return;
    }
    if (outcome.lines.length === 0) {
      setError('Aucun exercice reconnu dans ce texte.');
      return;
    }

    setLines(outcome.lines);
    setChoices(outcome.lines.map(initialChoice));
    // Une ligne sans série est un titre ou une note : décochée d'emblée, mais
    // laissée visible, parce que la décocher en silence ferait croire à une
    // perte de données.
    setKept(outcome.lines.map((line) => line.sets.length > 0));
  }

  async function save() {
    if (lines === null) {
      return;
    }
    const payload = lines
      .map((line, index) => ({ line, choice: choices[index]!, keep: kept[index] === true }))
      .filter((entry) => entry.keep && entry.line.sets.length > 0)
      .map((entry) => ({
        exerciseId: entry.choice.kind === 'catalog' ? entry.choice.id : null,
        name: entry.line.name,
        sets: entry.line.sets,
      }));

    if (payload.length === 0) {
      setError('Aucune ligne retenue.');
      return;
    }

    setBusy(true);
    setError(null);
    const outcome = await saveWrittenSession({ sessionDate, lines: payload });
    setBusy(false);

    if (outcome.kind === 'error') {
      setError('La séance n’a pas pu être enregistrée.');
      return;
    }
    router.push(`/training/session/${outcome.id}`);
    router.refresh();
  }

  return (
    <>
      <NavHeader label="Sport" href="/training" />

      <PageTitle
        title="Saisir une séance"
        description="Recopie ta séance telle que tu l’as notée, une ligne par exercice. Le nom, les séries, puis les charges dans l’ordre."
        className="mb-5"
      />

      <div className="grid gap-2">
        <Label htmlFor="log">Ta séance</Label>
        <Textarea
          id="log"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          placeholder={EXAMPLE}
          spellCheck={false}
          className="font-mono text-[13px] md:text-[13px]"
        />
      </div>

      <Button
        type="button"
        variant={lines === null ? 'default' : 'outline'}
        onClick={() => void analyse()}
        disabled={busy || text.trim() === ''}
        className="mt-3 w-full"
      >
        {busy && lines === null ? 'Lecture…' : lines === null ? 'Lire la séance' : 'Relire le texte'}
      </Button>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {lines !== null ? (
        <>
          <h2 className="mt-6 mb-2 text-[12.5px] text-muted-foreground">Ce qui a été lu</h2>

          <ul className="flex flex-col gap-2.5">
            {lines.map((line, index) => {
              const choice = choices[index]!;
              const warning = WARNINGS[line.warning];
              const keep = kept[index] === true;
              const chosen =
                choice.kind === 'catalog'
                  ? (line.candidates.find((candidate) => candidate.id === choice.id) ?? null)
                  : null;

              return (
                <li key={index}>
                  <Card className={cn(!keep && 'opacity-60')}>
                    <CardContent>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`keep-${index}`}
                          checked={keep}
                          disabled={line.sets.length === 0}
                          onCheckedChange={(checked) =>
                            setKept((current) =>
                              current.map((value, position) =>
                                position === index ? checked === true : value,
                              ),
                            )
                          }
                          className="mt-0.5 size-[18px]"
                        />
                        <label htmlFor={`keep-${index}`} className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-medium tracking-tight">
                            {line.name}
                          </span>
                          <span className="mt-px block font-mono text-[12px] break-words text-muted-foreground">
                            {line.raw}
                          </span>
                        </label>
                      </div>

                      {line.sets.length > 0 ? (
                        <p className="tabular mt-2 text-[12.5px]">
                          {line.sets.map((set) => formatSet(set)).join(' · ')}
                        </p>
                      ) : null}

                      {warning !== null ? (
                        <p className="mt-2 text-[12.5px] text-destructive">{warning}</p>
                      ) : null}

                      {line.sets.length > 0 ? (
                        <div className="mt-2.5 flex items-center gap-2">
                          <Select
                            value={choice.kind === 'new' ? 'new' : String(choice.id)}
                            onValueChange={(value) =>
                              setChoices((current) =>
                                current.map((entry, position) =>
                                  position === index
                                    ? value === 'new'
                                      ? { kind: 'new' }
                                      : { kind: 'catalog', id: Number(value) }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <SelectTrigger
                              aria-label={`Exercice correspondant à ${line.name}`}
                              className="min-w-0 flex-1 data-[size=default]:h-10"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {line.candidates.map((candidate) => (
                                <SelectItem key={candidate.id} value={String(candidate.id)}>
                                  {candidate.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="new">Créer « {line.name} »</SelectItem>
                            </SelectContent>
                          </Select>

                          {/*
                            La photo du candidat retenu, à un toucher. C'est en
                            confirmant un rapprochement qu'on en a le plus besoin :
                            « rowing » propose quatre exercices, et les noms seuls
                            ne suffisent pas à trancher.
                          */}
                          {chosen === null ? null : (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setShown(chosen)}
                              aria-label={`Voir ${chosen.name}`}
                            >
                              <ImageIcon />
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid gap-2">
            <Label htmlFor="session-date">Jour de la séance</Label>
            <Input
              id="session-date"
              type="date"
              value={sessionDate}
              max={today}
              onChange={(event) => setSessionDate(event.target.value)}
              className="tabular"
            />
          </div>

          <BottomBar className="flex gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLines(null);
                setError(null);
              }}
              disabled={busy}
              className="flex-1"
            >
              Corriger le texte
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy} className="flex-[1.4]">
              {busy ? 'Enregistrement…' : 'Enregistrer la séance'}
            </Button>
          </BottomBar>
        </>
      ) : null}

      <ExerciseSheet exercise={shown} onClose={() => setShown(null)} />
    </>
  );
}
