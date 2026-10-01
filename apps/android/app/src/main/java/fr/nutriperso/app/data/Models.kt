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
