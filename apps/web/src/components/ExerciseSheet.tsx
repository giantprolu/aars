import { ExternalLinkIcon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { demoSearchUrl, illustrationFor, ILLUSTRATION_RATIO } from '@/lib/exercise-media';
import { EQUIPMENT_LABELS, type Exercise } from '@/lib/workout';

/**
 * Ce à quoi ressemble un exercice.
 *
 * Un programme composé de « pec deck », « face pull » et « hip thrust » est
 * illisible pour qui débute : ce sont des mots de salle, et aucun ne dit le
 * mouvement. Un toucher sur le nom ouvre les deux photos, début et fin, qui
 * lèvent le doute en une seconde.
 *
 * Les deux images alternent plutôt que de s'afficher côte à côte. Un
 * mouvement se reconnaît à son déplacement, pas à deux poses figées : voir la
 * barre monter et descendre dit ce qu'aucune légende ne dirait. Elles sont
 * toutes deux montées et superposées, et seule l'opacité change — échanger la
 * source ferait clignoter la fiche le temps du premier chargement.
 *
 * Qui a demandé moins d'animation les obtient côte à côte, et l'alternance
 * s'arrête.
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis des
 * écrans qui la portent déjà, comme les autres feuilles du projet.
 */

/** Ce dont la fiche a besoin : moins qu'un exercice complet. */
export type SheetExercise = Pick<Exercise, 'slug' | 'name' | 'muscleGroup' | 'equipment'>;

/** Durée d'affichage de chaque pose. Assez lent pour lire, assez vif pour lier. */
const FRAME_MS = 1100;

export function ExerciseSheet({
  exercise,
  onClose,
}: {
  /** L'exercice à montrer, ou `null` quand la feuille est fermée. */
  exercise: SheetExercise | null;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setStill(query.matches);
    const onChange = (event: MediaQueryListEvent) => setStill(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (exercise === null || still) {
      return;
    }
    // Repartir du début à chaque ouverture : la première pose est la position
    // de départ, et prendre le mouvement par la fin se lit à l'envers.
    setFrame(0);
    const timer = window.setInterval(() => setFrame((current) => 1 - current), FRAME_MS);
    return () => window.clearInterval(timer);
  }, [exercise, still]);

  const frames = exercise === null ? null : illustrationFor(exercise.slug);

  return (
    <Sheet open={exercise !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-lg gap-0 overflow-y-auto rounded-t-[20px] px-5 pt-2.5 pb-[calc(1.75rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-11 rounded-full bg-border" />
        {exercise === null ? (
          <SheetTitle className="sr-only">Détail de l’exercice</SheetTitle>
        ) : (
          <>
            <SheetHeader className="p-0 pr-10">
              <SheetTitle className="text-[17px]">{exercise.name}</SheetTitle>
              <SheetDescription>
                {exercise.muscleGroup === null
                  ? 'Cardio, sans groupe musculaire dominant'
                  : `Travaille surtout : ${exercise.muscleGroup.toLowerCase()}`}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-2.5">
              <Badge variant="outline">{EQUIPMENT_LABELS[exercise.equipment]}</Badge>
            </div>

            {frames === null ? (
              <p className="mt-4 text-muted-foreground">
                Pas d’illustration pour cet exercice : il a été créé depuis une séance saisie à la
                main, et son nom est tout ce qu’on en connaît.
              </p>
            ) : still ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {frames.map((source, index) => (
                  <div
                    key={source}
                    className="relative overflow-hidden rounded-lg border"
                    style={{ aspectRatio: ILLUSTRATION_RATIO }}
                  >
                    <Image
                      src={source}
                      alt={
                        index === 0
                          ? `${exercise.name} : position de départ`
                          : `${exercise.name} : position d’arrivée`
                      }
                      fill
                      sizes="(max-width: 32rem) 50vw, 16rem"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="relative mt-4 overflow-hidden rounded-xl border"
                style={{ aspectRatio: ILLUSTRATION_RATIO }}
              >
                {frames.map((source, index) => (
                  <Image
                    key={source}
                    src={source}
                    alt={index === 0 ? `${exercise.name}, le mouvement` : ''}
                    aria-hidden={index === 1}
                    fill
                    priority={index === 0}
                    sizes="(max-width: 32rem) 100vw, 32rem"
                    className="object-cover transition-opacity duration-300"
                    style={{ opacity: frame === index ? 1 : 0 }}
                  />
                ))}
              </div>
            )}

            {/*
              Un lien sortant, pas une vidéo intégrée : deux photos répondent
              déjà à « c'est quoi, cet exercice ». Celui qui veut la technique
              complète la trouvera mieux là-bas que dans une fenêtre de 400 px.
            */}
            <Button asChild variant="outline" className="mt-4 w-full">
              <a href={demoSearchUrl(exercise.name)} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                Chercher une démonstration
              </a>
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
