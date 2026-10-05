import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import type { Macros } from '@/lib/types';
import { isMeal } from '@/lib/meal';
import {
  cookingYield,
  isIngredientRefKind,
  type IngredientRefKind,
  type Recipe,
  type RecipeIngredient,
  type RecipeInput,
} from '@/lib/recipe';

/**
 * Accès aux recettes.
 *
 * Chaque fonction reçoit l'utilisateur en premier argument et aucune n'en
 * déduit un toute seule, comme pour le journal : le compilateur doit pouvoir
 * refuser un appel qui aurait oublié le cloisonnement.
 *
 * Les ingrédients sont résolus par jointure vers CIQUAL et le cache produits,
 * mais aucune macro n'est sommée ici. Le calcul vit dans `@/lib/recipe`, pur
 * et vérifié sans base : deux implémentations de la même règle, l'une en SQL
 * pour la liste et l'autre en TypeScript pour le détail, divergeraient au
 * premier correctif.
 */

/** Les colonnes numeric arrivent en chaîne par le pilote : conversion unique ici. */
function toNumber(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function toNullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Les quatre valeurs d'une fiche de référence, ou `null` si la jointure n'a
 * rien ramené.
 *
 * Le tout ou rien est volontaire : une fiche dont l'énergie serait lisible
 * mais pas les protéines donnerait un total faussement précis. CIQUAL marque
 * déjà ces lignes `is_complete = false`, et la jointure les écarte.
 */
function toPer100g(row: {
  kcal: string | null;
  proteinG: string | null;
  carbsG: string | null;
  fatG: string | null;
}): Macros | null {
  if (
    row.kcal === null ||
    row.proteinG === null ||
    row.carbsG === null ||
    row.fatG === null
  ) {
    return null;
  }
  return {
    kcal: Number(row.kcal),
    proteinG: Number(row.proteinG),
    carbsG: Number(row.carbsG),
    fatG: Number(row.fatG),
  };
}

/**
 * Les ingrédients de plusieurs recettes, références résolues.
 *
 * Les deux jointures sont mutuellement exclusives par construction : la
 * condition porte sur `ref_kind` autant que sur la clé, si bien qu'un
 * ingrédient CIQUAL ne peut pas ramener un produit dont le code-barres
 * coïnciderait avec un code CIQUAL. `coalesce` choisit ensuite celle qui a
 * répondu.
 *
 * Le filtre `is_complete` sur CIQUAL n'est pas une précaution de plus : la
 * table contient des lignes dont les macros sont illisibles, et les laisser
 * entrer produirait des zéros qui se sommeraient sans rien dire.
 */
async function ingredientsFor(
  recipeIds: readonly number[],
): Promise<Map<number, RecipeIngredient[]>> {
  const grouped = new Map<number, RecipeIngredient[]>();
  if (recipeIds.length === 0) {
    return grouped;
  }

  const rows = await db()
    .select({
      id: schema.recipeIngredients.id,
      recipeId: schema.recipeIngredients.recipeId,
      position: schema.recipeIngredients.position,
      refKind: schema.recipeIngredients.refKind,
      refValue: schema.recipeIngredients.refValue,
      label: schema.recipeIngredients.label,
      quantityG: schema.recipeIngredients.quantityG,
      unitName: schema.recipeIngredients.unitName,
      unitGrams: schema.recipeIngredients.unitGrams,
      refName: sql<string | null>`coalesce(${schema.ciqualFoods.name}, ${schema.products.name})`,
      kcal: sql<
        string | null
      >`coalesce(${schema.ciqualFoods.kcal100g}, ${schema.products.kcal100g})`,
      proteinG: sql<
        string | null
      >`coalesce(${schema.ciqualFoods.protein100g}, ${schema.products.protein100g})`,
      carbsG: sql<
        string | null
      >`coalesce(${schema.ciqualFoods.carbs100g}, ${schema.products.carbs100g})`,
      fatG: sql<
        string | null
      >`coalesce(${schema.ciqualFoods.fat100g}, ${schema.products.fat100g})`,
    })
    .from(schema.recipeIngredients)
    .leftJoin(
      schema.ciqualFoods,
      and(
        eq(schema.recipeIngredients.refKind, 'ciqual'),
        eq(schema.ciqualFoods.ciqualCode, schema.recipeIngredients.refValue),
        eq(schema.ciqualFoods.isComplete, true),
      ),
    )
    .leftJoin(
      schema.products,
      and(
        eq(schema.recipeIngredients.refKind, 'product'),
        eq(schema.products.barcode, schema.recipeIngredients.refValue),
      ),
    )
    .where(inArray(schema.recipeIngredients.recipeId, [...recipeIds]))
    .orderBy(asc(schema.recipeIngredients.recipeId), asc(schema.recipeIngredients.position));

  for (const row of rows) {
    const list = grouped.get(row.recipeId) ?? [];
    list.push({
      id: row.id,
      position: row.position,
      // La contrainte en base garantit déjà la valeur ; le repli évite un
      // transtypage muet si une ligne antérieure portait autre chose.
      refKind: isIngredientRefKind(row.refKind) ? row.refKind : 'ciqual',
      refValue: row.refValue,
      label: row.label,
      cookedYield: cookingYield(row.refName),
      quantityG: toNumber(row.quantityG),
      unitName: row.unitName,
      unitGrams: toNullableNumber(row.unitGrams),
      per100g: toPer100g(row),
    });
    grouped.set(row.recipeId, list);
  }

  return grouped;
}

function toRecipe(
  row: typeof schema.recipes.$inferSelect,
  ingredients: RecipeIngredient[],
  imageUrl: string | null,
  catalogSlot: string | null,
): Recipe {
  // Le moment choisi l'emporte ; sinon celui du plat d'origine. Les deux
  // colonnes sont bornées par une contrainte, `isMeal` ne fait que le dire au
  // typage.
  const meal = row.meal ?? catalogSlot;
  return {
    id: row.id,
    name: row.name,
    servings: toNumber(row.servings),
    steps: row.steps,
    prepMinutes: row.prepMinutes,
    notes: row.notes,
    ingredients,
    imageUrl,
    meal: isMeal(meal) ? meal : null,
  };
}

/**
 * La recette, la photo et le moment du plat dont elle est la copie.
 *
 * Jointure à gauche sur `catalog_slug` : une recette écrite à la main, ou dont
 * le plat a quitté le catalogue, garde sa ligne et reçoit simplement `null`.
 */
function recipesWithImage() {
  return db()
    .select({
      recipe: schema.recipes,
      imageUrl: schema.catalogMeals.imageUrl,
      catalogSlot: schema.catalogMeals.slot,
    })
    .from(schema.recipes)
    .leftJoin(schema.catalogMeals, eq(schema.catalogMeals.slug, schema.recipes.catalogSlug));
}

/** Toutes les recettes d'un utilisateur, ingrédients compris, par ordre alphabétique. */
export async function listRecipes(userId: number): Promise<Recipe[]> {
  const rows = await recipesWithImage()
    .where(eq(schema.recipes.userId, userId))
    .orderBy(asc(schema.recipes.name), asc(schema.recipes.id));

  const ingredients = await ingredientsFor(rows.map((row) => row.recipe.id));
  return rows.map((row) =>
    toRecipe(row.recipe, ingredients.get(row.recipe.id) ?? [], row.imageUrl, row.catalogSlot),
  );
}

/**
 * Une recette, ou `null` si elle n'existe pas — ou si elle appartient à
 * quelqu'un d'autre, ce qui de l'extérieur doit être indiscernable.
 */
export async function findRecipe(userId: number, id: number): Promise<Recipe | null> {
  const [row] = await recipesWithImage()
    .where(and(eq(schema.recipes.userId, userId), eq(schema.recipes.id, id)))
    .limit(1);

  if (!row) {
    return null;
  }
  const ingredients = await ingredientsFor([row.recipe.id]);
  return toRecipe(row.recipe, ingredients.get(row.recipe.id) ?? [], row.imageUrl, row.catalogSlot);
}

/** Les lignes d'ingrédients prêtes à écrire, dans l'ordre reçu. */
function toIngredientRows(
  recipeId: number,
  ingredients: readonly RecipeInput['ingredients'][number][],
): (typeof schema.recipeIngredients.$inferInsert)[] {
  return ingredients.map((ingredient, index) => ({
    recipeId,
    position: index,
    refKind: ingredient.refKind satisfies IngredientRefKind,
    refValue: ingredient.refValue,
    label: ingredient.label,
    quantityG: String(ingredient.quantityG),
    unitName: ingredient.unitName,
    unitGrams: ingredient.unitGrams === null ? null : String(ingredient.unitGrams),
  }));
}

/**
 * Crée une recette et ses ingrédients.
 *
 * Deux écritures successives et non une transaction : le pilote HTTP de Neon
 * n'en ouvre pas. Le pire cas est une recette enregistrée sans ses
 * ingrédients, que l'utilisateur voit immédiatement et peut compléter ou
 * supprimer. C'est acceptable ici, là où ça ne le serait pas sur le journal :
 * une recette incomplète se corrige, une entrée fausse se propage dans les
 * totaux sans prévenir.
 */
export async function insertRecipe(
  userId: number,
  input: RecipeInput,
  catalogSlug: string | null = null,
): Promise<number> {
  const [row] = await db()
    .insert(schema.recipes)
    .values({
      userId,
      name: input.name,
      servings: String(input.servings),
      steps: input.steps,
      prepMinutes: input.prepMinutes,
      notes: input.notes,
      catalogSlug,
      meal: input.meal ?? null,
    })
    .returning({ id: schema.recipes.id });

  const recipeId = row?.id;
  if (recipeId === undefined) {
    throw new Error("La recette n'a pas pu être créée.");
  }

  if (input.ingredients.length > 0) {
    await db()
      .insert(schema.recipeIngredients)
      .values(toIngredientRows(recipeId, input.ingredients));
  }
  return recipeId;
}

/**
 * Remplace une recette et ses ingrédients. Rend `false` si elle n'appartient
 * pas à l'utilisateur, sans distinguer ce cas de l'absence.
 *
 * Les ingrédients sont remplacés en bloc plutôt que rapprochés ligne à ligne.
 * Leur identité ne porte rien : aucune entrée de journal ne les référence, et
 * l'ordre suffit à les désigner.
 */
export async function updateRecipe(
  userId: number,
  id: number,
  input: RecipeInput,
): Promise<boolean> {
  const updated = await db()
    .update(schema.recipes)
    .set({
      name: input.name,
      servings: String(input.servings),
      steps: input.steps,
      prepMinutes: input.prepMinutes,
      notes: input.notes,
      // Absent, le moment reste ce qu'il était (voir `RecipeInput.meal`).
      ...(input.meal === undefined ? {} : { meal: input.meal }),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.recipes.userId, userId), eq(schema.recipes.id, id)))
    .returning({ id: schema.recipes.id });

  if (updated.length === 0) {
    return false;
  }

  await db()
    .delete(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.recipeId, id));

  if (input.ingredients.length > 0) {
    await db().insert(schema.recipeIngredients).values(toIngredientRows(id, input.ingredients));
  }
  return true;
}

