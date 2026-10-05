import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { USAGE_EVENTS } from '../../lib/usage';
import { REPORT_REASONS } from '../../lib/social';
import { PURCHASE_STATES, STORES } from '../../lib/premium';
import type { CatalogIngredient } from '../../lib/meal-catalog';

/**
 * Schéma Drizzle. `snake_case` en base, `camelCase` en TypeScript
 * (spine, conventions de nommage).
 *
 * Le journal, les alias et les profils appartiennent à un utilisateur et
 * portent sa clé. Les référentiels, CIQUAL et cache produits, restent communs :
 * ce sont des données publiques, les dupliquer par compte n'aurait aucun sens.
 * Toutes les colonnes nutritionnelles sont en numeric(10,3) (AD-9).
 */

/** Précision commune à toute valeur nutritionnelle (AD-9). */
const nutrient = (name: string) => numeric(name, { precision: 10, scale: 3 });

/**
 * Comptes. L'inscription est libre : aucun code d'invitation, aucune
 * vérification d'adresse, et par conséquent aucune récupération de mot de
 * passe possible, faute de service d'envoi de courriel.
 *
 * `email` est stockée normalisée en minuscules, l'unicité portant sur cette
 * forme : deux inscriptions ne doivent pas différer par une seule majuscule.
 */
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  /** Empreinte PBKDF2, sel et nombre de tours compris. Jamais le mot de passe. */
  passwordHash: text('password_hash').notNull(),
  /**
   * Jeton d'ingestion, pour les raccourcis iOS qui n'ont pas de cookie de
   * session. Stocké en clair, contrairement au mot de passe : l'utilisateur
   * doit pouvoir le recopier dans son raccourci. Il n'ouvre qu'une seule
   * route, en écriture, et se régénère à la demande.
   */
  ingestToken: text('ingest_token').unique(),
  /**
   * Empreinte PBKDF2 du code de secours, ou `null` s'il n'en a pas été tiré.
   *
   * Le code remplace le courriel de réinitialisation quand il n'y en a pas :
   * noté une fois, il permet de choisir un nouveau mot de passe. Il est à
   * usage unique et se hache comme un mot de passe, parce qu'il en ouvre un.
   */
  recoveryCodeHash: text('recovery_code_hash'),
  /**
   * L'identifiant public, sans l'arobase : seul moyen de trouver quelqu'un.
   *
   * `null` tant que l'utilisateur ne s'est pas présenté : sans lui, personne
   * ne peut le trouver ni le suivre. L'adresse n'est jamais montrée à un
   * autre compte — elle ouvre la récupération du mot de passe. Stocké en
   * minuscules, et l'unicité porte sur cette forme.
   */
  handle: text('handle').unique(),
  /** Le nom affiché aux abonnés. Libre, et pas unique : deux Camille existent. */
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export type UserRow = typeof users.$inferSelect;

/**
 * Qui suit qui.
 *
 * Suivre se demande et s'accepte : une séance dit ce qu'on soulève, quand et
 * à quelle fréquence, et c'est à celui qui s'entraîne de choisir qui la voit.
 * `pending` tant que la personne suivie n'a pas répondu ; refuser supprime la
 * ligne, ce qui permet de redemander plus tard sans rien laisser voir du refus.
 */
