import 'server-only';
import { eq, inArray, or } from 'drizzle-orm';
import { db, schema } from '../client';
import { usageFor } from './usage';

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
    follows,
    kudos,
    blocks,
    reports,
    sanctions,
    subscriptions,
    storeSubscriptions,
    storePurchases,
    usage,
  ] = await Promise.all([
    database
      .select({
        email: schema.users.email,
        handle: schema.users.handle,
        displayName: schema.users.displayName,
        createdAt: schema.users.createdAt,
      })
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
    // Les relations des deux sens : qui je suis, et qui me suit. Les autres
    // comptes n'y figurent que par leur identifiant public, jamais leur adresse.
    database
      .select({
        followerId: schema.follows.followerId,
        followeeId: schema.follows.followeeId,
        status: schema.follows.status,
        createdAt: schema.follows.createdAt,
      })
      .from(schema.follows)
      .where(or(eq(schema.follows.followerId, userId), eq(schema.follows.followeeId, userId))),
    database
      .select({ sessionId: schema.sessionKudos.sessionId, createdAt: schema.sessionKudos.createdAt })
      .from(schema.sessionKudos)
      .where(eq(schema.sessionKudos.userId, userId)),
    database
      .select({ blockedId: schema.userBlocks.blockedId, createdAt: schema.userBlocks.createdAt })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerId, userId)),
    // Les signalements faits, jamais ceux reçus : rendre ces derniers dirait
    // qui a signalé.
    database
      .select({
        reportedUserId: schema.socialReports.reportedUserId,
        sessionId: schema.socialReports.sessionId,
        reason: schema.socialReports.reason,
        note: schema.socialReports.note,
        createdAt: schema.socialReports.createdAt,
        resolvedAt: schema.socialReports.resolvedAt,
      })
      .from(schema.socialReports)
      .where(eq(schema.socialReports.reporterId, userId)),
    // Les décisions de modération qui me concernent, en termes généraux : le
    // dossier lui-même n'est pas rendu, il contient les signalements des autres.
    database
      .select({
        kind: schema.moderationSanctions.kind,
        action: schema.moderationSanctions.action,
        category: schema.moderationSanctions.category,
        startsAt: schema.moderationSanctions.startsAt,
        endsAt: schema.moderationSanctions.endsAt,
        liftedAt: schema.moderationSanctions.liftedAt,
        voided: schema.moderationSanctions.voided,
      })
      .from(schema.moderationSanctions)
      .where(eq(schema.moderationSanctions.userId, userId)),
    database
      .select({ createdAt: schema.pushSubscriptions.createdAt })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId)),
    // Le jeton d'achat est omis : il ne dit rien à la personne, et il suffit
    // à interroger le magasin sur son achat.
    database
      .select({
        store: schema.storeSubscriptions.store,
        productId: schema.storeSubscriptions.productId,
        state: schema.storeSubscriptions.state,
        expiresAt: schema.storeSubscriptions.expiresAt,
        autoRenewing: schema.storeSubscriptions.autoRenewing,
        createdAt: schema.storeSubscriptions.createdAt,
      })
      .from(schema.storeSubscriptions)
      .where(eq(schema.storeSubscriptions.userId, userId)),
    database
      .select({
        store: schema.storePurchases.store,
        productId: schema.storePurchases.productId,
        state: schema.storePurchases.state,
        createdAt: schema.storePurchases.createdAt,
      })
      .from(schema.storePurchases)
      .where(eq(schema.storePurchases.userId, userId)),
    usageFor(userId),
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
    community: { follows, kudosGiven: kudos, blocks, reportsMade: reports, moderation: sanctions },
    notifications: { devices: subscriptions.length },
    billing: { subscriptions: storeSubscriptions, purchases: storePurchases },
    usage,
  };
}
