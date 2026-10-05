import Foundation

/*
 * Formes JSON de l'API (apps/web/src/app/api), mêmes noms que l'app Android
 * (data/Models.kt). Seuls les champs lus par l'app sont déclarés : le décodeur
 * ignore le reste, et un champ ajouté côté serveur ne casse rien.
 */

struct MacroValues: Codable, Sendable {
    @Default<Zero> var kcal: Double
    @Default<Zero> var proteinG: Double
    @Default<Zero> var carbsG: Double
    @Default<Zero> var fatG: Double
}

struct Entry: Codable, Sendable, Identifiable {
    let id: Int
    let entryDate: String
    let meal: String
    let foodLabel: String
    let quantityG: Double
    let macros: MacroValues
    let sourceKind: String
    let sourceRef: String?
}

struct DayTarget: Codable, Sendable {
    let targetKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let trainingDay: Bool?
    @Default<Zero> var cycleKcal: Double
}

struct WeekDayKcal: Codable, Sendable {
    let day: String
    let kcal: Double
}

/// La séance mise en avant : ouverte (`open`), ou la suivante du programme (`next`).
struct QuickSession: Codable, Sendable {
    let kind: String
    let name: String
    let sessionId: Int?
    let templateId: Int?
    let setCount: Int?
    let exerciseCount: Int?
}

struct PlannedMeal: Codable, Sendable {
    let planId: Int
    let meal: String
    let name: String
    let kcal: Double?
    let servings: Double
    let eaten: Bool
}

struct WeightSummary: Codable, Sendable {
    let latestKg: Double
    let latestDay: String
    let changeKg: Double?
    @Default<Empty<Double?>> var weeks: [Double?]
}

struct ActivitySummary: Codable, Sendable {
    let activeKcal: Double?
    @Default<ZeroInt> var sessionsDone: Int
    @Default<ZeroInt> var sessionsPlanned: Int
}

enum NoActivity: DefaultProvider {
    static var value: ActivitySummary { ActivitySummary(activeKcal: nil, sessionsDone: 0, sessionsPlanned: 0) }
}

struct Identity: Codable, Sendable {
    let handle: String?
    let displayName: String?
}

struct TodayResponse: Codable, Sendable {
    let today: String
    let isoWeek: Int
    let identity: Identity
    let totals: MacroValues
    let target: DayTarget?
    @Default<Empty<WeekDayKcal>> var week: [WeekDayKcal]
    @Default<Empty<Entry>> var entries: [Entry]
    let session: QuickSession?
    let plannedMeal: PlannedMeal?
    let weight: WeightSummary?
    @Default<NoActivity> var activity: ActivitySummary
}

struct QuickFavorite: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
}

struct FavoritesResponse: Codable, Sendable {
    @Default<Empty<QuickFavorite>> var favorites: [QuickFavorite]
}

struct RecentFood: Codable, Sendable {
    let entryId: Int
    let label: String
    let quantityG: Double
    let kcal: Double
}

struct WeighIn: Codable, Sendable {
    let day: String
    let weightKg: Double
}

struct QuickAddContext: Codable, Sendable {
    @Default<Empty<QuickFavorite>> var favorites: [QuickFavorite]
    @Default<Empty<RecentFood>> var recents: [RecentFood]
    let session: QuickSession?
    let lastWeighIn: WeighIn?
}

enum CiqualOrigin: DefaultProvider {
    static var value: String { "ciqual" }
}

struct SearchHit: Codable, Sendable {
    let kind: String
    let ref: String
    let name: String
    let per100g: MacroValues
    let servingSizeG: Double?
    @Default<CiqualOrigin> var origin: String
}

struct SearchResponse: Codable, Sendable {
    @Default<Empty<SearchHit>> var hits: [SearchHit]
}

/// Fiche produit en cache, lue par code-barres.
struct CachedProduct: Codable, Sendable {
    let ref: String
    let name: String
    let per100g: MacroValues
    let servingSizeG: Double?
}

struct ProductResponse: Codable, Sendable {
    let product: CachedProduct
}

