'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Les graphiques, chargés à part.
 *
 * Recharts pèse à lui seul plus que tout le reste de l'application réuni : la
 * progression demandait 315 ko de script quand les autres écrans en demandent
 * cent. Sur un téléphone en réseau mobile, c'est une seconde avant que quoi
 * que ce soit s'affiche — et l'écran porte aussi des chiffres, qui n'ont
 * besoin d'aucun graphique pour être lus.
 *
 * Le rendu serveur est écarté volontairement. Ces tracés mesurent le conteneur
 * avant de se dessiner, donc ne produisent rien d'utile hors du navigateur :
 * les rendre au serveur coûterait le temps sans rien montrer de plus.
 *
 * Chaque emplacement garde sa hauteur pendant le chargement, celle du
 * graphique qui va le remplir. Sans elle, l'arrivée du script ferait sauter
 * tout ce qui se trouve dessous.
 */

function placeholder(height: string) {
  const Placeholder = () => <Skeleton className={`w-full rounded-lg ${height}`} />;
  return Placeholder;
}

export const WeeklyVolumeChart = dynamic(
  () => import('./ProgressCharts').then((module) => module.WeeklyVolumeChart),
  { ssr: false, loading: placeholder('h-[150px]') },
);

export const ExerciseTrendChart = dynamic(
  () => import('./ProgressCharts').then((module) => module.ExerciseTrendChart),
  { ssr: false, loading: placeholder('h-[180px]') },
);

export const SessionVolumeChart = dynamic(
  () => import('./ProgressCharts').then((module) => module.SessionVolumeChart),
  { ssr: false, loading: placeholder('h-[130px]') },
);

export const WeeklyWeightChart = dynamic(
  () => import('./ProgressCharts').then((module) => module.WeeklyWeightChart),
  { ssr: false, loading: placeholder('h-[150px]') },
);
