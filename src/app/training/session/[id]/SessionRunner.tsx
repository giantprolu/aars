"use client";

import {
  ArrowLeftRightIcon,
  CheckIcon,
  FlameIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomBar } from "@/components/BottomBar";
import { ErrorAlert } from "@/components/ErrorAlert";
import { ExerciseSheet, type SheetExercise } from "@/components/ExerciseSheet";
import { NavHeader, PageTitle } from "@/components/ScreenHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  discardSession,
  finishSession,
  recordSet,
} from "@/lib/client/training";
import {
  bestSet,
  DEFAULT_REST_SECONDS,
  formatClock,
  formatPrescription,
  formatSet,
  sessionVolume,
  type Exercise,
  type SessionExercise,
  type TemplateExercise,
  type WorkoutSession,
  type WorkoutSet,
} from "@/lib/workout";
import { SessionClock, type Rest } from "./SessionClock";
import { SwapSheet } from "./SwapSheet";

/**
 * Exécution d'une séance, série par série.
 *
 * Chaque série affiche ce qui a été fait la dernière fois sur le même
 * exercice. C'est toute la raison d'être du module : sans ce rappel, on refait
 * chaque semaine la charge dont on se souvient, c'est-à-dire la plus
 * confortable, et la progression s'arrête sans qu'on s'en aperçoive.
 *
 * Les valeurs sont préremplies avec la dernière performance, pas laissées
 * vides. En salle, entre deux séries, on veut valider un chiffre déjà là, pas
 * en saisir deux au clavier. Le geste ordinaire devient une confirmation.
 *
 * Une série déjà enregistrée reste modifiable : on corrige une charge mal
 * saisie sur place, et l'écriture remplace la valeur au lieu d'ajouter une
 * série fantôme au volume.
 *
 * Un exercice se remplace par un autre pour la séance, sans toucher au
 * programme : la machine est prise aujourd'hui, elle ne l'est pas pour
 * toujours. Tant qu'aucune série n'est faite, le choix vit dans l'adresse et
 * se défait ; à la première série, c'est la série qui le retient.
 *
 * Valider une nouvelle série lance le repos. Corriger une série déjà faite ne
 * le relance pas : on corrige après coup, pas entre deux séries.
 */

/** L'état local d'une case de la grille, avant enregistrement. */
interface Draft {
  weightKg: string;
  reps: string;
  seconds: string;
  /**
   * La série est allée jusqu'à l'échec musculaire.
   *
   * Jamais préremplie depuis la dernière fois, contrairement aux chiffres :
   * l'échec est un fait de la série qu'on vient de faire, pas une consigne.
   * Le reporter d'une semaine sur l'autre inventerait un effort.
   */
  toFailure: boolean;
}

function draftKey(exerciseId: number, setIndex: number): string {
  return `${exerciseId}:${setIndex}`;
}

/** Ce qu'on propose dans une case vide : la dernière performance, ou la consigne. */
function initialDraft(
  entry: TemplateExercise,
  previous: WorkoutSet | null,
): Draft {
  if (entry.exercise.kind === "hold" || entry.exercise.kind === "cardio") {
    return {
      weightKg: "",
      reps: "",
      seconds: String(previous?.seconds ?? entry.targetSeconds ?? ""),
      toFailure: false,
    };
  }
  return {
    weightKg:
      previous?.weightKg === null || previous === null
        ? ""
        : String(previous.weightKg),
    // La borne haute de la fourchette, pas la basse : c'est elle qu'on vise,
    // et l'atteindre sur toutes les séries est le signal qu'il faut charger.
    reps: String(
      previous?.reps ?? entry.targetRepsMax ?? entry.targetRepsMin ?? "",
    ),
    seconds: "",
    toFailure: false,
  };
}

