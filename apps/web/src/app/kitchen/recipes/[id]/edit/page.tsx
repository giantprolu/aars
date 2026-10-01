import { notFound } from 'next/navigation';
import { requireUserId } from '@/server/guard';
import { recipeFor } from '@/server/services/recipes';
import { RecipeEditor } from '../../RecipeEditor';

export const dynamic = 'force-dynamic';

/**
 * Modification d'une recette existante.
 *
 * La recette d'un autre compte est introuvable, et non interdite : le service
 * filtre sur l'utilisateur, si bien que `recipeFor` rend `null` dans les deux
 * cas. Répondre différemment dirait à qui essaie qu'il a visé juste.
 */
export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    notFound();
  }

  const recipe = await recipeFor(userId, id);
  if (recipe === null) {
    notFound();
  }

  return <RecipeEditor recipe={recipe} />;
}
