/**
 * Composition d'un programme. Fonctions pures (AD-8).
 *
 * Trois réponses décident de tout : ce qu'on veut travailler, où l'on
 * s'entraîne, et si l'on préfère la barre ou la machine. Le reste est une
 * mécanique d'attribution : des créneaux par groupe musculaire, et un
 * catalogue dans lequel on choisit.
 *
 * L'orientation ne supprime jamais l'autre moitié du corps, elle la réduit.
 * « Haut du corps » place un exercice de jambes dans chaque séance, et non
 * zéro : un programme qui ne fait plus travailler les jambes du tout n'est pas
 * une préférence, c'est une blessure à retardement. C'est exactement ce que
 * demandait la formulation « haut en particulier, minimum de bas ».
 */

import {
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  type EquipmentPreference,
  type Exercise,
  type TrainingFocus,
} from './workout';
import { MUSCLE_GROUPS } from './workout-seed';

/**
 * Un créneau d'une séance : un groupe musculaire et ce qu'on y prescrit.
 *
 * `group` vaut `null` pour le cardio, qui n'a pas de groupe musculaire au
 * catalogue. C'est la même distinction qu'en base, où `muscle_group` est
 * nullable pour cette raison précise.
 */
export interface ProgramSlot {
  group: string | null;
  count: number;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  seconds: number | null;
}

export interface SessionBlueprint {
  /** Ce que la séance travaille, sans la lettre : « Poussée », « Tirage ». */
  label: string;
  notes: string;
  slots: readonly ProgramSlot[];
}

