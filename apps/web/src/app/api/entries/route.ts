import { z } from 'zod';
import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { recordEntry } from '@/server/services/entries';
import { MAX_QUANTITY_G } from '@/lib/nutrition';
import { isJournalDate } from '@/lib/date';
import { MEALS } from '@/lib/meal';
import { ENTRY_VIAS, entryMethod } from '@/lib/usage';
import { recordMeal } from '@/server/services/usage';

export const runtime = 'nodejs';

/** Zod à la frontière : le corps est analysé, jamais utilisé tel quel (spine). */
const nutrient = z.number().finite().min(0).max(10000);

const createSchema = z.object({
  foodLabel: z.string().trim().min(1).max(200),
  per100g: z.object({
    kcal: nutrient,
    proteinG: nutrient,
    carbsG: nutrient,
    fatG: nutrient,
  }),
  quantityG: z.number().int().positive().max(MAX_QUANTITY_G - 1),
  sourceKind: z.enum(['ciqual', 'product', 'manual']),
  sourceRef: z.string().trim().min(1).max(64).nullable(),
  entryDate: z.string().refine(isJournalDate).optional(),
  // Facultatif : le service retombe sur l'heure quand le client n'en envoie
  // pas, ce qui est le cas du raccourci iOS.
  meal: z.enum(MEALS).optional(),
  // Facultatif aussi : la façon dont l'aliment a été trouvé, pour la mesure
  // d'usage seulement. Elle ne change rien à l'entrée.
  // `nullish` : l'app Android envoie `null` plutôt que d'omettre le champ.
  via: z.enum(ENTRY_VIAS).nullish(),
});

/** Enregistre une entrée avec ses macros figées (FR-10, FR-25). */
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

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const { via, ...entry } = parsed.data;
  const result = await recordEntry({ ...entry, userId });
  if (result.kind === 'invalid_quantity') {
    return apiError('invalid_input', 'Quantité invalide.');
  }

  await recordMeal(userId, entryMethod(via ?? undefined, entry.sourceKind));
  return Response.json({ entry: result.entry }, { status: 201 });
}
