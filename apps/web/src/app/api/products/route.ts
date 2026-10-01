import { z } from 'zod';
import { apiError } from '@/server/errors';
import { hasSession } from '@/server/guard';
import { upsertProduct } from '@/server/db/queries/products';

export const runtime = 'nodejs';

const nutrient = z.number().finite().min(0).max(10000);

const upsertSchema = z.object({
  barcode: z.string().regex(/^\d{8}$|^\d{12}$|^\d{13}$/),
  name: z.string().trim().min(1).max(200),
  per100g: z.object({
    kcal: nutrient,
    proteinG: nutrient,
    carbsG: nutrient,
    fatG: nutrient,
  }),
  servingSizeG: z.number().finite().positive().max(5000).nullable(),
  source: z.enum(['off', 'manual']),
});

/** Met un produit en cache (FR-14). Le navigateur y pousse ce qu'il a résolu. */
export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) {
    return apiError('unauthorized');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_input');
  }

  const parsed = upsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_input');
  }

  const product = await upsertProduct(parsed.data);
  return Response.json({ product });
}
