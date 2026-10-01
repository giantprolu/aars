import { requireUserId } from '@/server/guard';
import { RecipeEditor } from '../RecipeEditor';

export const dynamic = 'force-dynamic';

/**
 * Rédaction d'une nouvelle recette.
 *
 * Le garde est appelé bien que le middleware couvre déjà la navigation : c'est
 * le filet en cas de cookie expiré entre les deux, et la page n'a rien à
 * afficher sans utilisateur.
 */
export default async function NewRecipePage() {
  await requireUserId();
  return <RecipeEditor recipe={null} />;
}
