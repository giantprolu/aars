import { requireUserId } from '@/server/guard';
import { favoritesFor } from '@/server/services/favorites';
import { FavoritesFlow } from './FavoritesFlow';

// Les favoris viennent du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/** Refaire un repas favori : un appui, et ses aliments rejoignent le journal. */
export default async function AddFavoritesPage() {
  const favorites = await favoritesFor(await requireUserId());
  return <FavoritesFlow favorites={favorites} />;
}
