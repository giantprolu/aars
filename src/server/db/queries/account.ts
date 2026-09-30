import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../client';

/**
 * Tout ce que la base garde d'un utilisateur, pour l'export.
 *
 * Chaque table est lue sur l'utilisateur ; les tables filles qui ne le portent
 * pas — ingrédients d'une recette, exercices d'une séance modèle — le sont
 * par leurs parents, eux-mêmes lus sur l'utilisateur. Rien d'autre n'y entre :
 * les référentiels communs (CIQUAL, produits, exercices, salles) ne sont à
 * personne.
 *
 * Les secrets du compte restent dehors. L'empreinte du mot de passe, celle du
 * code de secours, le jeton d'ingestion et les clés des abonnements aux
 * notifications ne disent rien de la personne et ouvriraient son compte à qui
 * récupérerait le fichier.
 */
export async function exportUserData(userId: number) {
  const database = db();

  const [
    [account],
    profile,
    entries,
    weighIns,
    activity,
    aliases,
    recipes,
    basket,
    plan,
    shoppingLists,
    shoppingItems,
    ingredientProducts,
    favorites,
    trainingPreferences,
    templates,
    sessions,
    sets,
    favoriteExercises,
    subscriptions,
  ] = await Promise.all([
    database
      .select({ email: schema.users.email, createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)),
    database.select().from(schema.entries).where(eq(schema.entries.userId, userId)),
    database.select().from(schema.weightLogs).where(eq(schema.weightLogs.userId, userId)),
    database.select().from(schema.dailyActivity).where(eq(schema.dailyActivity.userId, userId)),
    database.select().from(schema.foodAliases).where(eq(schema.foodAliases.userId, userId)),
    database.select().from(schema.recipes).where(eq(schema.recipes.userId, userId)),
    database.select().from(schema.mealBasket).where(eq(schema.mealBasket.userId, userId)),
    database
      .select()
      .from(schema.mealPlanEntries)
      .where(eq(schema.mealPlanEntries.userId, userId)),
    database.select().from(schema.shoppingLists).where(eq(schema.shoppingLists.userId, userId)),
    database.select().from(schema.shoppingItems).where(eq(schema.shoppingItems.userId, userId)),
    database
      .select()
      .from(schema.ingredientProducts)
      .where(eq(schema.ingredientProducts.userId, userId)),
    database.select().from(schema.favoriteMeals).where(eq(schema.favoriteMeals.userId, userId)),
    database
      .select()
      .from(schema.trainingPreferences)
      .where(eq(schema.trainingPreferences.userId, userId)),
    database
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.userId, userId)),
    database
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId)),
    database.select().from(schema.workoutSets).where(eq(schema.workoutSets.userId, userId)),
    database
      .select({
        exerciseId: schema.favoriteExercises.exerciseId,
        createdAt: schema.favoriteExercises.createdAt,
      })
      .from(schema.favoriteExercises)
      .where(eq(schema.favoriteExercises.userId, userId)),
    database
      .select({ createdAt: schema.pushSubscriptions.createdAt })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId)),
  ]);

  const recipeIds = recipes.map((recipe) => recipe.id);
  const templateIds = templates.map((template) => template.id);
  const [recipeIngredients, templateExercises] = await Promise.all([
    recipeIds.length === 0
      ? []
      : database
          .select()
          .from(schema.recipeIngredients)
          .where(inArray(schema.recipeIngredients.recipeId, recipeIds)),
    templateIds.length === 0
      ? []
      : database
          .select()
          .from(schema.workoutTemplateExercises)
          .where(inArray(schema.workoutTemplateExercises.templateId, templateIds)),
  ]);

  return {
    account: account ?? null,
    profile: profile[0] ?? null,
    journal: { entries, favorites, aliases },
    body: { weighIns, activity },
    kitchen: {
      recipes: recipes.map((recipe) => ({
        ...recipe,
        ingredients: recipeIngredients.filter((ingredient) => ingredient.recipeId === recipe.id),
      })),
      basket,
      plan,
      shoppingLists,
      shoppingItems,
      ingredientProducts,
    },
    training: {
      preferences: trainingPreferences[0] ?? null,
      templates: templates.map((template) => ({
        ...template,
        exercises: templateExercises.filter((entry) => entry.templateId === template.id),
      })),
      sessions,
      sets,
      favoriteExercises,
    },
    notifications: { devices: subscriptions.length },
  };
}