export const follows = pgTable(
  'follows',
  {
    followerId: bigint('follower_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: bigint('followee_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `pending` ou `accepted`. */
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    // La lecture la plus fréquente part de la personne suivie : « qui me
    // suit », et le fil, qui cherche les séances de ceux que je suis.
    index('follows_followee_idx').on(table.followeeId, table.status),
    check('follows_status_check', sql`${table.status} in ('pending', 'accepted')`),
    check('follows_not_self_check', sql`${table.followerId} <> ${table.followeeId}`),
  ],
);

export type FollowRow = typeof follows.$inferSelect;

/**
 * Les blocages (règle 1.2 de l'App Store, contenu généré par les
 * utilisateurs).
 *
 * Bloquer coupe tout entre deux comptes, dans les deux sens : les relations
 * et les bravos échangés sont supprimés, aucune demande ne peut se recréer,
 * et chacun disparaît de la recherche et du fil de l'autre. Seul celui qui
 * bloque peut lever le blocage, et l'autre n'en est averti d'aucune façon.
 */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: bigint('blocker_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: bigint('blocked_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    // Le blocage se cherche dans les deux sens : la clé sert « qui j'ai
    // bloqué », l'index « qui m'a bloqué ».
    index('user_blocks_blocked_idx').on(table.blockedId),
    check('user_blocks_not_self_check', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);

/**
 * Dépense d'activité mesurée, une ligne par jour et par source.
 *
 * `active_kcal` est l'énergie dépensée en plus du métabolisme de base, telle
 * que la compte Santé d'Apple. Elle s'ajoute donc au métabolisme sans le
 * recouvrir, là où un facteur d'activité le multipliait au jugé.
 *
 * La source est conservée parce que les mesures se recouvrent : une sortie
 * enregistrée sur Strava figure aussi dans Santé si la montre l'a vue. Les
 * additionner compterait deux fois la même dépense, le service en retient donc
 * une seule par jour.
 */
export const dailyActivity = pgTable(
  'daily_activity',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Jour civil, en Europe/Paris comme le journal (AD-11). */
    day: date('day').notNull(),
    /** `health` ou `strava`. */
    source: text('source').notNull(),
    activeKcal: numeric('active_kcal', { precision: 7, scale: 1 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('daily_activity_user_day_source_key').on(table.userId, table.day, table.source),
    index('daily_activity_user_day_idx').on(table.userId, table.day),
  ],
);
export type DailyActivityRow = typeof dailyActivity.$inferSelect;

/**
 * Profil corporel et objectif, un par utilisateur. Sert au calcul de la cible
 * calorique. Les mesures sont séparées du compte : elles changent souvent,
 * l'identifiant jamais.
 */
export const profiles = pgTable('profiles', {
  userId: bigint('user_id', { mode: 'number' })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** `male` ou `female`, seule distinction retenue par Mifflin-St Jeor. */
  sex: text('sex').notNull(),
  birthDate: date('birth_date').notNull(),
  heightCm: integer('height_cm').notNull(),
  weightKg: numeric('weight_kg', { precision: 5, scale: 1 }).notNull(),
  /** Taux de masse grasse en pourcentage, si connu. Bascule sur Katch-McArdle. */
  bodyFatPercent: numeric('body_fat_percent', { precision: 4, scale: 1 }),
  /** Une des clés de ACTIVITY_FACTORS. */
  activity: text('activity').notNull(),
  /** `lose`, `maintain` ou `gain`. */
  goal: text('goal').notNull(),
  /** Rythme visé, en pourcentage du poids par semaine. */
  ratePercentPerWeek: numeric('rate_percent_per_week', { precision: 3, scale: 2 }).notNull(),
  /**
   * Cible fixée à la main, en kilocalories. `null` tant que l'utilisateur
   * laisse le calcul décider.
   *
   * Elle existe parce qu'aucune équation ne bat trois semaines de pesée. Celui
   * qui a constaté que sa cible calculée le fait grossir doit pouvoir la
   * corriger sans mentir sur son poids ou son niveau d'activité pour obtenir le
   * chiffre qu'il sait juste. Renseignée, elle l'emporte sur tout le reste.
   */
  manualTargetKcal: integer('manual_target_kcal'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

/**
 * Le journal. Une entrée porte ses propres macros, déjà multipliées par la
 * quantité, et une copie de la désignation. Aucune clé étrangère ne la relie
 * à une table de référence : l'historique ne doit jamais bouger (AD-1).
 */
export const entries = pgTable(
  'entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Date du journal, déterminée en Europe/Paris (AD-11). */
    entryDate: date('entry_date').notNull(),
    /**
     * Repas auquel l'entrée est rattachée : `breakfast`, `lunch`, `dinner`
     * ou `snack`. Le journal se lit par repas et non à plat (DESIGN.md).
     *
     * Choisi par l'utilisateur à l'enregistrement, avec pour proposition le
     * repas correspondant à l'heure. C'est bien une colonne et non une
     * déduction à l'affichage : une entrée saisie le soir pour le déjeuner
     * oublié doit tomber au déjeuner, et l'heure de saisie ne le sait pas.
     */
    meal: text('meal').notNull().default('lunch'),
    /** Désignation figée au moment de l'enregistrement (AD-1). */
    foodLabel: text('food_label').notNull(),
    quantityG: nutrient('quantity_g').notNull(),
    kcal: nutrient('kcal').notNull(),
    proteinG: nutrient('protein_g').notNull(),
    carbsG: nutrient('carbs_g').notNull(),
    fatG: nutrient('fat_g').notNull(),
    /** `ciqual`, `product` ou `manual`. Diagnostic et raccourcis, jamais affichage. */
    sourceKind: text('source_kind').notNull(),
    /** Code CIQUAL ou code-barres. Null pour une entrée ad hoc (FR-25). */
    sourceRef: text('source_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // L'utilisateur est en tête de chaque index : toute lecture du journal
    // commence par lui, aucune requête ne balaie les entrées des autres.
    index('entries_user_date_idx').on(table.userId, table.entryDate),
    // Le journal d'une date se lit groupé par repas : l'index porte les trois
    // colonnes pour que le tri ne repasse pas par un balayage.
    index('entries_user_date_meal_idx').on(table.userId, table.entryDate, table.meal),
    // Le repas est contraint en base et pas seulement à la frontière HTTP :
    // les entrées sont des données de santé, et une valeur hors liste rendrait
    // un repas entier invisible au regroupement du journal.
    check(
      'entries_meal_check',
      sql`${table.meal} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
    // Sert les raccourcis de quantité : dernières quantités pour un aliment (FR-9).
    index('entries_user_source_idx').on(
      table.userId,
      table.sourceKind,
      table.sourceRef,
      table.createdAt,
    ),
  ],
);

export type EntryRow = typeof entries.$inferSelect;
export type NewEntryRow = typeof entries.$inferInsert;

/**
 * Cache produits (FR-14). La clé est le code-barres : un produit n'existe
 * qu'une fois, et un second scan le retrouve sans appel réseau (FR-12).
 *
 * Les valeurs sont toujours exprimées pour 100 g (AD-8). La normalisation
 * depuis Open Food Facts se fait à l'écriture, jamais à la lecture.
 */
export const products = pgTable(
  'products',
  {
    barcode: text('barcode').primaryKey(),
    name: text('name').notNull(),
    kcal100g: nutrient('kcal_100g').notNull(),
    protein100g: nutrient('protein_100g').notNull(),
    carbs100g: nutrient('carbs_100g').notNull(),
    fat100g: nutrient('fat_100g').notNull(),
    /** Portion déclarée par Open Food Facts, proposée en raccourci (FR-9). */
    servingSizeG: nutrient('serving_size_g'),
    /** `off` ou `manual` : d'où vient la fiche. */
    source: text('source').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('products_name_idx').on(table.name)],
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;

/**
 * Table CIQUAL (ANSES, licence Etalab), importée depuis le CSV (FR-6).
 *
 * `isComplete` distingue les aliments exploitables : une ligne dont l'énergie
 * ou l'une des trois macros n'est pas lisible est importée quand même, pour
 * que l'import reste idempotent sur le code CIQUAL, mais exclue de la recherche.
 */
export const ciqualFoods = pgTable('ciqual_foods', {
  ciqualCode: text('ciqual_code').primaryKey(),
  name: text('name').notNull(),
  kcal100g: nutrient('kcal_100g'),
  protein100g: nutrient('protein_100g'),
  carbs100g: nutrient('carbs_100g'),
  fat100g: nutrient('fat_100g'),
  /**
   * Groupe alimentaire de l'ANSES (`alim_grp_code`), sur deux caractères.
   *
   * Importé pour une seule raison : ranger un ingrédient au bon rayon de la
   * liste de courses. Le classement de l'ANSES vaut mieux qu'une liste de
   * mots-clés écrite à la main, et il est déjà dans le CSV.
   *
   * Nullable : les lignes importées avant l'ajout de la colonne ne l'ont pas,
   * et un réimport suffit à les remplir.
   */
  groupCode: text('group_code'),
  isComplete: boolean('is_complete').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CiqualFoodRow = typeof ciqualFoods.$inferSelect;
export type NewCiqualFoodRow = typeof ciqualFoods.$inferInsert;

/**
 * Alias d'aliment (FR-19) : l'association mémorisée entre un nom libre rendu
 * par le modèle de vision et l'aliment de référence choisi par l'utilisateur.
 *
 * `aliasNorm` est le nom normalisé (minuscules, sans accents) et porte
 * l'unicité : un nom libre ne porte jamais plus d'un alias.
 */
export const foodAliases = pgTable(
  'food_aliases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    aliasNorm: text('alias_norm').notNull(),
    targetKind: text('target_kind').notNull(),
    targetRef: text('target_ref').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // L'unicité porte sur le couple, et non sur le seul nom : deux personnes
  // n'associent pas forcément « poulet » au même aliment de référence.
  (table) => [unique('food_aliases_user_alias_key').on(table.userId, table.aliasNorm)],
);

export type FoodAliasRow = typeof foodAliases.$inferSelect;

/**
 * Une recette. Elle appartient à un utilisateur, comme le journal : ce qu'on
 * mange et ce qu'on prévoit de manger sont la même donnée de santé.
 *
 * Contrairement à une entrée, elle ne porte aucune valeur nutritionnelle. Ses
 * macros sont recalculées depuis les références de ses ingrédients à chaque
 * lecture. AD-1 fige le passé, pas les intentions : corriger un ingrédient mal
 * saisi doit corriger les repas à venir, et ne toucher à aucun repas déjà
 * journalisé.
 */
export const recipes = pgTable(
  'recipes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Nombre de parts que produit la recette telle qu'elle est écrite. */
    servings: numeric('servings', { precision: 4, scale: 1 }).notNull().default('1'),
    /**
     * Les étapes, dans l'ordre. Un tableau de texte plutôt qu'une table :
     * une étape n'a ni identité ni existence hors de sa recette, et rien ne
     * la référencera jamais.
     */
    steps: text('steps').array().notNull().default(sql`'{}'::text[]`),
    prepMinutes: integer('prep_minutes'),
    notes: text('notes'),
    /**
     * Le plat du catalogue dont cette recette est la copie, `null` pour une
     * recette écrite à la main.
     *
     * Elle sert à deux choses, et les deux tiennent à l'identité : savoir
     * qu'un plat est déjà installé sans comparer des noms que l'utilisateur
     * est libre de changer, et rendre l'installation rejouable sans créer de
     * doublon au double appui.
     *
     * Ce n'est pas une clé étrangère : le catalogue vit dans le code, pas en
     * base. Un plat retiré du catalogue laisse donc une recette orpheline,
     * ce qui est exactement le bon comportement — elle a été recopiée, elle
     * appartient à l'utilisateur, et rien ne justifierait de la lui reprendre.
     */
    catalogSlug: text('catalog_slug'),
    /**
     * Le moment où la recette se mange (`breakfast`, `lunch`, `dinner`,
     * `snack`), choisi par l'utilisateur ; `null` s'il n'en a pas dit.
     *
     * Ajoutée le 05/10/2026 sans rien réécrire : une recette installée depuis
     * le catalogue reprend à la lecture le moment de son plat tant que cette
     * colonne est vide.
     */
    meal: text('meal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // L'utilisateur est en tête, comme partout ailleurs : aucune lecture ne
    // balaie les recettes des autres.
    index('recipes_user_name_idx').on(table.userId, table.name),
    check(
      'recipes_meal_check',
      sql`${table.meal} is null or ${table.meal} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
    // Un plat du catalogue ne s'installe qu'une fois par compte. La contrainte
    // est en base et pas seulement dans le service : c'est elle qui tient
    // quand deux requêtes arrivent en même temps. Postgres traite les `null`
    // comme distincts, donc les recettes écrites à la main ne se gênent pas.
    unique('recipes_user_catalog_slug_key').on(table.userId, table.catalogSlug),
  ],
);

export type RecipeRow = typeof recipes.$inferSelect;
export type NewRecipeRow = typeof recipes.$inferInsert;

/**
 * Un ingrédient de recette : une référence, une quantité, et de quoi
 * l'afficher.
 *
 * `refKind` et `refValue` désignent la même chose que `sourceKind` et
 * `sourceRef` d'une entrée, à une valeur près : `manual` n'est pas admis. Un
 * ingrédient sans référence porterait ses propres macros et ouvrirait un
 * second chemin de calcul pour un gain nul — la table CIQUAL couvre les
 * aliments de base, et une fiche manuelle a sa place dans `products`.
 *
 * Aucune clé étrangère vers `ciqual_foods` ni `products` : la référence est
 * résolue à la lecture, et une fiche devenue introuvable doit rendre un
 * ingrédient signalé, pas une écriture impossible.
 */
export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    recipeId: bigint('recipe_id', { mode: 'number' })
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    /** Rang dans la liste, tel que l'utilisateur l'a ordonné. */
    position: integer('position').notNull(),
    refKind: text('ref_kind').notNull(),
    refValue: text('ref_value').notNull(),
    /** Désignation affichée, recopiée à la création puis librement modifiable. */
    label: text('label').notNull(),
    quantityG: nutrient('quantity_g').notNull(),
    /**
     * Unité usuelle, quand l'ingrédient se compte plutôt qu'il ne se pèse.
     * « Œufs — 300 g » n'est pas une ligne de liste de courses ; « 6 œufs »
     * en est une. Les grammes restent la source de vérité des macros, l'unité
     * n'est qu'une lecture.
     */
    unitName: text('unit_name'),
    unitGrams: nutrient('unit_grams'),
  },
  (table) => [
    index('recipe_ingredients_recipe_idx').on(table.recipeId, table.position),
    // Contrainte en base et pas seulement à la frontière HTTP : une valeur
    // hors liste rendrait l'ingrédient irrésolvable et le total muet.
    check('recipe_ingredients_ref_kind_check', sql`${table.refKind} in ('ciqual', 'product')`),
  ],
);

export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredientRow = typeof recipeIngredients.$inferInsert;

/**
 * Le catalogue de plats, commun à tous les comptes.
 *
 * Il vivait dans le code ; il vit ici pour qu'ajouter un plat ou lui donner
 * une photo ne demande plus de déploiement. Ce n'est pas une donnée
 * personnelle : aucune clé d'utilisateur, comme CIQUAL.
 *
 * Le `slug` est la clé, et c'est lui que `recipes.catalog_slug` retient, sans
 * clé étrangère : un plat retiré laisse les recettes déjà recopiées intactes.
 *
 * Les ingrédients sont en jsonb plutôt qu'en table : ils n'existent pas hors
 * de leur plat, ne sont jamais interrogés seuls, et se lisent toujours en
 * bloc. Ils sont décrits par un terme de recherche CIQUAL, jamais par un code
 * (voir `meal-catalog.ts`).
 */
export const catalogMeals = pgTable(
  'catalog_meals',
  {
    slug: text('slug').primaryKey(),
    goal: text('goal').notNull(),
    /** Rang d'affichage dans l'objectif. */
    position: integer('position').notNull(),
    name: text('name').notNull(),
    slot: text('slot').notNull(),
    servings: integer('servings').notNull(),
    prepMinutes: integer('prep_minutes').notNull(),
    steps: text('steps').array().notNull().default(sql`'{}'::text[]`),
    ingredients: jsonb('ingredients').$type<CatalogIngredient[]>().notNull(),
    /** Ordre de grandeur d'une part, recalculé par `npm run verify:catalog`. */
    estimateKcal: integer('estimate_kcal').notNull(),
    estimateProteinG: integer('estimate_protein_g').notNull(),
    /**
     * La photo du plat, dans Vercel Blob (`npm run upload:photos`). Nulle tant
     * qu'aucune n'a été envoyée : l'écran garde alors son motif.
     */
    imageUrl: text('image_url'),
  },
  (table) => [
    index('catalog_meals_goal_position_idx').on(table.goal, table.position),
    check('catalog_meals_goal_check', sql`${table.goal} in ('lose', 'maintain', 'gain')`),
    check(
      'catalog_meals_slot_check',
      sql`${table.slot} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
  ],
);

/**
 * Le panier de la semaine : les plats retenus, sans jour ni repas.
 *
 * C'est l'étape qui manquait entre les recettes et le plan. On choisit
 * d'abord ce qu'on mangera cette semaine — six ou sept plats —, on achète en
 * conséquence, et ce n'est que chaque soir qu'on décide lequel passe à table.
 * Décider du mardi soir le samedi au supermarché est une fiction : on ne sait
 * pas encore à quelle heure on rentrera.
 *
 * Distincte de `meal_plan_entries`, qui porte un jour et un repas. La
 * différence n'est pas une nuance de remplissage : le panier dit ce qu'on a
 * acheté, le plan dit ce qu'on a mis à table. Le premier commande la liste de
 * courses, le second commande le journal.
 *
 * `servings` est le nombre de parts prévues sur toute la semaine, et c'est lui
 * qui est multiplié pour les courses. Un plat à quatre parts acheté une fois
 * nourrit deux dîners ; c'est au plan de dire lesquels.
 */
export const mealBasket = pgTable(
  'meal_basket',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Lundi de la semaine concernée, en Europe/Paris comme le reste (AD-11). */
    weekStart: date('week_start').notNull(),
    recipeId: bigint('recipe_id', { mode: 'number' })
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    servings: numeric('servings', { precision: 4, scale: 1 }).notNull().default('2'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // L'utilisateur est en tête : un panier se lit toujours pour quelqu'un.
    index('meal_basket_user_week_idx').on(table.userId, table.weekStart),
    // Un plat ne figure qu'une fois dans un panier : le choisir de nouveau ne
    // change rien, et ses parts se règlent explicitement. Deux lignes pour le
    // même plat donneraient deux articles de courses là où il en faut un.
    unique('meal_basket_unique_key').on(table.userId, table.weekStart, table.recipeId),
  ],
);

export type MealBasketRow = typeof mealBasket.$inferSelect;

/**
 * Le plan de la semaine : un plat, un jour, un repas, un nombre de parts.
 *
 * `meal` reprend la liste de `@/lib/meal`, celle des entrées du journal. Le
 * plan et le journal parlent des mêmes repas : un dîner prévu doit tomber au
 * dîner une fois mangé, et deux listes de repas finiraient par diverger.
 *
 * `journaledAt` est la garde contre la double journalisation. Marquer un plat
 * mangé crée une entrée par ingrédient ; le marquer deux fois compterait deux
 * fois le repas, et rien dans les totaux ne le signalerait. La colonne porte
 * l'horodatage plutôt qu'un booléen : savoir *quand* le plat a été journalisé
 * permet de comprendre après coup une journée qui semble mal comptée.
 *
 * La clé étrangère vers `recipes` est en cascade : supprimer une recette
 * retire ce qu'elle avait de prévu. Les entrées déjà journalisées, elles, ne
 * bougent pas — elles portent leurs propres macros (AD-1) et ne référencent
 * ni le plan ni la recette.
 */
export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Jour prévu, en Europe/Paris comme le journal (AD-11). */
    planDate: date('plan_date').notNull(),
    meal: text('meal').notNull(),
    recipeId: bigint('recipe_id', { mode: 'number' })
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    /** Nombre de parts prévues, qui n'est pas celui de la recette. */
    servings: numeric('servings', { precision: 4, scale: 1 }).notNull().default('1'),
    journaledAt: timestamp('journaled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // L'utilisateur est en tête : une semaine se lit toujours pour quelqu'un.
    index('meal_plan_user_date_idx').on(table.userId, table.planDate),
    check(
      'meal_plan_meal_check',
      sql`${table.meal} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
  ],
);

export type MealPlanEntryRow = typeof mealPlanEntries.$inferSelect;
export type NewMealPlanEntryRow = typeof mealPlanEntries.$inferInsert;

/**
 * Une liste de courses, engendrée depuis le plan d'une période.
 *
 * Elle est figée à la génération et ne suit plus le plan : ajouter un plat le
 * mercredi ne doit pas réécrire la liste qu'on a sous les yeux au magasin.
 * C'est l'inverse du plan, qui lui suit les recettes — mais une liste de
 * courses est un instantané, pas une vue.
 */
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** Renseigné quand les courses sont faites. La liste reste consultable. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('shopping_lists_user_idx').on(table.userId, table.createdAt)],
);

export type ShoppingListRow = typeof shoppingLists.$inferSelect;

/**
 * Un article de la liste : un ingrédient, une quantité cumulée, un rayon.
 *
 * `userId` est porté ici en plus de la liste, comme `entries.user_id` : toute
 * lecture d'article commence par l'utilisateur, et passer par une jointure
 * pour l'établir serait à la fois plus lent et plus facile à oublier.
 *
 * `checkedBarcode` garde le code-barres du produit réellement acheté quand
 * l'article a été coché au scanner. Il ne sert pas qu'à l'archive : c'est lui
 * qui alimente `ingredient_products`, et donc les macros des prochains repas.
 */
export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    listId: bigint('list_id', { mode: 'number' })
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refKind: text('ref_kind').notNull(),
    refValue: text('ref_value').notNull(),
    label: text('label').notNull(),
    quantityG: nutrient('quantity_g').notNull(),
    /** Une des clés de AISLES, décidée à la génération et modifiable ensuite. */
    aisle: text('aisle').notNull(),
    unitName: text('unit_name'),
    unitGrams: nutrient('unit_grams'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    checkedBarcode: text('checked_barcode'),
    /** Vrai pour un article ajouté à la main, qu'aucune recette ne réclamait. */
    addedManually: boolean('added_manually').notNull().default(false),
  },
  (table) => [
    index('shopping_items_list_idx').on(table.listId, table.aisle),
    index('shopping_items_user_idx').on(table.userId),
    check(
      'shopping_items_ref_kind_check',
      sql`${table.refKind} in ('ciqual', 'product')`,
    ),
  ],
);

export type ShoppingItemRow = typeof shoppingItems.$inferSelect;

/**
 * Le produit réellement acheté pour un ingrédient donné.
 *
 * Renseignée en scannant les articles au magasin. Elle sert ensuite à
 * journaliser le steak haché de telle marque plutôt que la moyenne CIQUAL :
 * c'est la différence entre un journal approximativement juste et un journal
 * qui décrit ce qu'on a réellement mangé.
 *
 * `ingredientKey` est la référence de l'ingrédient, « ciqual:31047 », et non
 * son nom normalisé. Deux recettes qui écrivent « Poulet » et « Cuisses de
 * poulet » pour la même fiche doivent partager le même produit acheté.
 *
 * Distincte de `food_aliases`, qui lie un nom libre rendu par le modèle de
 * vision à une fiche. Les deux tables associent un nom à une cible, mais un
 * scan en caisse ne doit pas déplacer silencieusement ce que la reconnaissance
 * photo propose : deux gestes, deux intentions, deux durées de vie.
 */
export const ingredientProducts = pgTable(
  'ingredient_products',
  {
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ingredientKey: text('ingredient_key').notNull(),
    /** Code-barres du produit acheté. Sa fiche vit dans `products`. */
    barcode: text('barcode').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.ingredientKey] }),
  ],
);