/** Supprime une recette. Les ingrédients suivent par cascade. */
export async function deleteRecipe(userId: number, id: number): Promise<boolean> {
  const deleted = await db()
    .delete(schema.recipes)
    .where(and(eq(schema.recipes.userId, userId), eq(schema.recipes.id, id)))
    .returning({ id: schema.recipes.id });
  return deleted.length > 0;
}

/** Nombre de recettes d'un utilisateur, pour décider d'offrir les plats de départ. */
export async function countRecipes(userId: number): Promise<number> {
  const [row] = await db()
    .select({ count: sql<string>`count(*)` })
    .from(schema.recipes)
    .where(eq(schema.recipes.userId, userId));
  return Number(row?.count ?? 0);
}

/**
 * Parmi les références proposées, celles qui ne pointent vers rien.
 *
 * Appelée avant toute écriture. Une recette dont un ingrédient ne se résout
 * pas s'enregistrerait sans bruit et n'afficherait son total incomplet que
 * plus tard, au moment de cuisiner — c'est-à-dire trop tard. Mieux vaut
 * refuser tout de suite et dire lequel.
 *
 * Le filtre `is_complete` sur CIQUAL est le même qu'à la lecture : un aliment
 * dont les macros sont illisibles n'est pas une référence valable, même si sa
 * ligne existe.
 */