export function SessionRunner({
  session,
  exercises,
  previous,
  catalog,
}: {
  session: WorkoutSession;
  /** Les exercices à faire, remplacements appliqués. Vide pour une séance libre. */
  exercises: readonly SessionExercise[];
  /** Ce qui a été fait la dernière fois, par identifiant d'exercice. */
  previous: Record<number, WorkoutSet[]>;
  /** Les exercices de la salle, parmi lesquels choisir un remplaçant. */
  catalog: readonly Exercise[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<SheetExercise | null>(null);
  const [swapping, setSwapping] = useState<SessionExercise | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);

  const doneSets = new Map(
    session.sets.map((set) => [draftKey(set.exerciseId, set.setIndex), set]),
  );

  function readDraft(entry: TemplateExercise, setIndex: number): Draft {
    const key = draftKey(entry.exercise.id, setIndex);
    const existing = drafts[key];
    if (existing !== undefined) {
      return existing;
    }

    const recorded = doneSets.get(key);
    if (recorded !== undefined) {
      return {
        weightKg: recorded.weightKg === null ? "" : String(recorded.weightKg),
        reps: recorded.reps === null ? "" : String(recorded.reps),
        seconds: recorded.seconds === null ? "" : String(recorded.seconds),
        toFailure: recorded.toFailure,
      };
    }

    const history = previous[entry.exercise.id] ?? [];
    return initialDraft(entry, history[setIndex - 1] ?? bestSet(history));
  }

  function patch(key: string, change: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          weightKg: "",
          reps: "",
          seconds: "",
          toFailure: false,
        }),
        ...change,
      },
    }));
  }

  /**
   * Écrit les remplacements encore révocables dans l'adresse, et recharge.
   *
   * Ceux que des séries portent déjà n'y figurent pas : le serveur les relit
   * dans les séries, et les laisser dans l'adresse n'ajouterait rien.
   */
  function applySwap(position: number, exerciseId: number | null) {
    const params = new URLSearchParams();
    for (const entry of exercises) {
      if (
        entry.position === position ||
        entry.planned === null ||
        entry.locked
      ) {
        continue;
      }
      params.append("swap", `${entry.position}:${entry.exercise.id}`);
    }
    if (exerciseId !== null) {
      params.append("swap", `${position}:${exerciseId}`);
    }
    const query = params.toString();
    router.replace(
      `/training/session/${session.id}${query === "" ? "" : `?${query}`}`,
      {
        scroll: false,
      },
    );
  }

  /**
   * Le repos après une série, sauf au milieu d'un superset : les deux
   * exercices s'enchaînent sans pause, et le repos vient après le second.
   */
  function restAfter(entry: TemplateExercise): number | null {
    if (
      entry.supersetGroup !== null &&
      exercises.some(
        (other) =>
          other.supersetGroup === entry.supersetGroup &&
          other.position > entry.position,
      )
    ) {
      return null;
    }
    return entry.restSeconds ?? DEFAULT_REST_SECONDS;
  }

  async function save(entry: TemplateExercise, setIndex: number) {
    const draft = readDraft(entry, setIndex);
    const isCorrection = doneSets.has(draftKey(entry.exercise.id, setIndex));
    const isTimed =
      entry.exercise.kind === "hold" || entry.exercise.kind === "cardio";

    setBusy(true);
    setError(null);
    const outcome = await recordSet({
      sessionId: session.id,
      exerciseId: entry.exercise.id,
      position: entry.position,
      setIndex,
      weightKg:
        isTimed || draft.weightKg.trim() === "" ? null : Number(draft.weightKg),
      reps: isTimed || draft.reps.trim() === "" ? null : Number(draft.reps),
      seconds:
        isTimed && draft.seconds.trim() !== "" ? Number(draft.seconds) : null,
      toFailure: draft.toFailure,
    });
    setBusy(false);

    if (outcome.kind === "ok") {
      const seconds = isCorrection ? null : restAfter(entry);
      if (seconds !== null) {
        setRest({ endsAt: Date.now() + seconds * 1000 });
      }
      router.refresh();
      return;
    }
    setError("Série non enregistrée. Vérifie les valeurs.");
  }

  async function finish() {
    setBusy(true);
    const outcome = await finishSession(session.id);
    setBusy(false);
    if (outcome.kind === "ok") {
      router.replace("/training");
      router.refresh();
      return;
    }
    setError("La séance n’a pas pu être terminée.");
  }

  async function discard() {
    setBusy(true);
    await discardSession(session.id);
    setBusy(false);
    router.replace("/training");
    router.refresh();
  }

  const closed = session.finishedAt !== null;
  const plannedSets = exercises.reduce(
    (total, entry) => total + entry.targetSets,
    0,
  );
  const recordedSets = session.sets.length;
  const duration =
    session.finishedAt === null
      ? null
      : (new Date(session.finishedAt).getTime() -
          new Date(session.startedAt).getTime()) /
        1000;

  return (
    <>
      <NavHeader label="Sport" href="/training" />

      <PageTitle
        title={session.templateName ?? "Séance libre"}
        description={
          <span className="tabular">
            {plannedSets > 0
              ? `${recordedSets} séries sur ${plannedSets}`
              : `${recordedSets} série${recordedSets > 1 ? "s" : ""}`}{" "}
            · {sessionVolume(session.sets).toLocaleString("fr-FR")} kg soulevés
            {duration !== null ? ` · terminée en ${formatClock(duration)}` : ""}
          </span>
        }
      />
      {plannedSets > 0 ? (
        <Progress
          value={Math.min(100, (recordedSets / plannedSets) * 100)}
          aria-label="Séries enregistrées"
          className="mt-3"
        />
      ) : null}

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {exercises.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          Cette séance ne suit aucun modèle : ses séries ne peuvent pas être
          préremplies.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2.5">
        {exercises.map((entry) => {
          const history = previous[entry.exercise.id] ?? [];
          const reference = bestSet(history);
          const isTimed =
            entry.exercise.kind === "hold" || entry.exercise.kind === "cardio";
          const indices = Array.from(
            { length: entry.targetSets },
            (_, index) => index + 1,
          );
          const doneCount = indices.filter((setIndex) =>
            doneSets.has(draftKey(entry.exercise.id, setIndex)),
          ).length;
          // La prochaine série à faire est mise en avant : c'est la seule que
          // le regard cherche en revenant au téléphone entre deux séries.
          const nextIndex = indices.find(
            (setIndex) => !doneSets.has(draftKey(entry.exercise.id, setIndex)),
          );

          return (
            <Card key={entry.id} role="region" aria-label={entry.exercise.name}>
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/*
                      Le nom ouvre la fiche, ici aussi. C'est en salle, devant la
                      machine, qu'on a le plus besoin de vérifier qu'on est au bon
                      appareil — et c'est le seul endroit où l'on ne peut pas aller
                      chercher l'information ailleurs sans perdre sa place.
                    */}
                    <button
                      type="button"
                      onClick={() => setShown(entry.exercise)}
                      className="text-left text-[15px] font-medium tracking-tight underline decoration-border underline-offset-4"
                    >
                      {entry.exercise.name}
                    </button>
                    <p className="tabular mt-0.5 text-[12.5px] text-muted-foreground">
                      Objectif {formatPrescription(entry)}
                    </p>
                    {entry.planned !== null ? (
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        À la place de {entry.planned.name}
                        {!entry.locked && !closed ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => applySwap(entry.position, null)}
                              className="underline underline-offset-4"
                            >
                              Revenir
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    {/*
                      Le remplacement n'est offert qu'avant la première série :
                      une fois l'exercice commencé, les séries faites le nomment,
                      et les rattacher à un autre appareil mentirait.
                    */}
                    {!closed && !entry.locked ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => setSwapping(entry)}
                        aria-label={`Remplacer ${entry.exercise.name}`}
                      >
                        <ArrowLeftRightIcon />
                      </Button>
                    ) : null}
                    {reference !== null ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                      >
                        <Link
                          href={`/training/progress/${entry.exercise.id}`}
                          aria-label={`Progression sur ${entry.exercise.name}`}
                        >
                          <TrendingUpIcon />
                        </Link>
                      </Button>
                    ) : null}
                    <Badge
                      variant={
                        doneCount === entry.targetSets ? "secondary" : "outline"
                      }
                      className="tabular"
                    >
                      {doneCount}/{entry.targetSets}
                    </Badge>
                  </div>
                </div>

                {entry.notes !== null ? (
                  <p className="mt-2 text-[12.5px] text-muted-foreground">
                    {entry.notes}
                  </p>
                ) : null}

                <p className="tabular mt-2.5 mb-1 text-[12.5px] text-muted-foreground">
                  {reference !== null
                    ? `La dernière fois : ${formatSet(reference)}${history.length > 1 ? `, sur ${history.length} séries` : ""}`
                    : "Première fois sur cet exercice."}
                </p>

                <ul>
                  {indices.map((setIndex) => {
                    const key = draftKey(entry.exercise.id, setIndex);
                    const recorded = doneSets.get(key);
                    const draft = readDraft(entry, setIndex);
                    const isNext = setIndex === nextIndex && !closed;

                    return (
                      <li
                        key={setIndex}
                        className={cn(
                          "flex items-center gap-2 py-1.5",
                          recorded && "opacity-60 focus-within:opacity-100",
                        )}
                      >
                        <span className="tabular w-5 flex-none text-[12px] text-muted-foreground">
                          {setIndex}
                        </span>

                        {isTimed ? (
                          <div className="relative min-w-0 flex-1">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              aria-label={`Durée de la série ${setIndex} en secondes`}
                              value={draft.seconds}
                              onChange={(event) =>
                                patch(key, { seconds: event.target.value })
                              }
                              className="tabular pr-7"
                            />
                            <span
                              aria-hidden
                              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground"
                            >
                              s
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="relative min-w-0 flex-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={0.5}
                                aria-label={`Charge de la série ${setIndex} en kilogrammes`}
                                value={draft.weightKg}
                                onChange={(event) =>
                                  patch(key, { weightKg: event.target.value })
                                }
                                className="tabular pr-8"
                              />
                              <span
                                aria-hidden
                                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground"
                              >
                                kg
                              </span>
                            </div>
                            <div className="relative w-[74px] flex-none">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                aria-label={`Répétitions de la série ${setIndex}`}
                                value={draft.reps}
                                onChange={(event) =>
                                  patch(key, { reps: event.target.value })
                                }
                                className="tabular pr-9"
                              />
                              <span
                                aria-hidden
                                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted-foreground"
                              >
                                rép.
                              </span>
                            </div>
                          </>
                        )}

                        {/*
                          L'échec se marque au moment où il a lieu, d'un appui,
                          et non dans un écran de correction : « 6 répétitions »
                          et « 6 répétitions à l'échec » ne demandent pas la même
                          charge la semaine suivante, et c'est cette différence
                          qui rend la ligne relisible.
                        */}
                        <Toggle
                          variant="outline"
                          pressed={draft.toFailure}
                          onPressedChange={(pressed) =>
                            patch(key, { toFailure: pressed })
                          }
                          disabled={busy || closed}
                          aria-label={`Série ${setIndex} menée à l'échec`}
                          className="size-10 flex-none"
                        >
                          <FlameIcon />
                        </Toggle>

                        <Button
                          type="button"
                          variant={
                            recorded
                              ? "secondary"
                              : isNext
                                ? "default"
                                : "outline"
                          }
                          size="icon"
                          onClick={() => void save(entry, setIndex)}
                          disabled={busy || closed}
                          aria-label={`${recorded ? "Corriger" : "Valider"} la série ${setIndex} de ${entry.exercise.name}`}
                          className="flex-none"
                        >
                          <CheckIcon />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!closed ? (
        <BottomBar surface="card">
          <SessionClock
            startedAt={session.startedAt}
            rest={rest}
            onRestChange={setRest}
          />
          <div className="flex gap-2.5">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  className="flex-1"
                >
                  Abandonner
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Abandonner la séance ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Les séries de cette séance ne seront pas enregistrées.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continuer la séance</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void discard()}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Abandonner
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              type="button"
              onClick={() => void finish()}
              disabled={busy}
              className="flex-[1.4]"
            >
              Terminer la séance
            </Button>
          </div>
        </BottomBar>
      ) : null}

      <ExerciseSheet exercise={shown} onClose={() => setShown(null)} />
      <SwapSheet
        target={swapping?.exercise ?? null}
        catalog={catalog}
        excluded={new Set(exercises.map((entry) => entry.exercise.id))}
        onPick={(exercise) => {
          if (swapping !== null) {
            applySwap(swapping.position, exercise.id);
          }
          setSwapping(null);
        }}
        onClose={() => setSwapping(null)}
      />
    </>
  );
}
