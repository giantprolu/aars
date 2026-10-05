package fr.nutriperso.app.data

import kotlinx.serialization.Serializable

/*
 * Formes JSON de l'API (apps/web/src/app/api). Seuls les champs lus par l'app
 * sont déclarés : le décodeur ignore le reste, et un champ ajouté côté serveur
 * ne casse rien.
 */

@Serializable
data class MacroValues(
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
)

@Serializable
data class Entry(
    val id: Long,
    val entryDate: String,
    val meal: String,
    val foodLabel: String,
    val quantityG: Double,
    val macros: MacroValues,
    val sourceKind: String,
    val sourceRef: String? = null,
)

@Serializable
data class DayTarget(
    val targetKcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val trainingDay: Boolean? = null,
    val cycleKcal: Double = 0.0,
)

@Serializable
data class WeekDayKcal(val day: String, val kcal: Double)

/** La séance mise en avant : ouverte (`open`), ou la suivante du programme (`next`). */
@Serializable
data class QuickSession(
    val kind: String,
    val name: String,
    val sessionId: Long? = null,
    val templateId: Long? = null,
    val setCount: Int? = null,
    val exerciseCount: Int? = null,
)

@Serializable
data class PlannedMeal(
    val planId: Long,
    val meal: String,
    val name: String,
    val kcal: Double? = null,
    val servings: Double,
    val eaten: Boolean,
)

@Serializable
data class WeightSummary(
    val latestKg: Double,
    val latestDay: String,
    val changeKg: Double? = null,
    val weeks: List<Double?> = emptyList(),
)

@Serializable
data class ActivitySummary(
    val activeKcal: Double? = null,
    val sessionsDone: Int = 0,
    val sessionsPlanned: Int = 0,
)

@Serializable
data class Identity(val handle: String? = null, val displayName: String? = null)

@Serializable
data class TodayResponse(
    val today: String,
    val isoWeek: Int,
    val identity: Identity,
    val totals: MacroValues,
    val target: DayTarget? = null,
    val week: List<WeekDayKcal> = emptyList(),
    val entries: List<Entry> = emptyList(),
    val session: QuickSession? = null,
    val plannedMeal: PlannedMeal? = null,
    val weight: WeightSummary? = null,
    val activity: ActivitySummary = ActivitySummary(),
)

@Serializable
data class QuickFavorite(val id: Long, val name: String)

@Serializable
data class FavoritesResponse(val favorites: List<QuickFavorite> = emptyList())

@Serializable
data class RecentFood(val entryId: Long, val label: String, val quantityG: Double, val kcal: Double)

@Serializable
data class WeighIn(val day: String, val weightKg: Double)

@Serializable
data class QuickAddContext(
    val favorites: List<QuickFavorite> = emptyList(),
    val recents: List<RecentFood> = emptyList(),
    val session: QuickSession? = null,
    val lastWeighIn: WeighIn? = null,
)

@Serializable
data class SearchHit(
    val kind: String,
    val ref: String,
    val name: String,
    val per100g: MacroValues,
    val servingSizeG: Double? = null,
    val origin: String = "ciqual",
)

@Serializable
data class SearchResponse(val hits: List<SearchHit> = emptyList())

/** Fiche produit en cache, lue par code-barres. */
@Serializable
data class CachedProduct(
    val ref: String,
    val name: String,
    val per100g: MacroValues,
    val servingSizeG: Double? = null,
)

@Serializable
data class ProductResponse(val product: CachedProduct)

@Serializable
data class SessionResponse(val ok: Boolean = false, val token: String? = null)

@Serializable
data class ApiErrorDetail(val code: String, val message: String)

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail)

@Serializable
data class BodyProfile(
    val sex: String,
    val birthDate: String,
    val heightCm: Int,
    val weightKg: Double,
    val bodyFatPercent: Double?,
    val activity: String,
    val goal: String,
    val ratePercentPerWeek: Double,
    val manualTargetKcal: Int?,
)

@Serializable
data class EnergyTarget(
    val bmrKcal: Double,
    val maintenanceKcal: Double,
    val adjustmentKcal: Double,
    val targetKcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val floored: Boolean = false,
)

