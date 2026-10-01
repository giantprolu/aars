/**
 * Partage des recettes : mise en forme du texte. Fonctions pures (AD-8).
 *
 * On partage une recette pour qu'elle soit lue ailleurs — dans une messagerie,
 * une note, un courriel — et jamais dans l'application. Le texte brut est donc
 * le format, et non un pis-aller : c'est le seul que toutes les destinations
 * savent afficher sans rien perdre.
 *
 * Les quantités partagées sont celles du panier de la semaine, mises à
 * l'échelle par le serveur avant d'arriver ici, comme le fait la fiche et
 * comme l'a fait la liste de courses. Envoyer les quantités écrites dans la
 * recette à quelqu'un qui a les courses dans son sac lui ferait cuisiner autre
 * chose que ce qu'on a acheté.
 */

import { formatIngredientQuantity, formatServings } from './recipe';

/** Un ingrédient tel qu'il se partage : ce qui s'écrit, et rien de plus. */
export interface ShareableIngredient {
  label: string;
  quantityG: number;
  unitName: string | null;
  unitGrams: number | null;
}

/**
 * Une recette prête à partager.
 *
 * Distincte de `Recipe` sur deux points, et les deux comptent. Aucune macro :
 * elles n'ont pas de sens hors du journal de celui qui les lit, et les envoyer
 * ferait passer pour un calcul personnel ce qui n'est qu'une recette. Aucune
 * référence CIQUAL ni code-barres non plus : ce sont des identifiants internes,
 * illisibles pour le destinataire, et rien de ce qu'on partage n'a besoin d'eux.
 *
 * `servings` porte les parts du panier, pas celles de la recette : c'est pour
 * ce nombre-là que les quantités sont écrites.
 */
export interface ShareableRecipe {
  id: number;
  name: string;
  servings: number;
  prepMinutes: number | null;
  ingredients: ShareableIngredient[];
  steps: string[];
  notes: string | null;
}

/**
 * Sépare deux recettes dans un même envoi.
 *
 * Une ligne à elle seule plutôt qu'un simple blanc : les messageries replient
 * les lignes vides, et deux recettes à la suite finissaient collées, la
 * dernière étape de l'une touchant le nom de l'autre.
 */
const SEPARATOR = '———';

/**
 * Une recette, écrite.
 *
 * L'ordre est celui de la cuisine : ce qu'on fait, pour combien, ce qu'il faut
 * acheter, puis les gestes. La note vient en dernier parce qu'elle commente le
 * reste et ne se lit qu'une fois le reste lu.
 */
export function formatShareableRecipe(recipe: ShareableRecipe): string {
  const parts: string[] = [recipe.name];

  parts.push(
    recipe.prepMinutes === null
      ? formatServings(recipe.servings)
      : `${formatServings(recipe.servings)} · ${recipe.prepMinutes} min`,
  );

  if (recipe.ingredients.length > 0) {
    parts.push(
      '',
      'Ingrédients',
      ...recipe.ingredients.map(
        (ingredient) => `- ${ingredient.label} — ${formatIngredientQuantity(ingredient)}`,
      ),
    );
  }

  if (recipe.steps.length > 0) {
    parts.push('', 'Préparation', ...recipe.steps.map((step, index) => `${index + 1}. ${step}`));
  }

  if (recipe.notes !== null && recipe.notes.trim().length > 0) {
    parts.push('', `Note : ${recipe.notes.trim()}`);
  }

  return parts.join('\n');
}

/**
 * Les recettes choisies, en un seul texte.
 *
 * La semaine est rappelée en tête, et c'est elle qui donne son sens à
 * l'envoi : les quantités qui suivent sont celles d'un panier précis, et un
 * texte qui ne le dirait pas se relirait six mois plus tard comme une recette
 * pour un nombre de parts inconnu.
 *
 * Une seule recette ne porte pas cet en-tête. Envoyer un plat à quelqu'un est
 * un geste qui ne parle pas de sa semaine, et l'en-tête y ferait un titre plus
 * long que le contenu.
 */
export function formatShareableRecipes(
  recipes: readonly ShareableRecipe[],
  weekLabel: string,
): string {
  if (recipes.length === 0) {
    return '';
  }
  const body = recipes.map(formatShareableRecipe).join(`\n\n${SEPARATOR}\n\n`);
  if (recipes.length === 1) {
    return body;
  }
  return `Recettes de la semaine ${weekLabel}\n\n${SEPARATOR}\n\n${body}`;
}

/**
 * Le titre de l'envoi, celui que la feuille de partage du système affiche.
 *
 * Le nom du plat quand il n'y en a qu'un : c'est ce qu'on reconnaît dans une
 * liste de conversations, là où « Recettes de la semaine » ne distingue rien.
 */
export function shareableRecipesTitle(
  recipes: readonly ShareableRecipe[],
  weekLabel: string,
): string {
  const only = recipes.length === 1 ? recipes[0] : undefined;
  return only === undefined ? `Recettes de la semaine ${weekLabel}` : only.name;
}
