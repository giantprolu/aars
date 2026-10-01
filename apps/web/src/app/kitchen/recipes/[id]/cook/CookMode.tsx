'use client';

import { ChevronLeftIcon, ChevronRightIcon, TimerIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader } from '@/components/ScreenHeader';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { journalMeal, planMeal } from '@/lib/client/plan';
import {
  formatIngredientQuantity,
  formatServings,
  ingredientsForServings,
  stepDurationSeconds,
  type Recipe,
} from '@/lib/recipe';
import { MEAL_LABELS, mealForHour, type Meal } from '@/lib/meal';
import { hourInParis, todayInParis } from '@/lib/date';

/**
 * Mode cuisine : une étape à la fois, en grand.
 *
 * Les mains sont occupées et le téléphone est posé sur un plan de travail à
 * cinquante centimètres. D'où le corps de texte plus gros qu'ailleurs dans
 * l'application, et une seule chose à lire par écran : une liste de six étapes
 * en corps courant oblige à retrouver sa ligne après chaque geste.
 *
 * Le minuteur ne se déclenche jamais seul. Une étape annonce « 8 minutes »,
 * mais on met le riz à cuire quand on est prêt, pas quand l'écran s'affiche.
 *
 * L'alarme de fin est visuelle et vibrante, jamais une fenêtre du navigateur :
 * un `alert()` bloquerait la page tant qu'on ne l'a pas fermée, les mains dans
 * la farine.
 */

