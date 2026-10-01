import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { generateList, listForWeek } from '@/server/services/shopping';
import { isJournalDate, startOfWeek, todayInParis } from '@/lib/date';

export const runtime = 'nodejs';

/**
 * La liste de courses d'une semaine, celle en cours à défaut de `from`.
 *
 * Bornée à une semaine comme l'écran : une liste porte les quantités du panier
 * d'une semaine précise, et « la plus récente » n'en désigne aucune.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  // Le paramètre vient d'une URL, que n'importe qui édite : une date hors
  // format retombe sur la semaine courante plutôt que de faire échouer l'appel.
  const from = new URL(request.url).searchParams.get('from');
  const weekStart = startOfWeek(from !== null && isJournalDate(from) ? from : todayInParis());

  return Response.json({ list: await listForWeek(userId, weekStart) });
}

const generateSchema = z.object({
  /** Lundi de la semaine à couvrir. La liste court sur les sept jours suivants. */
  from: z.string().refine(isJournalDate, 'Date invalide.'),
});

/**
 * Engendre une liste depuis le panier de la semaine.
 *
 * Depuis le panier et non depuis le plan : on achète ce qu'on a choisi de
 * manger dans la semaine, et le jour de chaque plat se décide le soir même.
 *
 * Toujours une nouvelle liste, jamais une mise à jour de la précédente : une
 * liste de courses est un instantané du panier, et rien n'est plus déroutant
 * qu'une liste qui se réécrit pendant qu'on fait les courses. La précédente,
 * si elle était encore ouverte, est remplacée et non doublée.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = generateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const list = await generateList(userId, parsed.data.from);
  if (list === null) {
    return apiError('invalid_input', 'Aucun plat prévu sur cette période.');
  }
  return Response.json({ list }, { status: 201 });
}