@Serializable
data class ProfileResponse(val profile: BodyProfile? = null, val target: EnergyTarget? = null)

@Serializable
data class TargetResponse(val target: EnergyTarget)

@Serializable
data class Gym(val id: Long, val name: String, val note: String? = null)

@Serializable
data class TrainingPreferences(
    val gymId: Long? = null,
    val focus: String = "full",
    val equipment: String = "any",
    val sessionsPerWeek: Int = 3,
)

@Serializable
data class PreferencesResponse(val preferences: TrainingPreferences, val gyms: List<Gym> = emptyList())

@Serializable
data class ExerciseRef(val name: String)

@Serializable
data class TemplateExercise(val exercise: ExerciseRef)

@Serializable
data class WorkoutTemplate(
    val id: Long,
    val name: String,
    val kind: String,
    val exercises: List<TemplateExercise> = emptyList(),
)

@Serializable
data class TemplatesResponse(val templates: List<WorkoutTemplate> = emptyList())

// Corps de requête.

@Serializable
data class Credentials(val email: String, val password: String)

@Serializable
data class MealBody(val meal: String)

@Serializable
data class WeighInBody(val weightKg: Double)

@Serializable
data class RepeatBody(val entryId: Long, val meal: String)

@Serializable
data class NewEntryBody(
    val foodLabel: String,
    val per100g: MacroValues,
    val quantityG: Int,
    val sourceKind: String,
    val sourceRef: String?,
    val meal: String,
    /** `search` ou `barcode`, pour la mesure d'usage. Sans effet sur l'entrée. */
    val via: String? = null,
)

@Serializable
data class CacheProductBody(
    val barcode: String,
    val name: String,
    val per100g: MacroValues,
    val servingSizeG: Double?,
    val source: String,
)

@Serializable
data class IdentityBody(val handle: String, val displayName: String?)

@Serializable
data class GenerateBody(val action: String = "generate")

@Serializable
data class ActionBody(val action: String)

// Cuisine.

@Serializable
data class PlannedRow(
    val id: Long,
    val planDate: String,
    val meal: String,
    val recipeId: Long,
    val recipeName: String,
    val servings: Double,
    val journaledAt: String? = null,
)

@Serializable
data class PlanResponse(val planned: List<PlannedRow> = emptyList())

@Serializable
data class BasketRow(
    val id: Long,
    val recipeId: Long,
    val recipeName: String,
    val servings: Double,
    val plannedServings: Double,
)

@Serializable
data class BasketResponse(val basket: List<BasketRow> = emptyList())

@Serializable
data class ShoppingItemRow(
    val id: Long,
    val refKind: String,
    val refValue: String,
    val label: String,
    val aisle: String,
    val aisleLabel: String,
    val quantityLabel: String,
    val checkedAt: String? = null,
)

@Serializable
data class ShoppingListRow(val id: Long, val items: List<ShoppingItemRow> = emptyList())

@Serializable
data class ShoppingResponse(val weekStart: String, val list: ShoppingListRow? = null)

@Serializable
data class RecipeRow(
    val id: Long,
    val name: String,
    val servings: Double,
    val prepMinutes: Int? = null,
    val kcalPerServing: Double = 0.0,
    /** Photo du plat du catalogue ; absente pour une recette écrite à la main. */
    val imageUrl: String? = null,
)

@Serializable
data class RecipesResponse(val recipes: List<RecipeRow> = emptyList())

@Serializable
data class PlanMealBody(val planDate: String, val meal: String, val recipeId: Long, val servings: Double)

@Serializable
data class BasketRecipeBody(
    val source: String = "recipe",
    val weekStart: String,
    val recipeId: Long,
    val servings: Double,
)

@Serializable
data class CheckItemBody(val checked: Boolean, val barcode: String? = null, val refKind: String, val refValue: String)

// Sport.

@Serializable
data class OpenSessionRow(val id: Long, val name: String, val setCount: Int)

@Serializable
data class PlannedExercise(val name: String, val target: String)

@Serializable
data class NextTemplate(val id: Long, val name: String, val exercises: List<PlannedExercise> = emptyList())

