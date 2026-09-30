import { apiError } from '@/server/errors';
import { currentUserId } from '@/server/guard';
import { recentFoods } from '@/server/services/entries';
import { favoritesFor } from '@/server/services/favorites';
import { lastWeighIn } from '@/server/services/profile';
import { openSessionFor, sessionHistory, templatesFor } from '@/server/services/workouts';
import { QUICK_CHIPS, type QuickAddContext, type QuickSession } from '@/lib/quick-add';
import { nextProgramTemplate } from '@/lib/workout';

export const runtime = 'nodejs';

/** Séances relues pour situer la rotation du programme : trois semaines à trois par semaine. */
const ROTATION_WINDOW = 10;

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

  const [favorites, recents, open, templates, history, weighIn] = await Promise.all([
    favoritesFor(userId),
    recentFoods(userId, QUICK_CHIPS),
    openSessionFor(userId),
    templatesFor(userId),
    sessionHistory(userId, ROTATION_WINDOW),
    lastWeighIn(userId),
  ]);

  let session: QuickSession | null = null;
  if (open !== null) {
    session = {
      kind: 'open',
      sessionId: open.id,
      name: open.templateName ?? 'Séance libre',
      setCount: open.sets.length,
    };
  } else {
    const next = nextProgramTemplate(templates, history);
    if (next !== null) {
      session = {
        kind: 'next',
        templateId: next.id,
        name: next.name,
        exerciseCount: next.exercises.length,
      };
    }
  }

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