export type IngredientProductRow = typeof ingredientProducts.$inferSelect;

/**
 * Le catalogue des exercices.
 *
 * Référentiel commun, sans utilisateur, comme CIQUAL et le cache produits : un
 * développé couché n'appartient à personne. Un exercice ajouté à la main entre
 * dans la même table avec `source = 'manual'`, exactement comme une fiche
 * produit saisie à la main entre dans `products`.
 *
 * `kind` décide de ce qu'une série enregistre. Un développé couché retient une
 * charge et des répétitions, un gainage une durée, un cardio une durée aussi
 * mais sans notion de série. Sans cette colonne, l'écran d'exécution
 * demanderait un poids pour une planche.
 */
export const exercises = pgTable(
  'exercises',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Identifiant stable et lisible, qui porte l'unicité et l'idempotence du seed. */
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    /** `strength`, `hold` ou `cardio`. */
    kind: text('kind').notNull(),
    /** Groupe musculaire dominant, pour lire une séance d'un coup d'œil. */
    muscleGroup: text('muscle_group'),
    /**
     * `upper`, `lower`, `core` ou `full`.
     *
     * Le groupe musculaire ne répond pas à « du haut, et un minimum de bas » :
     * il faudrait pour cela savoir de quel côté tombent les mollets et les
     * lombaires. La colonne le dit, et l'orientation devient une clause `where`
     * au lieu d'une liste de groupes recopiée dans le code.
     */
    region: text('region').notNull().default('upper'),
    /**
     * `free`, `machine`, `cable`, `bodyweight` ou `cardio`.
     *
     * C'est cette colonne qui décide si un exercice est faisable là où l'on
     * s'entraîne, et elle porte aussi la préférence entre poids libre et
     * machine guidée. Sans elle, « je veux des machines » n'aurait aucune
     * traduction en base.
     */
    equipment: text('equipment').notNull().default('machine'),
    /**
     * Rang de choix dans son groupe musculaire : 1 est l'exercice de base.
     *
     * `null` pour un exercice créé depuis un import de séance. C'est ce qui
     * l'exclut de la génération de programme : une ligne saisie au clavier un
     * soir n'a pas à se retrouver prescrite la semaine suivante, ni chez son
     * auteur ni chez les autres, le catalogue étant commun.
     */
    rank: integer('rank'),
    /**
     * Les autres noms sous lesquels l'exercice s'écrit.
     *
     * Un tableau et non une table : le catalogue tient en quelques dizaines de
     * lignes, il est lu en entier pour rapprocher une séance saisie de ses
     * exercices, et une jointure de plus ne ferait qu'alourdir cette lecture.
     */
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    /** `seed` ou `manual` : d'où vient la ligne. */
    source: text('source').notNull().default('seed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('exercises_kind_check', sql`${table.kind} in ('strength', 'hold', 'cardio')`),
    check(
      'exercises_region_check',
      sql`${table.region} in ('upper', 'lower', 'core', 'full')`,
    ),
    check(
      'exercises_equipment_check',
      sql`${table.equipment} in ('free', 'machine', 'cable', 'bodyweight', 'cardio')`,
    ),
    index('exercises_group_idx').on(table.muscleGroup, table.rank),
  ],
);