@Serializable
data class TemplateRow(val id: Long, val name: String, val kind: String, val favorite: Boolean, val exerciseCount: Int)

@Serializable
data class SessionRow(
    val id: Long,
    val name: String,
    val sessionDate: String,
    val durationSeconds: Long? = null,
    val volumeKg: Double,
    val record: Boolean,
)

@Serializable
data class TrainingHome(
    val isoWeek: Int,
    val weekSessions: Int,
    val sessionsPerWeek: Int,
    val weekVolumeKg: Double,
    val volumeChange: Int? = null,
    val records: List<String> = emptyList(),
    val openSession: OpenSessionRow? = null,
    val next: NextTemplate? = null,
    val templates: List<TemplateRow> = emptyList(),
    val history: List<SessionRow> = emptyList(),
)

@Serializable
data class WeekVolume(val weekStart: String, val volumeKg: Double, val sessions: Int)

@Serializable
data class ExerciseProgressRow(
    val id: Long,
    val name: String,
    val value: String,
    val change: String? = null,
    val progressed: Boolean,
)

@Serializable
data class ProgressResponse(
    val period: Int,
    val weeks: List<WeekVolume> = emptyList(),
    val weights: List<Double?> = emptyList(),
    val sessions: Int,
    val volumeChange: Int? = null,
    val weightChangeKg: Double? = null,
    val exercises: List<ExerciseProgressRow> = emptyList(),
)

// Communauté.

@Serializable
data class FollowedPerson(val id: Long, val handle: String, val displayName: String? = null, val recent: Boolean)

@Serializable
data class BoardRow(
    val id: Long,
    val handle: String,
    val displayName: String? = null,
    val sessions: Int,
    val mine: Boolean,
)

@Serializable
data class SocialHome(
    val identity: Identity,
    val following: List<FollowedPerson> = emptyList(),
    val pendingRequests: Int = 0,
    val requests: List<PublicPerson> = emptyList(),
    val followers: List<PublicPerson> = emptyList(),
    val requested: List<PublicPerson> = emptyList(),
    val board: List<BoardRow> = emptyList(),
    /** Ceux que j'ai bloqués, pour pouvoir les débloquer. */
    val blocked: List<PublicPerson> = emptyList(),
)

@Serializable
data class PublicPerson(val id: Long, val handle: String, val displayName: String? = null)

@Serializable
data class SharedSet(val weightKg: Double? = null, val reps: Int? = null, val seconds: Int? = null)

@Serializable
data class SharedExercise(val name: String, val sets: List<SharedSet> = emptyList())

@Serializable
data class FeedSession(
    val id: Long,
    val author: PublicPerson,
    val name: String,
    val sessionDate: String,
    val startedAt: String,
    val durationSeconds: Long? = null,
    val volumeKg: Double,
    val setCount: Int,
    val exercises: List<SharedExercise> = emptyList(),
    val kudos: Int,
    val kudoedByMe: Boolean,
    val mine: Boolean,
)

@Serializable
data class FeedResponse(val sessions: List<FeedSession> = emptyList(), val next: Long? = null)

@Serializable
data class KudosBody(val sessionId: Long, val given: Boolean)

/** Un signalement : une personne, ou une de ses séances, et pourquoi. */
@Serializable
data class ReportBody(val userId: Long, val sessionId: Long?, val reason: String, val note: String?)

// Moi.

@Serializable
data class MeResponse(
    val identity: Identity,
    val gym: String? = null,
    val sessionsPerWeek: Int,
    val weekAverageKg: Double? = null,
    val weightChangeKg: Double? = null,
    val weights: List<Double?> = emptyList(),
    val lastWeighIn: WeighIn? = null,
    val recordsThisMonth: Int,
    val topRecord: String? = null,
    val activeWeeks: Int,
    val weeks: Int,
    val health: String,
    val healthBridge: HealthBridge? = null,
)