struct SessionResponse: Codable, Sendable {
    @Default<False> var ok: Bool
    let token: String?
}

struct ApiErrorDetail: Codable, Sendable {
    let code: String
    let message: String
}

struct ApiErrorBody: Codable, Sendable {
    let error: ApiErrorDetail
}

struct BodyProfile: Codable, Sendable {
    var sex: String
    var birthDate: String
    var heightCm: Int
    var weightKg: Double
    @Nullable var bodyFatPercent: Double?
    var activity: String
    var goal: String
    var ratePercentPerWeek: Double
    @Nullable var manualTargetKcal: Int?
}

struct EnergyTarget: Codable, Sendable {
    let bmrKcal: Double
    let maintenanceKcal: Double
    let adjustmentKcal: Double
    let targetKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    @Default<False> var floored: Bool
}

struct ProfileResponse: Codable, Sendable {
    let profile: BodyProfile?
    let target: EnergyTarget?
}

struct TargetResponse: Codable, Sendable {
    let target: EnergyTarget
}

struct Gym: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    let note: String?
}

enum FullFocus: DefaultProvider {
    static var value: String { "full" }
}

enum AnyEquipment: DefaultProvider {
    static var value: String { "any" }
}

enum ThreeSessions: DefaultProvider {
    static var value: Int { 3 }
}

struct TrainingPreferences: Codable, Sendable {
    @Nullable var gymId: Int?
    @Default<FullFocus> var focus: String
    @Default<AnyEquipment> var equipment: String
    @Default<ThreeSessions> var sessionsPerWeek: Int
}

struct PreferencesResponse: Codable, Sendable {
    let preferences: TrainingPreferences
    @Default<Empty<Gym>> var gyms: [Gym]
}

struct ExerciseRef: Codable, Sendable {
    let name: String
}

struct TemplateExercise: Codable, Sendable {
    let exercise: ExerciseRef
}

struct WorkoutTemplate: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    let kind: String
    @Default<Empty<TemplateExercise>> var exercises: [TemplateExercise]
}

struct TemplatesResponse: Codable, Sendable {
    @Default<Empty<WorkoutTemplate>> var templates: [WorkoutTemplate]
}

// MARK: Corps de requête.

struct Credentials: Codable, Sendable {
    let email: String
    let password: String
}

struct MealBody: Codable, Sendable {
    let meal: String
}

struct WeighInBody: Codable, Sendable {
    let weightKg: Double
}

struct RepeatBody: Codable, Sendable {
    let entryId: Int
    let meal: String
}

struct NewEntryBody: Codable, Sendable {
    let foodLabel: String
    let per100g: MacroValues
    let quantityG: Int
    let sourceKind: String
    @Nullable var sourceRef: String?
    let meal: String
    /// `search` ou `barcode`, pour la mesure d'usage. Sans effet sur l'entrée.
    @Nullable var via: String?
}

struct CacheProductBody: Codable, Sendable {
    let barcode: String
    let name: String
    let per100g: MacroValues
    @Nullable var servingSizeG: Double?
    let source: String
}

struct IdentityBody: Codable, Sendable {
    let handle: String
    @Nullable var displayName: String?
}

struct GenerateBody: Codable, Sendable {
    var action = "generate"
}

struct ActionBody: Codable, Sendable {
    let action: String
}

// MARK: Cuisine.

struct PlannedRow: Codable, Sendable, Identifiable {
    let id: Int
    let planDate: String
    let meal: String
    let recipeId: Int
    let recipeName: String
    let servings: Double
    let journaledAt: String?
}

struct PlanResponse: Codable, Sendable {
    @Default<Empty<PlannedRow>> var planned: [PlannedRow]
}

struct BasketRow: Codable, Sendable, Identifiable {
    let id: Int
    let recipeId: Int
    let recipeName: String
    let servings: Double
    let plannedServings: Double
}

struct BasketResponse: Codable, Sendable {
    @Default<Empty<BasketRow>> var basket: [BasketRow]
}