export type ExerciseRow = typeof exercises.$inferSelect;

/**
 * Les salles, et ce qu'on y trouve.
 *
 * Référentiel commun, comme les exercices : le parc de machines d'une enseigne
 * n'appartient à personne. La table existe parce qu'un programme composé sans
 * savoir où il sera exécuté prescrit des mouvements impossibles — un rowing
 * barre dans un club qui n'a pas de barre, et la séance s'arrête à la
 * deuxième ligne.
 *
 * L'inventaire est une approximation assumée : les clubs d'une même enseigne
 * ne sont pas identiques. Ne pas choisir de salle ouvre le catalogue entier,
 * ce qui reste le comportement le plus sûr quand on ne sait pas.
 */
export const gyms = pgTable('gyms', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GymRow = typeof gyms.$inferSelect;

/** Les exercices disponibles dans une salle. */
export const gymExercises = pgTable(
  'gym_exercises',
  {
    gymId: bigint('gym_id', { mode: 'number' })
      .notNull()
      .references(() => gyms.id, { onDelete: 'cascade' }),
    exerciseId: bigint('exercise_id', { mode: 'number' })
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.gymId, table.exerciseId] })],
);

export type GymExerciseRow = typeof gymExercises.$inferSelect;

/**
 * Ce que l'utilisateur a répondu sur sa salle et sur ce qu'il veut travailler.
 *
 * Une ligne par compte, comme `profiles`, et pour la même raison : ce sont des
 * réponses, pas un historique. Elles portent l'utilisateur en clé primaire, et
 * la génération d'un programme les relit à chaque fois plutôt que de figer
 * leur effet dans les séances — changer de salle doit pouvoir refaire le
 * programme sans qu'on ait à ressaisir quoi que ce soit.
 */