export async function missingReferences(
  references: readonly { refKind: IngredientRefKind; refValue: string }[],
): Promise<string[]> {
  const ciqualCodes = references
    .filter((reference) => reference.refKind === 'ciqual')
    .map((reference) => reference.refValue);
  const barcodes = references
    .filter((reference) => reference.refKind === 'product')
    .map((reference) => reference.refValue);

  const [ciqualRows, productRows] = await Promise.all([
    ciqualCodes.length === 0
      ? Promise.resolve([])
      : db()
          .select({ code: schema.ciqualFoods.ciqualCode })
          .from(schema.ciqualFoods)
          .where(
            and(
              inArray(schema.ciqualFoods.ciqualCode, ciqualCodes),
              eq(schema.ciqualFoods.isComplete, true),
            ),
          ),
    barcodes.length === 0
      ? Promise.resolve([])
      : db()
          .select({ code: schema.products.barcode })
          .from(schema.products)
          .where(inArray(schema.products.barcode, barcodes)),
  ]);

  const known = new Set([
    ...ciqualRows.map((row) => `ciqual:${row.code}`),
    ...productRows.map((row) => `product:${row.code}`),
  ]);

  return references
    .filter((reference) => !known.has(`${reference.refKind}:${reference.refValue}`))
    .map((reference) => `${reference.refKind}:${reference.refValue}`);
}