/** État du pont Santé, mêmes seuils que le calcul de la cible (`bridgeStatus`). */
@Serializable
data class HealthBridge(
    val lastDay: String? = null,
    val lastKcal: Double? = null,
    val dayCount: Int = 0,
    val typicalKcal: Double = 0.0,
    val peakKcal: Double = 0.0,
    val requiredDays: Int = 3,
)

// Santé.

@Serializable
data class ActivityDay(val day: String, val activeKcal: Double)

@Serializable
data class ActivityBatch(val days: List<ActivityDay>, val source: String = "health")

// Séance en cours.

@Serializable
data class StartSessionBody(val templateId: Long? = null, val free: Boolean = false)

@Serializable
data class StartedSession(val id: Long, val alreadyOpen: Boolean = false)

@Serializable
data class RunnerSet(
    val setIndex: Int,
    val done: Boolean,
    val weightKg: Double? = null,
    val reps: Int? = null,
    val seconds: Int? = null,
    val toFailure: Boolean = false,
)

@Serializable
data class RunnerSuggestion(val reason: String, val trend: String)

@Serializable
data class RunnerExercise(
    val position: Int,
    val entryId: Long,
    val exerciseId: Long,
    val name: String,
    val kind: String,
    val prescription: String,
    val restSeconds: Int? = null,
    val suggestion: RunnerSuggestion? = null,
    val previous: String? = null,
    val recordSetIndex: Int? = null,
    val sets: List<RunnerSet> = emptyList(),
)

@Serializable
data class VisibilityOption(val value: String, val label: String, val note: String)

@Serializable
data class CatalogExercise(val id: Long, val name: String, val kind: String = "strength", val muscleGroup: String? = null)

@Serializable
data class Runner(
    val id: Long,
    val name: String,
    val startedAt: String,
    val finishedAt: String? = null,
    val closed: Boolean,
    val visibility: String,
    val favorited: Boolean,
    val canAddExercise: Boolean,
    val plannedSets: Int,
    val recordedSets: Int,
    val volumeKg: Double,
    val visibilities: List<VisibilityOption> = emptyList(),
    val exercises: List<RunnerExercise> = emptyList(),
    val catalog: List<CatalogExercise> = emptyList(),
)

@Serializable
data class SetBody(
    val sessionId: Long,
    val exerciseId: Long,
    val position: Int,
    val setIndex: Int,
    val weightKg: Double?,
    val reps: Int?,
    val seconds: Int?,
    val toFailure: Boolean,
)

@Serializable
data class VisibilityBody(val visibility: String)

@Serializable
data class ExerciseIdBody(val exerciseId: Long)

@Serializable
data class NameBody(val name: String? = null)

@Serializable
data class ExercisesResponse(val exercises: List<CatalogExercise> = emptyList(), val favoriteIds: List<Long> = emptyList())

@Serializable
data class ComposedExercise(val exerciseId: Long, val sets: Int, val reps: Int?, val seconds: Int?)

@Serializable
data class ComposeBody(val name: String?, val exercises: List<ComposedExercise>, val keep: Boolean, val start: Boolean)

@Serializable
data class ComposeResponse(val templateId: Long, val sessionId: Long? = null)

@Serializable
data class AnalyseBody(val action: String = "analyse", val text: String)

@Serializable
data class ParsedSet(val reps: Int? = null, val seconds: Int? = null, val weightKg: Double? = null, val toFailure: Boolean = false)

@Serializable
data class AnalysedCandidate(val id: Long, val name: String)

@Serializable
data class AnalysedLine(
    val raw: String,
    val name: String,
    val sets: List<ParsedSet> = emptyList(),
    val warning: String = "none",
    val matchedExerciseId: Long? = null,
    val candidates: List<AnalysedCandidate> = emptyList(),
)

@Serializable
data class AnalyseResponse(val lines: List<AnalysedLine> = emptyList())

@Serializable
data class WrittenLine(val exerciseId: Long?, val name: String, val sets: List<ParsedSet>)

@Serializable
data class SaveLogBody(val action: String = "save", val sessionDate: String, val lines: List<WrittenLine>)

@Serializable
data class SavedLog(val id: Long)

// Code-barres.

@Serializable
data class PartialMacros(
    val kcal: Double? = null,
    val proteinG: Double? = null,
    val carbsG: Double? = null,
    val fatG: Double? = null,
)