export const trainingPreferences = pgTable(
  'training_preferences',
  {
    userId: bigint('user_id', { mode: 'number' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `null` quand l'utilisateur ne précise pas : tout le catalogue s'ouvre. */
    gymId: bigint('gym_id', { mode: 'number' }).references(() => gyms.id, {
      onDelete: 'set null',
    }),
    /** `upper`, `lower` ou `full`. */
    focus: text('focus').notNull().default('full'),
    /** `free`, `machine` ou `any`. */
    equipment: text('equipment').notNull().default('any'),
    sessionsPerWeek: integer('sessions_per_week').notNull().default(3),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'training_preferences_focus_check',
      sql`${table.focus} in ('upper', 'lower', 'full')`,
    ),
    check(
      'training_preferences_equipment_check',
      sql`${table.equipment} in ('free', 'machine', 'any')`,
    ),
    check(
      'training_preferences_sessions_check',
      sql`${table.sessionsPerWeek} between 2 and 6`,
    ),
  ],
);

export type TrainingPreferencesRow = typeof trainingPreferences.$inferSelect;

/**
 * Une séance modèle : la séance A, B ou C du programme.
 *
 * Elle appartient à un utilisateur. Un programme d'entraînement est une donnée
 * personnelle au même titre qu'un journal alimentaire — il dit ce qu'on peut
 * soulever et à quelle fréquence on s'entraîne.
 *
 * `archivedAt` plutôt qu'une suppression : les séances déjà réalisées
 * référencent leur modèle, et effacer celui-ci ferait perdre le nom de ce
 * qu'on a fait pendant six mois.
 */
export const workoutTemplates = pgTable(
  'workout_templates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Rang dans le programme : la séance A avant la B. */
    position: integer('position').notNull().default(0),
    notes: text('notes'),
    /**
     * `program`, `custom` ou `adhoc` : d'où vient la séance.
     *
     * `program` est composé depuis les préférences et remplacé en bloc quand
     * on le recompose. `custom` est écrit par l'utilisateur, en touchant des
     * exercices ou en retenant une séance faite ; la recomposition ne le touche
     * pas. `adhoc` porte une séance libre ou lancée sans être gardée : il donne
     * à l'écran d'exécution la liste d'exercices qu'il attend, et ne s'affiche
     * nulle part ailleurs.
     */
    kind: text('kind').notNull().default('program'),
    /**
     * Rangée dans les favoris, relancée d'un appui depuis l'accueil.
     *
     * Une séance `custom` l'est toujours ; une séance du programme peut l'être,
     * et elle sort alors du programme sans disparaître quand on le recompose.
     */
    favorite: boolean('favorite').notNull().default(false),
    /**
     * La séance faite dont celle-ci est la copie, quand elle a été retenue
     * depuis l'historique. Sert à dire « déjà dans tes favoris » plutôt que
     * d'en créer une seconde au deuxième appui.
     */
    sourceSessionId: bigint('source_session_id', { mode: 'number' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workout_templates_user_idx').on(table.userId, table.position),
    check(
      'workout_templates_kind_check',
      sql`${table.kind} in ('program', 'custom', 'adhoc')`,
    ),
  ],
);

export type WorkoutTemplateRow = typeof workoutTemplates.$inferSelect;

/**
 * Un exercice dans une séance modèle, avec ce qu'il prescrit.
 *
 * Les répétitions sont une fourchette et non un nombre : « 4x8-10 » est la
 * forme dans laquelle un programme s'écrit réellement, et l'aplatir à 8 ou à
 * 10 perdrait la marge de progression qui en est tout l'objet. Une valeur
 * unique s'écrit avec les deux bornes égales.
 *
 * `targetSeconds` couvre le gainage et le cardio sans inventer un second
 * modèle de séance. `supersetGroup` relie deux exercices enchaînés sans repos :
 * le curl et l'extension triceps de la séance C portent le même numéro.
 */
export const workoutTemplateExercises = pgTable(
  'workout_template_exercises',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: bigint('exercise_id', { mode: 'number' })
      .notNull()
      .references(() => exercises.id),
    targetSets: integer('target_sets').notNull().default(3),
    targetRepsMin: integer('target_reps_min'),
    targetRepsMax: integer('target_reps_max'),
    targetSeconds: integer('target_seconds'),
    supersetGroup: integer('superset_group'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
  },
  (table) => [index('workout_template_exercises_idx').on(table.templateId, table.position)],
);

export type WorkoutTemplateExerciseRow = typeof workoutTemplateExercises.$inferSelect;

/**
 * Une séance réalisée, ou en cours.
 *
 * `templateId` est nullable : une séance improvisée reste une séance, et
 * refuser de l'enregistrer parce qu'elle ne suit aucun modèle ferait perdre la
 * seule trace de ce qui a été soulevé ce jour-là.
 *
 * `finishedAt` nul signifie une séance ouverte. C'est ce qui permet de la
 * retrouver telle qu'on l'a laissée en rouvrant l'application entre deux
 * séries — ce qui est le cas nominal, pas l'exception.
 */
export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: bigint('template_id', { mode: 'number' }).references(
      () => workoutTemplates.id,
      { onDelete: 'set null' },
    ),
    /** Jour de la séance, en Europe/Paris comme le journal (AD-11). */
    sessionDate: date('session_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    notes: text('notes'),
    /**
     * Ce que les abonnés voient de la séance : `private`, `summary` ou
     * `detailed`. Privée par défaut, et réglée séance par séance : partager
     * sa séance de jambes n'engage pas à partager toutes les autres.
     */
    visibility: text('visibility').notNull().default('private'),
  },
  (table) => [
    index('workout_sessions_user_date_idx').on(table.userId, table.sessionDate),
    check(
      'workout_sessions_visibility_check',
      sql`${table.visibility} in ('private', 'summary', 'detailed')`,
    ),
  ],
);

export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;

/**
 * Une série réalisée. C'est la donnée que le module existe pour retenir.
 *
 * `userId` est dénormalisé comme `entries.user_id`. « Qu'est-ce que j'ai
 * soulevé la dernière fois » est la requête la plus fréquente du module, celle
 * qui s'affiche sous chaque série avant qu'on la commence, et elle doit partir
 * de l'utilisateur sans passer par une jointure sur la séance.
 *
 * Les trois mesures sont nullables parce qu'aucune n'est universelle : une
 * série de développé couché porte une charge et des répétitions, une planche
 * une durée, une traction au poids du corps des répétitions sans charge.
 */
export const workoutSets = pgTable(
  'workout_sets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: bigint('session_id', { mode: 'number' })
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: bigint('exercise_id', { mode: 'number' })
      .notNull()
      .references(() => exercises.id),
    /** Rang de l'exercice dans la séance, recopié du modèle. */
    position: integer('position').notNull(),
    /** Numéro de la série pour cet exercice, à partir de 1. */
    setIndex: integer('set_index').notNull(),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    reps: integer('reps'),
    seconds: integer('seconds'),
    /**
     * La série est allée jusqu'à l'échec musculaire.
     *
     * C'est la notation qu'on porte déjà sur un carnet, et elle change la
     * lecture de la semaine suivante : « 6 répétitions » et « 6 répétitions à
     * l'échec » ne demandent pas la même charge. La perdre à l'import
     * reviendrait à noter une série plus facile qu'elle ne l'a été.
     */
    toFailure: boolean('to_failure').notNull().default(false),
    doneAt: timestamp('done_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // L'historique par exercice : l'utilisateur d'abord, puis l'exercice, puis
    // la date. C'est exactement l'ordre de la question posée.
    index('workout_sets_user_exercise_idx').on(table.userId, table.exerciseId, table.doneAt),
    unique('workout_sets_session_exercise_set_key').on(
      table.sessionId,
      table.exerciseId,
      table.setIndex,
    ),
  ],
);

export type WorkoutSetRow = typeof workoutSets.$inferSelect;

/**
 * Les « bravo » laissés sous une séance partagée. Un par personne et par
 * séance : c'est un signe, pas un compteur qu'on fait monter.
 */
export const sessionKudos = pgTable(
  'session_kudos',
  {
    sessionId: bigint('session_id', { mode: 'number' })
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.userId] })],
);

