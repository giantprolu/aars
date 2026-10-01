import { z } from 'zod';
import { apiError } from '@/server/errors';
import { isJournalDate, todayInParis } from '@/lib/date';
import { findUserByIngestToken } from '@/server/db/queries/users';
import { upsertDailyActivity } from '@/server/db/queries/activity';

export const runtime = 'nodejs';

/**
 * Ingestion de la dépense d'activité (FR-27).
 *
 * Appelée par un raccourci iOS, qui n'a pas de cookie de session : elle
 * s'authentifie par un jeton porté dans l'en-tête, propre à l'utilisateur et
 * révocable. C'est la seule route de l'application dans ce cas, et elle
 * n'écrit qu'un nombre de kilocalories par jour.
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
const KCAL_TEXT = /^(\d+(?:[.,]\d+)?)\s*(?:k?cal(?:ories)?)?$/i;

function readKcal(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const digits = KCAL_TEXT.exec(value.trim())?.[1];
  return digits === undefined ? value : Number(digits.replace(',', '.'));
}

const bodySchema = z.object({
  /** Jour civil concerné. Par défaut le jour courant à Paris. */
  day: z.string().refine(isJournalDate, 'Date invalide.').optional(),
  /** Énergie active du jour, hors métabolisme de base. */
  activeKcal: z.preprocess(readKcal, z.number().min(0).max(20000)),
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
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim() || null;
  }
  return request.headers.get('x-ingest-token')?.trim() || null;
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

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    const onKcal = parsed.error.issues.some((issue) => issue.path[0] === 'activeKcal');
    return apiError('invalid_input', onKcal ? KCAL_HINT : undefined);
  }

  let user: Awaited<ReturnType<typeof findUserByIngestToken>>;
  try {
    user = await findUserByIngestToken(token);
  } catch (error) {
    console.error('[activity] lecture du jeton en echec', error);
    return apiError('internal');
  }

  if (!user) {
    return apiError('unauthorized');
  }

  const day = parsed.data.day ?? todayInParis();
  await upsertDailyActivity(user.id, day, parsed.data.source, parsed.data.activeKcal);

  return Response.json({ ok: true, day, activeKcal: parsed.data.activeKcal });
}