/** Un exercice prescrit, prêt à être écrit en base. */
export interface ProgramExercise {
  exercise: Exercise;
  targetSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
  supersetGroup: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface GeneratedTemplate {
  name: string;
  notes: string;
  exercises: ProgramExercise[];
}

export interface ProgramReport {
  templates: GeneratedTemplate[];
  /** Groupes qu'aucun exercice disponible ne couvrait, à dire à l'utilisateur. */
  missingGroups: string[];
}

const G = MUSCLE_GROUPS;

/** Un mouvement de base : lourd, peu de répétitions, en tête de séance. */
function compound(group: string, count = 1): ProgramSlot {
  return { group, count, sets: 4, repsMin: 8, repsMax: 10, seconds: null };
}

/** Un mouvement secondaire, à mi-séance. */
function secondary(group: string, count = 1): ProgramSlot {
  return { group, count, sets: 3, repsMin: 10, repsMax: 12, seconds: null };
}

/** Un mouvement d'isolation, en fin de séance. */
function isolation(group: string, count = 1): ProgramSlot {
  return { group, count, sets: 3, repsMin: 12, repsMax: 15, seconds: null };
}

/** Le gainage et les abdominaux, qui ferment la séance. */
function core(): ProgramSlot {
  return { group: G.abs, count: 1, sets: 3, repsMin: 12, repsMax: 15, seconds: null };
}

/** Vingt minutes de cardio, sans notion de série. */
function cardio(): ProgramSlot {
  return { group: null, count: 1, sets: 1, repsMin: null, repsMax: null, seconds: 1200 };
}

/**
 * Les archétypes de séance, par orientation.
 *
 * Chaque liste est un cycle : deux séances quand on s'entraîne deux fois par
 * semaine, trois au-delà. En deçà de trois séances, découper en poussée et
 * tirage laisserait des groupes entiers sans passage, d'où deux archétypes
 * plus larges plutôt qu'une troncature du cycle de trois.
 */
const BLUEPRINTS: Record<TrainingFocus, { pair: SessionBlueprint[]; cycle: SessionBlueprint[] }> = {
  upper: {
    pair: [
      {
        label: 'Haut, poussée',
        notes: 'Pectoraux, épaules, triceps, et des jambes pour ne pas les perdre.',
        slots: [compound(G.chest), secondary(G.chest), secondary(G.shoulders), isolation(G.triceps), secondary(G.quads), core()],
      },
      {
        label: 'Haut, tirage',
        notes: 'Dos, biceps, épaules arrière, et une chaîne postérieure minimale.',
        slots: [compound(G.back), secondary(G.back), isolation(G.shoulders), isolation(G.biceps), secondary(G.hamstrings), core()],
      },
    ],
    cycle: [
      {
        label: 'Poussée',
        notes: 'Pectoraux, épaules, triceps.',
        slots: [compound(G.chest), secondary(G.chest), secondary(G.shoulders), isolation(G.triceps), secondary(G.quads), core()],
      },
      {
        label: 'Tirage',
        notes: 'Dos, biceps, et une chaîne postérieure minimale.',
        slots: [compound(G.back), secondary(G.back), isolation(G.shoulders), isolation(G.biceps), secondary(G.hamstrings), core()],
      },
      {
        label: 'Haut du corps',
        notes: 'Tout le haut en une séance, puis du cardio.',
        slots: [
          compound(G.chest),
          compound(G.back),
          secondary(G.shoulders),
          isolation(G.biceps),
          isolation(G.triceps),
          secondary(G.glutes),
          cardio(),
        ],
      },
    ],
  },
  lower: {
    pair: [
      {
        label: 'Bas, quadriceps',
        notes: 'Quadriceps et mollets, avec une poussée du haut pour ne pas le perdre.',
        slots: [compound(G.quads), secondary(G.quads), isolation(G.quads), isolation(G.calves), secondary(G.chest), core()],
      },
      {
        label: 'Bas, chaîne postérieure',
        notes: 'Ischio-jambiers et fessiers, avec un tirage du haut.',
        slots: [compound(G.hamstrings), secondary(G.hamstrings), secondary(G.glutes), isolation(G.calves), secondary(G.back), core()],
      },
    ],
    cycle: [
      {
        label: 'Quadriceps',
        notes: 'Squat ou presse en tête, puis isolation.',
        slots: [compound(G.quads), secondary(G.quads), isolation(G.quads), isolation(G.calves), secondary(G.chest), core()],
      },
      {
        label: 'Chaîne postérieure',
        notes: 'Ischio-jambiers et fessiers.',
        slots: [compound(G.hamstrings), secondary(G.hamstrings), secondary(G.glutes), isolation(G.glutes), secondary(G.back), core()],
      },
      {
        label: 'Bas du corps complet',
        notes: 'Une reprise de tout le bas, puis du cardio.',
        slots: [
          compound(G.quads),
          secondary(G.hamstrings),
          secondary(G.glutes),
          isolation(G.calves),
          secondary(G.shoulders),
          cardio(),
        ],
      },
    ],
  },
  full: {
    pair: [
      {
        label: 'Haut du corps',
        notes: 'Pectoraux, dos, épaules et bras.',
        slots: [compound(G.chest), compound(G.back), secondary(G.shoulders), isolation(G.biceps), isolation(G.triceps), core()],
      },
      {
        label: 'Bas du corps',
        notes: 'Quadriceps, chaîne postérieure et mollets.',
        slots: [compound(G.quads), secondary(G.hamstrings), secondary(G.glutes), isolation(G.calves), isolation(G.quads), core()],
      },
    ],
    cycle: [
      {
        label: 'Poussée',
        notes: 'Pectoraux, épaules, triceps.',
        slots: [compound(G.chest), secondary(G.chest), secondary(G.shoulders), isolation(G.shoulders), isolation(G.triceps), core()],
      },
      {
        label: 'Tirage',
        notes: 'Dos et biceps.',
        slots: [compound(G.back), secondary(G.back), secondary(G.back), isolation(G.shoulders), isolation(G.biceps), core()],
      },
      {
        label: 'Jambes',
        notes: 'Quadriceps, chaîne postérieure, mollets, puis du cardio.',
        slots: [
          compound(G.quads),
          secondary(G.quads),
          secondary(G.hamstrings),
          secondary(G.glutes),
          isolation(G.calves),
          cardio(),
        ],
      },
    ],
  },
};

/** La lettre d'une séance : A, B, C… puis au-delà de Z, ce qui n'arrivera pas. */
function sessionLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function blueprintsFor(focus: TrainingFocus, sessionsPerWeek: number): SessionBlueprint[] {
  const { pair, cycle } = BLUEPRINTS[focus];
  const count = Math.min(
    Math.max(Math.trunc(sessionsPerWeek), MIN_SESSIONS_PER_WEEK),
    MAX_SESSIONS_PER_WEEK,
  );
  const source = count <= 2 ? pair : cycle;
  return Array.from({ length: count }, (_, index) => source[index % source.length]!);
}

/**
 * Le coût d'un exercice au regard de la préférence de matériel.
 *
 * Une préférence n'est pas une exclusion. Celui qui préfère les machines n'a
 * pas dit qu'il refusait les tractions, et le seul exercice de dos d'un petit
 * club peut être une barre. Un coût plutôt qu'un filtre : le poids libre passe
 * derrière la machine, pas à la trappe.
 */
function equipmentCost(equipment: Exercise['equipment'], preference: EquipmentPreference): number {
  if (preference === 'any' || equipment === 'cardio') {
    return 0;
  }
  if (preference === 'free') {
    switch (equipment) {
      case 'free':
        return 0;
      case 'bodyweight':
        return 1;
      case 'cable':
        return 2;
      default:
        return 3;
    }
  }
  switch (equipment) {
    case 'machine':
      return 0;
    case 'cable':
      return 1;
    case 'bodyweight':
      return 2;
    default:
      return 3;
  }
}

/**
 * Le prix de reprendre un exercice déjà prescrit ailleurs dans le programme.
 *
 * Il est délibérément lourd : mieux vaut le troisième choix d'un groupe dans
 * la séance C que le premier pour la troisième fois. Un programme où les trois
 * séances commencent par le même mouvement se lit comme une seule séance
 * répétée, et l'intérêt de la rotation disparaît.
 */
const REUSE_COST = 10;

interface Pick {
  exercise: Exercise;
  /** Le suivant dans l'ordre de choix, proposé en substitution. */
  alternative: Exercise | null;
}

function pickFor(
  group: string | null,
  catalog: readonly Exercise[],
  preference: EquipmentPreference,
  usedInProgram: ReadonlyMap<number, number>,
  usedInSession: ReadonlySet<number>,
): Pick | null {
  const candidates = catalog
    .filter((exercise) => exercise.rank !== null)
    .filter((exercise) => exercise.muscleGroup === group)
    .filter((exercise) => !usedInSession.has(exercise.id));

  if (candidates.length === 0) {
    return null;
  }

  // Le tri retombe sur le slug pour rester total : deux exercices de même
  // rang et même matériel doivent sortir dans le même ordre à chaque appel,
  // sans quoi deux générations d'affilée donneraient deux programmes.
  const sorted = [...candidates].sort((a, b) => {
    const costA =
      (a.rank ?? 0) + equipmentCost(a.equipment, preference) + REUSE_COST * (usedInProgram.get(a.id) ?? 0);
    const costB =
      (b.rank ?? 0) + equipmentCost(b.equipment, preference) + REUSE_COST * (usedInProgram.get(b.id) ?? 0);
    return costA === costB ? a.slug.localeCompare(b.slug) : costA - costB;
  });

  return { exercise: sorted[0]!, alternative: sorted[1] ?? null };
}

/**
 * Compose le programme.
 *
 * `catalog` est déjà restreint à ce que la salle propose : le filtre par
 * salle est une lecture de base, celui-ci une décision de programmation, et
 * les mélanger rendrait la seconde intestable.
 */
export function buildProgram(options: {
  focus: TrainingFocus;
  equipment: EquipmentPreference;
  sessionsPerWeek: number;
  catalog: readonly Exercise[];
}): ProgramReport {
  const blueprints = blueprintsFor(options.focus, options.sessionsPerWeek);
  const usedInProgram = new Map<number, number>();
  const missing = new Set<string>();
  const templates: GeneratedTemplate[] = [];

  for (const [index, blueprint] of blueprints.entries()) {
    const usedInSession = new Set<number>();
    const exercises: ProgramExercise[] = [];

    for (const slot of blueprint.slots) {
      for (let taken = 0; taken < slot.count; taken += 1) {
        const pick = pickFor(
          slot.group,
          options.catalog,
          options.equipment,
          usedInProgram,
          usedInSession,
        );
        if (pick === null) {
          missing.add(slot.group ?? 'Cardio');
          continue;
        }

        usedInSession.add(pick.exercise.id);
        usedInProgram.set(pick.exercise.id, (usedInProgram.get(pick.exercise.id) ?? 0) + 1);

        // Un exercice à durée ne se prescrit pas en répétitions, et
        // réciproquement : c'est la nature de l'exercice qui tranche, pas le
        // créneau, sinon une planche demanderait douze répétitions.
        const timed = pick.exercise.kind === 'hold' || pick.exercise.kind === 'cardio';
        exercises.push({
          exercise: pick.exercise,
          targetSets: timed && pick.exercise.kind === 'cardio' ? 1 : slot.sets,
          targetRepsMin: timed ? null : slot.repsMin,
          targetRepsMax: timed ? null : slot.repsMax,
          targetSeconds: timed ? (slot.seconds ?? 45) : null,
          supersetGroup: null,
          restSeconds: null,
          notes:
            pick.alternative === null ? null : `Ou ${pick.alternative.name.toLowerCase()}.`,
        });
      }
    }

    if (exercises.length === 0) {
      continue;
    }

    templates.push({
      name: `Séance ${sessionLetter(index)} — ${blueprint.label}`,
      notes: blueprint.notes,
      exercises,
    });
  }

  return { templates, missingGroups: [...missing] };
}
