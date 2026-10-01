import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { recentFoods } from '@/server/services/entries';
import { favoritesFor } from '@/server/services/favorites';
import { lastWeighIn } from '@/server/services/profile';
import { quickSessionFor } from '@/server/services/today';
import { QUICK_CHIPS, type QuickAddContext } from '@/lib/quick-add';

export const runtime = 'nodejs';

/**
 * Ce que le bouton + propose à l'ouverture : les raccourcis de repas, la
 * séance du jour et la dernière pesée.
 *
 * Une seule lecture pour les trois feuilles. Le bouton vit dans la barre
 * d'onglets, qui ne se rend pas à chaque navigation : il demande donc ses
 * données au moment où on le touche, et elles sont toujours fraîches.
 */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (userId === null) {
    return apiError('unauthorized');
  }

  const [favorites, recents, session, weighIn] = await Promise.all([
    favoritesFor(userId),
    recentFoods(userId, QUICK_CHIPS),
    quickSessionFor(userId),
    lastWeighIn(userId),
  ]);

  // Les favoris d'abord : un repas entier refait d'un appui vaut mieux qu'un
  // aliment seul. Les récents complètent la ligne.
  const favoriteChips = favorites.slice(0, QUICK_CHIPS).map((favorite) => ({
    id: favorite.id,
    name: favorite.name,
  }));
  const body: QuickAddContext = {
    favorites: favoriteChips,
    recents: recents.slice(0, Math.max(0, QUICK_CHIPS - favoriteChips.length)).map((entry) => ({
      entryId: entry.id,
      label: entry.foodLabel,
      quantityG: entry.quantityG,
      kcal: entry.macros.kcal,
    })),
    session,
    lastWeighIn: weighIn,
  };
  return Response.json(body);
}