/**
 * Les signalements d'une personne ou d'une de ses séances, à l'équipe qui
 * modère (`npm run moderation`).
 *
 * Un même signalement n'est compté qu'une fois : le rejouer ne le duplique
 * pas. La séance est oubliée si elle est supprimée, le signalement reste sur
 * la personne ; il part avec l'un ou l'autre compte.
 *
 * L'unicité laisse les `null` distincts, exprès : une séance supprimée passe
 * à `null`, et ne doit pas buter sur un signalement de la personne seule. Ces
 * derniers sont dédoublonnés à l'écriture (`insertReport`).
 */
export const socialReports = pgTable(
  'social_reports',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    reporterId: bigint('reporter_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reportedUserId: bigint('reported_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: bigint('session_id', { mode: 'number' }).references(() => workoutSessions.id, {
      onDelete: 'set null',
    }),
    /** `ReportReason`, voir `@/lib/social`. */
    reason: text('reason').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Posée par la modération une fois le signalement traité. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    unique('social_reports_once').on(table.reporterId, table.reportedUserId, table.sessionId),
    index('social_reports_open_idx').on(table.resolvedAt, table.createdAt),
    check(
      'social_reports_reason_check',
      sql`${table.reason} in (${sql.raw(REPORT_REASONS.map((reason) => `'${reason}'`).join(', '))})`,
    ),
    check('social_reports_not_self_check', sql`${table.reporterId} <> ${table.reportedUserId}`),
  ],
);