struct ShoppingItemRow: Codable, Sendable, Identifiable {
    let id: Int
    let refKind: String
    let refValue: String
    let label: String
    let aisle: String
    let aisleLabel: String
    let quantityLabel: String
    let checkedAt: String?
}

struct ShoppingListRow: Codable, Sendable {
    let id: Int
    @Default<Empty<ShoppingItemRow>> var items: [ShoppingItemRow]
}

struct ShoppingResponse: Codable, Sendable {
    let weekStart: String
    let list: ShoppingListRow?
}

struct RecipeRow: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    let servings: Double
    let prepMinutes: Int?
    @Default<Zero> var kcalPerServing: Double
    /// Photo du plat du catalogue ; absente pour une recette écrite à la main.
    let imageUrl: String?
}

struct RecipesResponse: Codable, Sendable {
    @Default<Empty<RecipeRow>> var recipes: [RecipeRow]
}

struct PlanMealBody: Codable, Sendable {
    let planDate: String
    let meal: String
    let recipeId: Int
    let servings: Double
}

struct BasketRecipeBody: Codable, Sendable {
    var source = "recipe"
    let weekStart: String
    let recipeId: Int
    let servings: Double
}

struct CheckItemBody: Codable, Sendable {
    let checked: Bool
    @Nullable var barcode: String?
    let refKind: String
    let refValue: String
}

// MARK: Sport.

struct OpenSessionRow: Codable, Sendable {
    let id: Int
    let name: String
    let setCount: Int
}

struct PlannedExercise: Codable, Sendable {
    let name: String
    let target: String
}

struct NextTemplate: Codable, Sendable {
    let id: Int
    let name: String
    @Default<Empty<PlannedExercise>> var exercises: [PlannedExercise]
}

struct TemplateRow: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    let kind: String
    let favorite: Bool
    let exerciseCount: Int
}

struct SessionRow: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    let sessionDate: String
    let durationSeconds: Int?
    let volumeKg: Double
    let record: Bool
}

struct TrainingHome: Codable, Sendable {
    let isoWeek: Int
    let weekSessions: Int
    let sessionsPerWeek: Int
    let weekVolumeKg: Double
    let volumeChange: Int?
    @Default<Empty<String>> var records: [String]
    let openSession: OpenSessionRow?
    let next: NextTemplate?
    @Default<Empty<TemplateRow>> var templates: [TemplateRow]
    @Default<Empty<SessionRow>> var history: [SessionRow]
}

struct WeekVolume: Codable, Sendable {
    let weekStart: String
    let volumeKg: Double
    let sessions: Int
}

struct ExerciseProgressRow: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    let value: String
    let change: String?
    let progressed: Bool
}

struct ProgressResponse: Codable, Sendable {
    let period: Int
    @Default<Empty<WeekVolume>> var weeks: [WeekVolume]
    @Default<Empty<Double?>> var weights: [Double?]
    let sessions: Int
    let volumeChange: Int?
    let weightChangeKg: Double?
    @Default<Empty<ExerciseProgressRow>> var exercises: [ExerciseProgressRow]
}

// MARK: Communauté.

struct FollowedPerson: Codable, Sendable, Identifiable {
    let id: Int
    let handle: String
    let displayName: String?
    let recent: Bool
}

struct BoardRow: Codable, Sendable, Identifiable {
    let id: Int
    let handle: String
    let displayName: String?
    let sessions: Int
    let mine: Bool
}

struct SocialHome: Codable, Sendable {
    let identity: Identity
    @Default<Empty<FollowedPerson>> var following: [FollowedPerson]
    @Default<ZeroInt> var pendingRequests: Int
    @Default<Empty<PublicPerson>> var requests: [PublicPerson]
    @Default<Empty<PublicPerson>> var followers: [PublicPerson]
    @Default<Empty<PublicPerson>> var requested: [PublicPerson]
    @Default<Empty<BoardRow>> var board: [BoardRow]
    /// Ceux que j'ai bloqués, pour pouvoir les débloquer.
    @Default<Empty<PublicPerson>> var blocked: [PublicPerson]
}

