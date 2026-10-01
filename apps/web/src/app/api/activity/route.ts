import { z } from 'zod';
import { apiError } from '@/server/errors';
import { isJournalDate, shiftDate, todayInParis } from '@/lib/date';
import { readSessionToken } from '@/server/auth';
import { findUserByIngestToken } from '@/server/db/queries/users';
import { upsertDailyActivity } from '@/server/db/queries/activity';

export const runtime = 'nodejs';

/**
 * Ingestion de la dépense d'activité (FR-27).
 *
 * Deux appelants, deux jetons, le même en-tête `Authorization: Bearer` :
 *
 * - l'app Android, qui lit Health Connect et porte son jeton de session signé
 *   (`utilisateur.horodatage.signature`) ;
 * - le raccourci iOS, qui n'a pas de session et porte le jeton d'ingestion
 *   propre à l'utilisateur, révocable, sans point (voir `rotateIngestToken`).
 *
 * Les deux formes ne se confondent pas : un jeton à trois segments est lu
 * comme une session, et une session invalide ne retombe pas sur la recherche
 * d'un jeton d'ingestion. Le cookie n'est jamais lu ici : la route accepte un
 * corps sans prévol, et un cookie `lax` suffirait sinon à faire écrire une page
 * tierce dans le compte de quelqu'un.
 *
 * Santé d'Apple n'est accessible à aucune page web : HealthKit est réservé aux
 * applications natives iOS. Le raccourci est le seul pont existant qui ne
 * passe pas par l'App Store.
 */

/**
 * L'app Raccourcis type ses champs JSON à la main, et se trompe volontiers :
 * un champ resté en « Texte » envoie `"512"` et non `512`. Refuser ces envois
 * obligerait à deviner la cause depuis un iPhone, sans trace ni console. On
 * accepte donc une chaîne qui ne porte qu'un nombre, avec la virgule décimale
 * et l'unité que Santé colle parfois derrière.
 *
 * Ce qui reste refusé : une liste d'échantillons collée telle quelle, qui
 * arrive en plusieurs lignes. La sommer ici reviendrait à inventer un total
 * dont personne ne saurait s'il couvre un jour ou six mois.
 */
/** Jours acceptés en une fois, et jusqu'où dans le passé. */
const MAX_BATCH_DAYS = 31;

const KCAL_TEXT = /^(\d+(?:[.,]\d+)?)\s*(?:k?cal(?:ories)?)?$/i;

function readKcal(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const digits = KCAL_TEXT.exec(value.trim())?.[1];
  return digits === undefined ? value : Number(digits.replace(',', '.'));
}

const kcalSchema = z.preprocess(readKcal, z.number().min(0).max(20000));
const daySchema = z.string().refine(isJournalDate, 'Date invalide.');

/** Un seul jour : la forme du raccourci iOS. */
const singleSchema = z.object({
  /** Jour civil concerné. Par défaut le jour courant à Paris. */
  day: daySchema.optional(),
  /** Énergie active du jour, hors métabolisme de base. */
  activeKcal: kcalSchema,
  source: z.enum(['health']).default('health'),
});

/**
 * Plusieurs jours d'un coup : la forme de l'app Android, qui relit à chaque
 * ouverture les jours que Health Connect a gardés. Une journée ratée parce que
 * l'app n'a pas été ouverte est ainsi rattrapée à la suivante, sans tâche de
 * fond ni permission de lecture en arrière-plan.
 */
const batchSchema = z.object({
  days: z
    .array(z.object({ day: daySchema, activeKcal: kcalSchema }))
    .min(1)
    .max(MAX_BATCH_DAYS),
  source: z.enum(['health']).default('health'),
});

/**
 * Le raccourci affiche la réponse telle quelle : c'est le seul endroit où
 * l'erreur peut être expliquée, et donc le seul endroit où elle peut être
 * corrigée.
 */
const KCAL_HINT =
  'Le champ activeKcal doit valoir un seul nombre de kilocalories. Dans le raccourci, intercale « Calculer les statistiques », opération Somme, entre la recherche d’échantillons et l’appel, et envoie cette somme plutôt que les échantillons eux-mêmes.';

/** `Authorization: Bearer <jeton>`, ou l'en-tête abrégé que pose un raccourci. */
function readToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header === null ? null : /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (match?.[1]) {
    return match[1];
  }
  return request.headers.get('x-ingest-token')?.trim() || null;
}

/** Un jeton de session a trois segments ; un jeton d'ingestion n'a pas de point. */
function looksLikeSession(token: string): boolean {
  return token.split('.').length === 3;
}

async function userFor(token: string): Promise<number | null> {
  if (looksLikeSession(token)) {
    return readSessionToken(token);
  }
  const user = await findUserByIngestToken(token);
  return user?.id ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const token = readToken(request);
  if (!token) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  // La forme est choisie sur la présence de `days`, et non par une union : une
  // union rendrait une erreur sans chemin, et l'indice sur activeKcal, le seul
  // que le raccourci sache afficher, serait perdu.
  const batch = typeof payload === 'object' && payload !== null && 'days' in payload;
  const parsed = batch ? batchSchema.safeParse(payload) : singleSchema.safeParse(payload);
  if (!parsed.success) {
    const onKcal = parsed.error.issues.some((issue) => issue.path[0] === 'activeKcal');
    return apiError('invalid_input', onKcal ? KCAL_HINT : undefined);
  }

  let userId: number | null;
  try {
    userId = await userFor(token);
  } catch (error) {
    console.error('[activity] lecture du jeton en echec', error);
    return apiError('internal');
  }

  if (userId === null) {
    return apiError('unauthorized');
  }

  const today = todayInParis();
  const data = parsed.data;
  const days = 'days' in data ? data.days : [{ day: data.day ?? today, activeKcal: data.activeKcal }];

  // Un jour à venir n'a pas encore de dépense, et un jour trop ancien est hors
  // de la fenêtre de calcul : les deux trahissent une horloge ou un fuseau
  // faux, qu'il vaut mieux dire que d'écrire.
  const oldest = shiftDate(today, -MAX_BATCH_DAYS);
  if ('days' in data && days.some(({ day }) => day > today || day < oldest)) {
    return apiError('invalid_input', 'Jour hors de la fenêtre acceptée.');
  }

  for (const { day, activeKcal } of days) {
    await upsertDailyActivity(userId, day, data.source, activeKcal);
  }

  if ('days' in data) {
    return Response.json({ ok: true, days: days.length });
  }
  const [only] = days;
  return Response.json({ ok: true, day: only?.day, activeKcal: only?.activeKcal });
}
