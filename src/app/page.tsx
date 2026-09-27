import { CalendarIcon, DumbbellIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { AddFab } from '@/components/AddFab';
import { DayDial } from '@/components/DayDial';
import { MealJournal } from '@/components/MealJournal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/button';
import { journalForToday } from '@/server/services/entries';
import { requireUserId } from '@/server/guard';
import { targetFor } from '@/server/services/profile';
import { formatJournalDate, todayInParis } from '@/lib/date';
import { formatKcal } from '@/lib/nutrition';

// Le journal vient du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/**
 * Journal du jour (FR-4). Composant serveur : seuls le bouton d'ajout et la
 * liste, qui gère la suppression, sont des composants client (AD-10).
 *
 * La ligne sous le titre porte la date en toutes lettres et non
 * « Aujourd'hui » : cet écran ne montre jamais autre chose que le jour même,
 * et le dire deux fois serait du remplissage. La date, elle, situe.
 */
export default async function JournalPage() {
  const today = todayInParis();
  const userId = await requireUserId();
  const [{ totals, entries }, target] = await Promise.all([
    journalForToday(userId),
    targetFor(userId),
  ]);

  return (
    <div className="pb-16">
      {/*
        L'historique se rejoint d'ici depuis que la barre basse porte la
        Cuisine et le Sport. On le consulte de temps en temps, et toujours
        depuis le journal du jour.
      */}
      <ScreenHeader
        title="Journal"
        kicker={formatJournalDate(today)}
        action={
          <Button asChild variant="outline" size="icon">
            <Link href="/history" aria-label="Voir les journaux passés">
              <CalendarIcon className="size-[19px]" />
            </Link>
          </Button>
        }
      />

      <DayDial
        macros={totals.macros}
        target={
          target === null
            ? null
            : {
                targetKcal: target.targetKcal,
                proteinG: target.proteinG,
                carbsG: target.carbsG,
                fatG: target.fatG,
              }
        }
      />

      {/*
        La cible bouge avec l'entraînement : le dire, sinon un chiffre qui
        change d'un jour à l'autre sans raison se lit comme un bug. La moyenne
        de la semaine est rappelée, parce que c'est elle qui ne change pas.
      */}
      {target !== null && target.trainingDay !== null && target.cycleKcal !== 0 ? (
        <p className="tabular mt-3 flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
          <DumbbellIcon aria-hidden className="size-3.5" />
          {target.trainingDay
            ? `Jour d’entraînement : +${formatKcal(target.cycleKcal)} kcal`
            : `Jour de repos : −${formatKcal(-target.cycleKcal)} kcal`}
          {` · ${formatKcal(target.targetKcal - target.cycleKcal)} kcal en moyenne`}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="py-10 text-center">
          <p className="mx-auto max-w-[26ch] text-lg font-semibold tracking-tight">
            Le premier geste de la journée tient en trois touches.
          </p>
          <p className="mx-auto mt-2 max-w-[32ch] text-muted-foreground">
            Scanne un code-barres, cherche un nom, ou photographie l&apos;assiette.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/add">
              <PlusIcon />
              Ajouter un aliment
            </Link>
          </Button>
        </div>
      ) : (
        <MealJournal entries={entries} deletable favoritable />
      )}

      {target === null ? (
        <p className="mt-5 text-center text-muted-foreground">
          Pas de cible calorique définie.{' '}
          <Link href="/profile" className="text-foreground underline underline-offset-4">
            La calculer en une minute
          </Link>
        </p>
      ) : null}

      <AddFab />
    </div>
  );
}
