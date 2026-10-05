/**
 * Prompts photo pour Gemini (Nano Banana), sur le modèle de
 * `docs/prompts-photos-plats.md` : le même style commun, puis une phrase par
 * plat. Ici le style est collé devant chaque plat, pour qu'un seul copier-coller
 * suffise, même dans une conversation neuve.
 */

export const PHOTO_STYLE =
  "Photographie culinaire réaliste, comme pour un livre de recettes du quotidien. Plat fait maison, appétissant sans artifice, portion réaliste. Vue de trois quarts légèrement plongeante, lumière naturelle douce venant de la gauche, faible profondeur de champ. Vaisselle en céramique mate blanc cassé, sur une table en bois clair ou un linge en lin beige clair. Format paysage 4:3, plat bien centré avec de la marge tout autour : rien d'important près des bords. Aucun texte, aucune main, aucun logo, pas de couverts au premier plan, pas d'ingrédient posé à côté du plat. Les ingrédients cités doivent être reconnaissables.";

const MEAL_WORDS: Record<string, string> = {
  breakfast: 'petit-déjeuner',
  lunch: 'déjeuner',
  dinner: 'dîner',
  snack: 'collation',
};

/** Le contenant, comme dans le fichier des plats : selon le repas, et quelques mots du nom. */
function vessel(name: string, meal: string | null): string {
  const lower = name.toLocaleLowerCase('fr');
  if (/smoothie|milk-?shake|jus |boisson|lassi/.test(lower)) {
    return 'dans un grand verre';
  }
  if (/soupe|velouté|bouillon|porridge|bol |bowl|salade de fruits/.test(lower)) {
    return 'dans un bol ou une assiette creuse';
  }
  if (meal === 'breakfast') {
    return 'dans un bol ou sur une assiette de petit-déjeuner';
  }
  if (meal === 'snack') {
    return 'dans un petit bol ou sur une petite assiette';
  }
  return 'dans une assiette';
}

/**
 * Un ingrédient lisible pour le modèle : « Riz blanc, cuit » devient « riz
 * blanc ». Les fiches CIQUAL précisent après la virgule ou entre parenthèses
 * ce qui n'aide pas à dessiner le plat.
 */
function plainIngredient(label: string): string {
  const head = label.split(',')[0]?.replace(/\([^)]*\)/g, '').trim() ?? '';
  return head.charAt(0).toLocaleLowerCase('fr') + head.slice(1);
}

/** La phrase du plat, sans le style commun. */
export function dishPrompt(dish: { name: string; meal: string | null; ingredients: string[] }): string {
  const meal = dish.meal ? MEAL_WORDS[dish.meal] : undefined;
  const ingredients = [...new Set(dish.ingredients.map(plainIngredient).filter((value) => value.length > 0))];
  const seen = ingredients.length > 0 ? ` On y reconnaît : ${ingredients.join(', ')}.` : '';
  return `${dish.name}${meal ? ` (${meal})` : ''}, ${vessel(dish.name, dish.meal ?? null)}.${seen}`;
}

/** Ce qu'on colle dans Gemini : le style, puis le plat. */
export function fullPrompt(dish: { name: string; meal: string | null; ingredients: string[] }): string {
  return `${PHOTO_STYLE}\n\n${dishPrompt(dish)}`;
}
