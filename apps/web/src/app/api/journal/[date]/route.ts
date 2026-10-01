import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { journalForDate } from '@/server/services/entries';
import { isJournalDate } from '@/lib/date';

export const runtime = 'nodejs';

/**
 * Le journal d'un jour passé, pour les apps natives : totaux et entrées,
 * comme `app/history/[date]/page.tsx`. En lecture seule : les valeurs sont
 * figées à l'écriture.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ date: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }
  const { date } = await context.params;
  if (!isJournalDate(date)) {
    return apiError('invalid_input');
  }
  return Response.json(await journalForDate(userId, date));
}