struct PublicPerson: Codable, Sendable, Identifiable {
    let id: Int
    let handle: String
    let displayName: String?
}

struct SharedSet: Codable, Sendable {
    let weightKg: Double?
    let reps: Int?
    let seconds: Int?
}

struct SharedExercise: Codable, Sendable {
    let name: String
    @Default<Empty<SharedSet>> var sets: [SharedSet]
}

struct FeedSession: Codable, Sendable, Identifiable {
    let id: Int
    let author: PublicPerson
    let name: String
    let sessionDate: String
    let startedAt: String
    let durationSeconds: Int?
    let volumeKg: Double
    let setCount: Int
    @Default<Empty<SharedExercise>> var exercises: [SharedExercise]
    let kudos: Int
    let kudoedByMe: Bool
    let mine: Bool
}

struct FeedResponse: Codable, Sendable {
    @Default<Empty<FeedSession>> var sessions: [FeedSession]
    let next: Int?
}

/// Un signalement : une personne, ou une de ses séances, et pourquoi.
struct ReportBody: Codable, Sendable {
    let userId: Int
    @Nullable var sessionId: Int?
    let reason: String
    @Nullable var note: String?
}

struct KudosBody: Codable, Sendable {
    let sessionId: Int
    let given: Bool
}

// MARK: Moi.

struct MeResponse: Codable, Sendable {
    let identity: Identity
    let gym: String?
    let sessionsPerWeek: Int
    let weekAverageKg: Double?
    let weightChangeKg: Double?
    @Default<Empty<Double?>> var weights: [Double?]
    let lastWeighIn: WeighIn?
    let recordsThisMonth: Int
    let topRecord: String?
    let activeWeeks: Int
    let weeks: Int
    let health: String
    let healthBridge: HealthBridge?
}

enum ThreeDays: DefaultProvider {
    static var value: Int { 3 }
}

/// État du pont Santé, mêmes seuils que le calcul de la cible (`bridgeStatus`).
struct HealthBridge: Codable, Sendable {
    let lastDay: String?
    let lastKcal: Double?
    @Default<ZeroInt> var dayCount: Int
    @Default<Zero> var typicalKcal: Double
    @Default<Zero> var peakKcal: Double
    @Default<ThreeDays> var requiredDays: Int
}

// MARK: Santé.

struct ActivityDay: Codable, Sendable {
    let day: String
    let activeKcal: Double
}

struct ActivityBatch: Codable, Sendable {
    let days: [ActivityDay]
    var source = "health"
}

// MARK: Séance en cours.

struct StartSessionBody: Codable, Sendable {
    @Nullable var templateId: Int?
    var free = false
}

struct StartedSession: Codable, Sendable {
    let id: Int
    @Default<False> var alreadyOpen: Bool
}

struct RunnerSet: Codable, Sendable {
    let setIndex: Int
    let done: Bool
    let weightKg: Double?
    let reps: Int?
    let seconds: Int?
    @Default<False> var toFailure: Bool
}

struct RunnerSuggestion: Codable, Sendable {
    let reason: String
    let trend: String
}

struct RunnerExercise: Codable, Sendable {
    let position: Int
    let entryId: Int
    let exerciseId: Int
    let name: String
    let kind: String
    let prescription: String
    let restSeconds: Int?
    let suggestion: RunnerSuggestion?
    let previous: String?
    let recordSetIndex: Int?
    @Default<Empty<RunnerSet>> var sets: [RunnerSet]
}

struct VisibilityOption: Codable, Sendable {
    let value: String
    let label: String
    let note: String
}

enum StrengthKind: DefaultProvider {
    static var value: String { "strength" }
}

struct CatalogExercise: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
    @Default<StrengthKind> var kind: String
    let muscleGroup: String?
}

