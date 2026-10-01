import { useSearchParams } from 'next/navigation';
import { hourInParis } from '../date';
import { type Meal, isMeal, mealForHour } from '../meal';

/**
 * Le repas avec lequel un parcours d'ajout s'ouvre.
 *
 * La feuille du bouton + fait choisir le repas avant le mode d'ajout, et le
 * transmet dans l'adresse (`?meal=lunch`). Sans paramètre, ou avec une valeur
 * qu'on ne connaît pas, l'heure décide, comme avant.
 */
export function useInitialMeal(): Meal {
  const requested = useSearchParams().get('meal');
  return isMeal(requested) ? requested : mealForHour(hourInParis());
}