/**
 * Les exercices mis en favori, qui passent en tête des listes de choix.
 *
 * Une table de liaison et non un tableau sur l'utilisateur : le catalogue est
 * commun, et la suppression d'un exercice doit emporter ses favoris sans qu'on
 * ait à les chercher.
 */
export const favoriteExercises = pgTable(
  'favorite_exercises',
  {
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: bigint('exercise_id', { mode: 'number' })
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.exerciseId] })],
);

/**
 * Les pesées, une par jour au plus.
 *
 * Le profil ne garde que le dernier poids, celui qui sert au calcul de la
 * cible. Or la seule question qui compte sur trois semaines — est-ce que le
 * poids suit l'objectif ? — demande la suite des pesées, pas la dernière.
 * Une nouvelle pesée le même jour remplace la précédente : on se pèse deux
 * fois quand la première était habillée, pas pour avoir deux mesures.
 */
export const weightLogs = pgTable(
  'weight_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Jour de la pesée, en Europe/Paris comme le journal (AD-11). */
    day: date('day').notNull(),
    weightKg: numeric('weight_kg', { precision: 5, scale: 1 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('weight_logs_user_day_key').on(table.userId, table.day),
    check('weight_logs_weight_check', sql`${table.weightKg} between 30 and 300`),
  ],
);

export type WeightLogRow = typeof weightLogs.$inferSelect;

/**
 * Un repas enregistré pour être refait d'un appui.
 *
 * Les aliments sont figés dans la ligne, macros comprises, exactement comme
 * une entrée du journal (AD-1) : le petit-déjeuner qu'on a mis en favori est
 * celui qu'on a mangé, et une fiche produit corrigée depuis ne doit pas le
 * changer en douce.
 *
 * Un tableau JSON et non une table d'éléments : le favori se lit et s'écrit
 * toujours en entier, jamais élément par élément, et une jointure de plus ne
 * servirait qu'à le reconstituer.
 */
export const favoriteMeals = pgTable(
  'favorite_meals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Le repas d'où il vient, proposé par défaut quand on le refait. */
    meal: text('meal').notNull(),
    /** `FavoriteItem[]`, voir `@/lib/favorites`. */
    items: jsonb('items').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('favorite_meals_user_idx').on(table.userId, table.createdAt),
    check(
      'favorite_meals_meal_check',
      sql`${table.meal} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
  ],
);

export type FavoriteMealRow = typeof favoriteMeals.$inferSelect;

/**
 * Jetons de réinitialisation du mot de passe envoyés par courriel.
 *
 * Seule l'empreinte SHA-256 du jeton est stockée : une fuite de la table ne
 * doit pas donner de quoi prendre un compte. Le jeton est long et aléatoire,
 * un hachage lent n'ajouterait rien. Il expire vite et ne sert qu'une fois.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_reset_tokens_user_idx').on(table.userId)],
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;

/**
 * Les abonnements aux notifications, un par appareil.
 *
 * L'adresse du service de notification est unique : un même téléphone qui se
 * réabonne remplace sa ligne au lieu d'en ajouter une, et recevrait sinon le
 * rappel en double.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/**
 * Les abonnements achetés dans un magasin d'applications, un par achat.
 *
 * Le jeton d'achat est unique : c'est l'identité de l'achat chez Google (le
 * jeton d'achat) ou chez Apple (l'identifiant de la transaction d'origine),
 * et le premier compte qui le présente le garde. Un même jeton envoyé depuis
 * un autre compte est refusé, sans quoi un abonnement se partagerait en se
 * passant le jeton.
 *
 * L'état et l'échéance sont recopiés depuis le magasin, jamais depuis le
 * téléphone : chaque écriture suit une lecture de l'API Google Play Developer
 * ou de l'App Store Server API. La ligne survit à l'expiration, elle sert de
 * trace et permet de reconnaître un renouvellement.
 */
export const storeSubscriptions = pgTable(
  'store_subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `Store`, voir `@/lib/premium`. */
    store: text('store').notNull().default('google_play'),
    productId: text('product_id').notNull(),
    purchaseToken: text('purchase_token').notNull().unique(),
    /** `StoreState`, voir `@/lib/premium`. */
    state: text('state').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    autoRenewing: boolean('auto_renewing').notNull().default(false),
    acknowledged: boolean('acknowledged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('store_subscriptions_user_idx').on(table.userId, table.expiresAt),
    check(
      'store_subscriptions_store_check',
      sql`${table.store} in (${sql.raw(STORES.map((store) => `'${store}'`).join(', '))})`,
    ),
  ],
);

export type StoreSubscriptionRow = typeof storeSubscriptions.$inferSelect;

/**
 * Les achats uniques (Cuisine+, décision du 05/10/2026), un par achat.
 *
 * Mêmes règles que les abonnements : la référence d'achat est unique et le
 * premier compte qui la présente la garde ; l'état est recopié depuis le
 * magasin. Un remboursement passe l'état à `refunded`, ce qui retire le droit
 * sans effacer la trace.
 */
export const storePurchases = pgTable(
  'store_purchases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `Store`, voir `@/lib/premium`. */
    store: text('store').notNull(),
    productId: text('product_id').notNull(),
    purchaseToken: text('purchase_token').notNull().unique(),
    /** `PurchaseState`, voir `@/lib/premium`. */
    state: text('state').notNull(),
    acknowledged: boolean('acknowledged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('store_purchases_user_idx').on(table.userId),
    check(
      'store_purchases_store_check',
      sql`${table.store} in (${sql.raw(STORES.map((store) => `'${store}'`).join(', '))})`,
    ),
    check(
      'store_purchases_state_check',
      sql`${table.state} in (${sql.raw(PURCHASE_STATES.map((state) => `'${state}'`).join(', '))})`,
    ),
  ],
);

export type StorePurchaseRow = typeof storePurchases.$inferSelect;

/**
 * Mesure d'usage (étape « mesurer », 01/10/2026). Une ligne par compte, par
 * jour et par événement, avec un compteur : rien de plus fin que la journée,
 * et aucune donnée du repas. Voir `@/lib/usage` pour ce qui est compté.
 *
 * Supprimée avec le compte, et rendue dans l'export : c'est une donnée sur la
 * personne, même réduite à des compteurs.
 */
export const usageDays = pgTable(
  'usage_days',
  {
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Jour en Europe/Paris, comme le journal (AD-11). */
    day: date('day').notNull(),
    event: text('event').notNull(),
    count: integer('count').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.day, table.event] }),
    // Le rapport lit par jour, tous comptes confondus : la clé, qui commence
    // par le compte, ne le sert pas.
    index('usage_days_day_idx').on(table.day, table.event),
    check(
      'usage_days_event_check',
      sql`${table.event} in (${sql.raw(USAGE_EVENTS.map((event) => `'${event}'`).join(', '))})`,
    ),
  ],
);