/** Affiche un compte à rebours : « 7:42 ». */
function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CookMode({
  recipe,
  batchServings,
  /** Le plat prévu aujourd'hui pour cette recette, s'il y en a un de non mangé. */
  plannedId,
  plannedServings,
}: {
  recipe: Recipe;
  /** Parts que l'on cuisine : celles du panier, à défaut celles de la recette. */
  batchServings: number;
  plannedId: number | null;
  plannedServings: number | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ringing, setRinging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Les quantités sont celles de la fournée, jamais celles du plan : on pèse
  // le riz une fois pour toute la casserole, et la part qu'on mangera ce soir
  // ne change pas ce qu'il faut y mettre. Même mise à l'échelle que la liste
  // de courses, donc les mêmes grammes que ceux du sac.
  const ingredients = ingredientsForServings(
    recipe.ingredients,
    recipe.servings,
    batchServings,
  );

  const steps = recipe.steps;
  const step = steps[index] ?? '';
  const duration = stepDurationSeconds(step);
  const last = index >= steps.length - 1;

  // Le minuteur est arrêté à chaque changement d'étape : le laisser courir
  // ferait sonner l'étape précédente pendant qu'on lit la suivante.
  useEffect(() => {
    setRemaining(null);
    setRinging(false);
  }, [index]);

  useEffect(() => {
    if (remaining === null) {
      return;
    }
    if (remaining <= 0) {
      setRinging(true);
      // La vibration n'existe pas sur iOS ; l'absence est silencieuse et le
      // repère visuel suffit seul.
      navigator.vibrate?.([200, 100, 200]);
      setRemaining(null);
      return;
    }

    timerRef.current = setInterval(() => {
      setRemaining((value) => (value === null ? null : value - 1));
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, [remaining]);

  /**
   * Inscrit le plat au journal.
   *
   * Si la recette était au plan du jour, c'est cette ligne qu'on marque
   * mangée. Sinon on en crée une pour aujourd'hui, au repas que l'heure
   * suggère, puis on la journalise : cuisiner un plat qui n'était pas prévu
   * reste un repas, et il ne faut pas deux écrans pour le dire.
   */
  async function journal() {
    setBusy(true);
    setError(null);

    let target = plannedId;
    if (target === null) {
      // Le fuseau du journal, pas celui du navigateur : une recette cuisinee a
      // 23 h 30 en France doit tomber dans la journee qui s acheve (AD-11).
      const meal: Meal = mealForHour(hourInParis());
      const created = await planMeal({
        planDate: todayInParis(),
        meal,
        recipeId: recipe.id,
        servings: 1,
      });
      if (created.kind !== 'planned') {
        setBusy(false);
        setError('Le plat n’a pas pu être ajouté au journal.');
        return;
      }
      target = created.id;
    }

    const outcome = await journalMeal(target);
    setBusy(false);

    if (outcome.kind === 'journaled') {
      setNotice(
        outcome.skipped.length === 0
          ? `${outcome.created} ligne${outcome.created > 1 ? 's' : ''} ajoutée${outcome.created > 1 ? 's' : ''} au journal.`
          : `${outcome.created} lignes ajoutées. Sans fiche, donc non comptés : ${outcome.skipped.join(', ')}.`,
      );
      router.refresh();
      return;
    }
    setError(outcome.kind === 'refused' ? outcome.message : 'Enregistrement impossible.');
  }

  if (steps.length === 0) {
    return (
      <>
        <NavHeader label={recipe.name} href={`/kitchen/recipes/${recipe.id}`} />
        <p className="py-10 text-center text-muted-foreground">
          Cette recette n’a pas d’étapes. Ajoute-les pour la cuisiner pas à pas.
        </p>
        <Button asChild className="w-full">
          <Link href={`/kitchen/recipes/${recipe.id}/edit`}>Écrire les étapes</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <NavHeader label={recipe.name} href={`/kitchen/recipes/${recipe.id}`} mode="close" />

      <div className="flex items-center justify-between gap-3">
        <p className="tabular text-muted-foreground">
          Étape {index + 1} sur {steps.length}
        </p>
        {/*
          Le badge dit ce qui ira au journal, et le dit en toutes lettres : un
          « 2 parts » seul, à côté d'ingrédients pesés pour six, se lisait comme
          une contradiction.
        */}
        {plannedServings === null ? null : (
          <Badge variant="outline" className="tabular">
            {formatServings(plannedServings)} au journal
          </Badge>
        )}
      </div>

      {/* Piste de progression : un segment par étape, rempli jusqu'à la courante. */}
      <div aria-hidden className="mt-2.5 flex gap-1">
        {steps.map((_, position) => (
          <span
            key={position}
            className={cn('h-1.5 flex-1 rounded-full', position <= index ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </div>

      <p className="mt-6 text-[24px] leading-[1.35] font-semibold tracking-tight">{step}</p>

      {duration !== null ? (
        <Card className="mt-6">
          <CardContent>
            {ringing ? (
              <p role="status" className="text-center text-[28px] font-semibold tracking-tight">
                C’est prêt.
              </p>
            ) : remaining !== null ? (
              <>
                <p className="tabular text-center text-[40px] font-semibold tracking-tight">
                  {formatCountdown(remaining)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRemaining(null)}
                  className="mt-3 w-full"
                >
                  Arrêter le minuteur
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemaining(duration)}
                className="w-full"
              >
                <TimerIcon />
                Lancer un minuteur de{' '}
                {duration >= 60 ? `${Math.round(duration / 60)} min` : `${duration} s`}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      {notice !== null ? (
        <p role="status" className="mt-4 text-center text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {/*
        Les ingrédients restent accessibles sans quitter l'étape : on vérifie
        une quantité au milieu d'une recette, et revenir à la fiche ferait
        perdre le fil.
      */}
      <Accordion type="single" collapsible className="mt-6">
        <AccordionItem value="ingredients">
          <AccordionTrigger>
            Les ingrédients, pour {formatServings(batchServings)}
          </AccordionTrigger>
          <AccordionContent>
            <ul>
              {ingredients.map((ingredient) => (
                <li key={ingredient.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-[15px]">{ingredient.label}</span>
                  <span className="tabular text-muted-foreground">
                    {formatIngredientQuantity(ingredient)}
                  </span>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <BottomBar className="flex gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
          className="flex-1"
        >
          <ChevronLeftIcon />
          Précédente
        </Button>
        {!last ? (
          <Button
            type="button"
            onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}
            className="flex-1"
          >
            Suivante
            <ChevronRightIcon />
          </Button>
        ) : notice === null ? (
          <Button
            type="button"
            onClick={() => void journal()}
            disabled={busy}
            className="flex-[1.4]"
          >
            {busy
              ? 'Enregistrement…'
              : plannedId === null
                ? `C’est mangé — ${MEAL_LABELS[mealForHour(hourInParis())].toLowerCase()}`
                : 'C’est mangé'}
          </Button>
        ) : (
          <Button asChild className="flex-1">
            <Link href="/">Voir le journal</Link>
          </Button>
        )}
      </BottomBar>
    </>
  );
}