struct Runner: Codable, Sendable {
    let id: Int
    let name: String
    let startedAt: String
    let finishedAt: String?
    let closed: Bool
    let visibility: String
    let favorited: Bool
    let canAddExercise: Bool
    let plannedSets: Int
    let recordedSets: Int
    let volumeKg: Double
    @Default<Empty<VisibilityOption>> var visibilities: [VisibilityOption]
    @Default<Empty<RunnerExercise>> var exercises: [RunnerExercise]
    @Default<Empty<CatalogExercise>> var catalog: [CatalogExercise]
}

struct SetBody: Codable, Sendable {
    let sessionId: Int
    let exerciseId: Int
    let position: Int
    let setIndex: Int
    @Nullable var weightKg: Double?
    @Nullable var reps: Int?
    @Nullable var seconds: Int?
    let toFailure: Bool
}

struct VisibilityBody: Codable, Sendable {
    let visibility: String
}

struct ExerciseIdBody: Codable, Sendable {
    let exerciseId: Int
}

struct NameBody: Codable, Sendable {
    @Nullable var name: String? = nil
}

struct ExercisesResponse: Codable, Sendable {
    @Default<Empty<CatalogExercise>> var exercises: [CatalogExercise]
    @Default<Empty<Int>> var favoriteIds: [Int]
}

struct ComposedExercise: Codable, Sendable {
    let exerciseId: Int
    let sets: Int
    @Nullable var reps: Int?
    @Nullable var seconds: Int?
}

struct ComposeBody: Codable, Sendable {
    @Nullable var name: String?
    let exercises: [ComposedExercise]
    let keep: Bool
    let start: Bool
}

struct ComposeResponse: Codable, Sendable {
    let templateId: Int
    let sessionId: Int?
}

struct AnalyseBody: Codable, Sendable {
    var action = "analyse"
    let text: String
}

struct ParsedSet: Codable, Sendable {
    @Nullable var reps: Int?
    @Nullable var seconds: Int?
    @Nullable var weightKg: Double?
    @Default<False> var toFailure: Bool
}

struct AnalysedCandidate: Codable, Sendable, Identifiable {
    let id: Int
    let name: String
}

enum NoWarning: DefaultProvider {
    static var value: String { "none" }
}

struct AnalysedLine: Codable, Sendable {
    let raw: String
    let name: String
    @Default<Empty<ParsedSet>> var sets: [ParsedSet]
    @Default<NoWarning> var warning: String
    let matchedExerciseId: Int?
    @Default<Empty<AnalysedCandidate>> var candidates: [AnalysedCandidate]
}

struct AnalyseResponse: Codable, Sendable {
    @Default<Empty<AnalysedLine>> var lines: [AnalysedLine]
}

struct WrittenLine: Codable, Sendable {
    @Nullable var exerciseId: Int?
    let name: String
    let sets: [ParsedSet]
}

struct SaveLogBody: Codable, Sendable {
    var action = "save"
    let sessionDate: String
    let lines: [WrittenLine]
}

struct SavedLog: Codable, Sendable {
    let id: Int
}

// MARK: Code-barres.

struct PartialMacros: Codable, Sendable {
    let kcal: Double?
    let proteinG: Double?
    let carbsG: Double?
    let fatG: Double?
}

enum NoMacros: DefaultProvider {
    static var value: PartialMacros { PartialMacros(kcal: nil, proteinG: nil, carbsG: nil, fatG: nil) }
}

struct PartialProduct: Codable, Sendable {
    let barcode: String
    let name: String?
    @Default<NoMacros> var per100g: PartialMacros
    let servingSizeG: Double?
}

struct ResolveResponse: Codable, Sendable {
    let kind: String
    let product: CachedProduct?
    let partial: PartialProduct?
}

// MARK: Historique.

struct DayTotals: Codable, Sendable {
    let entryDate: String
    let macros: MacroValues
    @Default<ZeroInt> var entryCount: Int
}

struct HistoryResponse: Codable, Sendable {
    @Default<Empty<DayTotals>> var days: [DayTotals]
}

struct JournalDay: Codable, Sendable {
    let totals: DayTotals
    @Default<Empty<Entry>> var entries: [Entry]
}

