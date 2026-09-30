'use client';

import { PlayIcon, StarIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { ExerciseSheet, type SheetExercise } from '@/components/ExerciseSheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { setTemplateFavorite, startFreeSession, startSession } from '@/lib/client/training';
import { formatRecentDay } from '@/lib/date';
import {
  formatPrescription,
  groupBySuperset,
  sessionVolume,
  type TrainingPreferences,
  type WorkoutSession,
  type WorkoutTemplate,
} from '@/lib/workout';
import { formatTonnage } from '@/lib/workout-progress';
import { cn } from '@/lib/utils';

/** Durée d'une séance terminée, en minutes, ou `null` si elle ne se mesure pas. */
function durationMinutes(session: WorkoutSession): number | null {
  if (session.finishedAt === null) {
    return null;
  }
  const minutes = Math.round(
    (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
  );
  return minutes > 0 && minutes < 600 ? minutes : null;
}

/** Durée estimée d'une séance modèle : deux minutes et demie par série, repos compris. */
function estimatedMinutes(template: WorkoutTemplate): number {
  const sets = template.exercises.reduce((total, entry) => total + entry.targetSets, 0);
  return Math.max(10, Math.round((sets * 2.5) / 5) * 5);
}

/** Une ligne d'exercices : un superset se lit « Tirage vertical + Dips ». */
function ExerciseLines({
  template,
  onShow,
  limit,
}: {
  template: WorkoutTemplate;
  onShow: (exercise: SheetExercise) => void;
  limit?: number;
}) {
  const blocks = groupBySuperset(template.exercises);
  const shown = limit === undefined ? blocks : blocks.slice(0, limit);
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {shown.map((block, index) => (
        <li key={index} className="flex justify-between gap-3">
          <span className="min-w-0">
            {block.map((entry, rank) => (
              <span key={entry.id}>
                {rank > 0 ? ' + ' : null}
                <button type="button" onClick={() => onShow(entry.exercise)} className="text-left">
                  {entry.exercise.name}
                </button>
              </span>
            ))}
          </span>
          <span className="flex-none opacity-80">{formatPrescription(block[0]!)}</span>
        </li>
      ))}
      {limit !== undefined && blocks.length > limit ? (
        <li className="opacity-80">et {blocks.length - limit} de plus</li>
      ) : null}
    </ul>
  );
}

/**
 * L'accueil du Sport (maquette 5a, écran 4) : trois chiffres de la semaine, la
 * séance du jour en bleu nuit, le programme en cartes qu'on fait défiler, puis
 * les dernières séances.
 *
 * La séance ouverte passe avant tout le reste. C'est le cas nominal en salle :
 * on pose son téléphone entre deux séries, l'application se recharge, et il
 * faut retrouver la séance là où on l'a laissée sans la chercher.
 *
 * Commencer une séance libre, en composer une ou noter une séance déjà faite
 * passent par le bouton + de la barre.
 */
export function TrainingHome({
  templates,
  openSession,
  nextTemplateId,
  history,
  preferences,
  weekSessions,
  weekVolume,
  volumeChange,
  records,
  recordSessionIds,
}: {
  templates: readonly WorkoutTemplate[];
  openSession: WorkoutSession | null;
  /** La séance du programme qui vient ensuite. */
  nextTemplateId: number | null;
  history: readonly WorkoutSession[];
  preferences: TrainingPreferences;
  weekSessions: number;
  weekVolume: number;
  /** Évolution du tonnage sur la semaine précédente, en pour cent, ou `null`. */
  volumeChange: number | null;
  /** Les exercices dont le record tombe cette semaine. */
  records: readonly string[];
  recordSessionIds: readonly number[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<SheetExercise | null>(null);
  const [detail, setDetail] = useState<WorkoutTemplate | null>(null);
  const [confirmUnfavorite, setConfirmUnfavorite] = useState<WorkoutTemplate | null>(null);

  async function begin(templateId: number | null) {
    setBusy(true);
    setError(null);
    const outcome = templateId === null ? await startFreeSession() : await startSession(templateId);
    setBusy(false);

    if (outcome.kind === 'started') {
      router.push(`/training/session/${outcome.id}`);
      return;
    }
    setError('La séance n’a pas pu être ouverte.');
  }

  async function toggleFavorite(template: WorkoutTemplate) {
    setBusy(true);
    setError(null);
    const outcome = await setTemplateFavorite(template.id, !template.favorite);
    setBusy(false);
    if (outcome.kind === 'ok') {
      setDetail(null);
      router.refresh();
      return;
    }
    setError('Le favori n’a pas pu être modifié.');
  }

  const planned = Math.max(preferences.sessionsPerWeek, 1);
  const next = templates.find((template) => template.id === nextTemplateId) ?? null;
  // Les favoris d'abord, puis le reste du programme, dans son ordre.
  const cards = [
    ...templates.filter((template) => template.favorite),
    ...templates.filter((template) => !template.favorite && template.kind === 'program'),
  ];
  const lastDone = new Map<number, string>();
  for (const session of history) {
    if (session.templateId !== null && !lastDone.has(session.templateId)) {
      lastDone.set(session.templateId, session.sessionDate);
    }
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-sport-soft px-3 py-2.5">
          <p className="text-[11.5px] font-semibold text-sport-ink">Séances</p>
          <p className="text-xl font-semibold">
            {weekSessions}
            <span className="text-xs font-medium text-muted-foreground"> / {planned}</span>
          </p>
          <div aria-hidden className="mt-0.5 flex gap-[3px]">
            {Array.from({ length: planned }, (_, index) => (
              <span
                key={index}
                className={cn('h-1 flex-1 rounded-full', index < weekSessions ? 'bg-sport' : 'bg-sport-mid')}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-sport-soft px-3 py-2.5">
          <p className="text-[11.5px] font-semibold text-sport-ink">Volume</p>
          <p className="text-xl font-semibold">{formatTonnage(weekVolume)}</p>
          {volumeChange === null ? null : (
            <p className="text-[11px] font-semibold text-sport-ink">
              {volumeChange > 0 ? '+' : volumeChange < 0 ? '−' : ''}
              {Math.abs(volumeChange)} %
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-sport-soft px-3 py-2.5">
          <p className="text-[11.5px] font-semibold text-sport-ink">Records</p>
          <p className="text-xl font-semibold">{records.length}</p>
          <p className="truncate text-[11px] text-muted-foreground">{records[0] ?? 'cette semaine'}</p>
        </div>
      </div>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {openSession !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-[20px] bg-sport p-4 text-sport-on">
          <div className="min-w-0">
            <p className="text-[11.5px] font-medium opacity-85">
              Séance en cours ·{' '}
              {openSession.sets.length === 0
                ? 'aucune série notée'
                : `${openSession.sets.length} série${openSession.sets.length > 1 ? 's' : ''}, ${formatTonnage(sessionVolume(openSession.sets))}`}
            </p>
            <p className="truncate text-xl font-semibold tracking-[-0.02em]">
              {openSession.templateName ?? 'Séance libre'}
            </p>
          </div>
          <Link
            href={`/training/session/${openSession.id}`}
            aria-label="Reprendre la séance"
            className="flex size-11 flex-none items-center justify-center rounded-full bg-white text-sport"
          >
            <PlayIcon aria-hidden className="size-[18px] fill-current" />
          </Link>
        </div>
      ) : next !== null ? (
        <div className="flex flex-col gap-3 rounded-[20px] bg-sport p-4 text-sport-on">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium opacity-85">
                Séance du jour · {estimatedMinutes(next)} min
              </p>
              <p className="truncate text-xl font-semibold tracking-[-0.02em]">{next.name}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void begin(next.id)}
              aria-label={`Commencer ${next.name}`}
              className="flex size-11 flex-none items-center justify-center rounded-full bg-white text-sport disabled:opacity-60"
            >
              <PlayIcon aria-hidden className="size-[18px] fill-current" />
            </button>
          </div>
          <ExerciseLines template={next} onShow={setShown} limit={5} />
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[20px] bg-sport p-4 text-sport-on">
          <p className="text-lg font-semibold tracking-[-0.02em]">Un programme composé pour ta salle</p>
          <p className="text-[13px] opacity-85">
            Ce que tu veux travailler, où tu t’entraînes, poids libres ou machines, combien de
            fois par semaine. Quatre réponses, et les séances se composent.
          </p>
          <Link
            href="/training/preferences"
            className="mt-1 flex h-10 items-center justify-center rounded-full bg-white text-[13.5px] font-bold text-sport"
          >
            Composer mon programme
          </Link>
        </div>
      )}

      {cards.length > 0 ? (
        <section aria-label="Programme" className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[13px] font-semibold">Programme</h2>
            <Link href="/training/preferences" className="text-[12.5px] font-bold text-sport-ink">
              Modifier
            </Link>
          </div>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {cards.map((template) => {
              const done = lastDone.get(template.id);
              return (
                <li key={template.id} className="flex-none">
                  <button
                    type="button"
                    onClick={() => setDetail(template)}
                    className="flex w-[150px] flex-col gap-1.5 rounded-2xl border bg-card p-3 text-left"
                  >
                    <StarIcon
                      aria-label={template.favorite ? 'Favori' : undefined}
                      aria-hidden={!template.favorite}
                      className={cn(
                        'size-3.5',
                        template.favorite ? 'fill-cook-ink text-cook-ink' : 'fill-track text-track',
                      )}
                    />
                    <span className="truncate text-sm font-semibold">{template.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {template.exercises.length} exercice{template.exercises.length > 1 ? 's' : ''}
                      {done === undefined ? '' : ` · ${formatRecentDay(done)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section aria-label="Dernières séances" className="rounded-xl border bg-card px-3.5 py-1">
          <h2 className="pt-2.5 pb-1 text-[13px] font-semibold">Dernières séances</h2>
          <ul>
            {history.map((session, index) => {
              const minutes = durationMinutes(session);
              return (
                <li key={session.id} className={cn(index > 0 && 'border-t border-divider')}>
                  <Link href={`/training/session/${session.id}`} className="flex items-center gap-2.5 py-2.5">
                    <span aria-hidden className="size-2 flex-none rounded-full bg-sport" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {session.templateName ?? 'Séance libre'}
                      </span>
                      <span className="block text-xs text-muted-foreground first-letter:uppercase">
                        {formatRecentDay(session.sessionDate)}
                        {minutes === null ? '' : ` · ${minutes} min`}
                      </span>
                    </span>
                    {recordSessionIds.includes(session.id) ? (
                      <span className="rounded-full bg-cook-soft px-2 py-0.5 text-[11.5px] font-bold text-cook-ink">
                        record
                      </span>
                    ) : null}
                    <span className="font-semibold">{formatTonnage(sessionVolume(session.sets))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Sheet open={detail !== null} onOpenChange={(open) => (open ? undefined : setDetail(null))}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] max-w-lg gap-4 overflow-y-auto px-5 pt-5 pb-[calc(2rem+var(--safe-bottom))]"
        >
          {detail === null ? null : (
            <>
              <SheetHeader className="p-0 pr-10">
                <SheetTitle className="text-[19px] tracking-[-0.02em]">{detail.name}</SheetTitle>
                <SheetDescription>
                  {detail.exercises.length} exercice{detail.exercises.length > 1 ? 's' : ''} · environ{' '}
                  {estimatedMinutes(detail)} min
                  {detail.notes === null ? '' : ` · ${detail.notes}`}
                </SheetDescription>
              </SheetHeader>
              <ExerciseLines template={detail} onShow={setShown} />
              <Button
                type="button"
                className="h-12 bg-sport text-sport-on hover:bg-sport/90"
                disabled={busy || openSession !== null}
                onClick={() => void begin(detail.id)}
              >
                <PlayIcon className="fill-current" />
                {openSession === null ? 'Commencer' : 'Une séance est déjà en cours'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  // Retirer des favoris une séance à soi l'efface : elle
                  // n'existait que là. Le geste se confirme.
                  detail.kind === 'custom' && detail.favorite
                    ? setConfirmUnfavorite(detail)
                    : void toggleFavorite(detail)
                }
              >
                <StarIcon className={detail.favorite ? 'fill-current text-cook-ink' : undefined} />
                {detail.favorite ? 'Retirer des favoris' : 'Mettre en favori'}
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmUnfavorite !== null}
        onOpenChange={(open) => (open ? undefined : setConfirmUnfavorite(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer « {confirmUnfavorite?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La séance quitte tes favoris. Celles déjà faites restent dans l’historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmUnfavorite !== null) {
                  void toggleFavorite(confirmUnfavorite);
                }
                setConfirmUnfavorite(null);
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExerciseSheet exercise={shown} onClose={() => setShown(null)} />
    </>
  );
}