@Serializable
data class PartialProduct(
    val barcode: String,
    val name: String? = null,
    val per100g: PartialMacros = PartialMacros(),
    val servingSizeG: Double? = null,
)

@Serializable
data class ResolveResponse(
    val kind: String,
    val product: CachedProduct? = null,
    val partial: PartialProduct? = null,
)

// Historique.

@Serializable
data class DayTotals(val entryDate: String, val macros: MacroValues, val entryCount: Int = 0)

@Serializable
data class HistoryResponse(val days: List<DayTotals> = emptyList())

@Serializable
data class JournalDay(val totals: DayTotals, val entries: List<Entry> = emptyList())

@Serializable
data class FavoriteBody(val meal: String, val name: String? = null)

@Serializable
data class FoundPerson(val id: Long, val handle: String, val displayName: String? = null, val state: String = "none")

@Serializable
data class PeopleResponse(val people: List<FoundPerson> = emptyList())

@Serializable
data class RelationBody(val action: String, val userId: Long)

// Cuisine, écritures.

@Serializable
data class FromBody(val from: String)

@Serializable
data class AddItemBody(val from: String, val refKind: String, val refValue: String, val label: String, val quantityG: Int)

@Serializable
data class ScanMatch(val barcode: String, val productName: String? = null, val suggestedItemId: Long? = null)

@Serializable
data class IngredientBody(
    val refKind: String,
    val refValue: String,
    val label: String,
    val quantityG: Int,
    val unitName: String? = null,
    val unitGrams: Double? = null,
)

@Serializable
data class RecipeCreateBody(
    val action: String = "create",
    val name: String,
    val servings: Double,
    val steps: List<String>,
    val prepMinutes: Int?,
    val notes: String?,
    val ingredients: List<IngredientBody>,
    /** Vrai pour une recette venue de l'import (Cuisine+) : elle ne compte pas dans la limite gratuite. */
    val imported: Boolean? = null,
)

// Cuisine+.

@Serializable
data class FillWeekBody(val weekStart: String)

/** « Remplir la semaine » : ce qui a été posé, et ce qui a rejoint le panier pour y parvenir. */
@Serializable
data class FillWeekResponse(val placed: Int, val added: List<String> = emptyList(), val empty: Int = 0)

@Serializable
data class ImportRecipeBody(val url: String)

/** Un ingrédient du brouillon : la ligne de la page, la fiche trouvée, le poids s'il est connu. */
@Serializable
data class DraftIngredient(val line: String, val hit: SearchHit, val quantityG: Double? = null)

/** Une recette lue sur une page, à relire dans l'éditeur avant de l'enregistrer. */
@Serializable
data class RecipeDraft(
    val name: String,
    val servings: Double,
    val prepMinutes: Int? = null,
    val steps: List<String> = emptyList(),
    val ingredients: List<DraftIngredient> = emptyList(),
    val unmatched: List<String> = emptyList(),
)

@Serializable
data class RecipeDraftResponse(val draft: RecipeDraft)

// Achats.

@Serializable
data class BillingProducts(
    /** L'abonnement mensuel, par magasin : `google_play` pour Android. */
    val subscription: Map<String, String> = emptyMap(),
    val kitchenPlus: String? = null,
    val kitchenPlusOnSale: Boolean = false,
)

@Serializable
data class BillingResponse(
    val premium: Boolean = false,
    val kitchenPlus: Boolean = false,
    val expiresAt: String? = null,
    /** À passer à Google Play au moment de l'achat : il lie l'achat au compte. */
    val accountRef: String? = null,
    val products: BillingProducts? = null,
)

@Serializable
data class BillingStatus(val premium: Boolean = false, val kitchenPlus: Boolean = false, val expiresAt: String? = null)

@Serializable
data class GooglePurchaseBody(val purchaseToken: String, val productId: String?)

// Compte.

@Serializable
data class RecoverBody(val email: String, val code: String, val password: String)

@Serializable
data class PasswordBody(val password: String)

@Serializable
data class RecoveryCodeResponse(val code: String)