struct FavoriteBody: Codable, Sendable {
    let meal: String
    @Nullable var name: String?
}

enum NoRelation: DefaultProvider {
    static var value: String { "none" }
}

struct FoundPerson: Codable, Sendable, Identifiable {
    let id: Int
    let handle: String
    let displayName: String?
    @Default<NoRelation> var state: String
}

struct PeopleResponse: Codable, Sendable {
    @Default<Empty<FoundPerson>> var people: [FoundPerson]
}

struct RelationBody: Codable, Sendable {
    let action: String
    let userId: Int
}

// MARK: Cuisine, écritures.

struct FromBody: Codable, Sendable {
    let from: String
}

struct AddItemBody: Codable, Sendable {
    let from: String
    let refKind: String
    let refValue: String
    let label: String
    let quantityG: Int
}

struct ScanMatch: Codable, Sendable {
    let barcode: String
    let productName: String?
    let suggestedItemId: Int?
}

struct IngredientBody: Codable, Sendable {
    let refKind: String
    let refValue: String
    let label: String
    let quantityG: Int
    @Nullable var unitName: String? = nil
    @Nullable var unitGrams: Double? = nil
}

struct RecipeCreateBody: Codable, Sendable {
    var action = "create"
    let name: String
    let servings: Double
    let steps: [String]
    @Nullable var prepMinutes: Int?
    @Nullable var notes: String?
    let ingredients: [IngredientBody]
    /// Vrai pour une recette venue de l'import (Cuisine+) : elle ne compte pas dans la limite gratuite.
    var imported: Bool?
}

// MARK: Cuisine+.

struct FillWeekBody: Codable, Sendable {
    let weekStart: String
}

/// « Remplir la semaine » : ce qui a été posé, et ce qui a rejoint le panier pour y parvenir.
struct FillWeekResponse: Codable, Sendable {
    let placed: Int
    @Default<Empty<String>> var added: [String]
    let empty: Int
}

struct ImportRecipeBody: Codable, Sendable {
    let url: String
}

/// Un ingrédient du brouillon : la ligne de la page, la fiche trouvée, le poids s'il est connu.
struct DraftIngredient: Codable, Sendable {
    let line: String
    let hit: SearchHit
    let quantityG: Double?
}

/// Une recette lue sur une page, à relire dans l'éditeur avant de l'enregistrer.
struct RecipeDraft: Codable, Sendable {
    let name: String
    let servings: Double
    let prepMinutes: Int?
    @Default<Empty<String>> var steps: [String]
    @Default<Empty<DraftIngredient>> var ingredients: [DraftIngredient]
    @Default<Empty<String>> var unmatched: [String]
}

struct RecipeDraftResponse: Codable, Sendable {
    let draft: RecipeDraft
}

// MARK: Achats.

struct BillingProducts: Codable, Sendable {
    /// L'abonnement mensuel, par magasin : `app_store` pour l'iPhone.
    let subscription: [String: String]
    let kitchenPlus: String
    /// Cuisine+ n'est proposée qu'une fois ses fonctions écrites.
    @Default<False> var kitchenPlusOnSale: Bool
    /// Faux : rien n'est en vente, ni abonnement ni offre ne s'affichent.
    @Default<False> var salesOpen: Bool
}

struct BillingResponse: Codable, Sendable {
    let premium: Bool
    @Default<False> var kitchenPlus: Bool
    let expiresAt: String?
    /// À passer à l'App Store au moment de l'achat : il lie l'achat au compte.
    let appAccountToken: String?
    let products: BillingProducts?
}

struct BillingStatus: Codable, Sendable {
    let premium: Bool
    @Default<False> var kitchenPlus: Bool
    let expiresAt: String?
}

struct AppleTransactionBody: Codable, Sendable {
    let transactionId: String
}

// MARK: Compte.

struct RecoverBody: Codable, Sendable {
    let email: String
    let code: String
    let password: String
}

struct PasswordBody: Codable, Sendable {
    let password: String
}

struct RecoveryCodeResponse: Codable, Sendable {
    let code: String
}
