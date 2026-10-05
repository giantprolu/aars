package fr.aars.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fr.aars.app.data.Api
import fr.aars.app.data.ApiResult
import fr.aars.app.data.valueOrNull
import fr.aars.app.data.MacroValues
import fr.aars.app.data.QuickAddContext
import fr.aars.app.data.RecentFood
import fr.aars.app.data.QuickFavorite
import fr.aars.app.data.SearchHit
import fr.aars.app.data.TodayResponse
import fr.aars.app.data.HealthAvailability
import fr.aars.app.data.HealthSync
import fr.aars.app.data.LunchReminder
import fr.aars.app.data.PurchaseStore
import fr.aars.app.data.TokenStore
import fr.aars.app.ui.components.formatKg
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

/** Les quatre repas de l'API, dans l'ordre du sélecteur. */
enum class Meal(val api: String, val label: String, val short: String, val inPhrase: String) {
    Breakfast("breakfast", "Petit-déjeuner", "Petit-déj", "au petit-déjeuner"),
    Lunch("lunch", "Déjeuner", "Déjeuner", "au déjeuner"),
    Snack("snack", "Collation", "Collation", "à la collation"),
    Dinner("dinner", "Dîner", "Dîner", "au dîner"),
    ;

    companion object {
        fun fromApi(value: String): Meal = entries.firstOrNull { it.api == value } ?: Snack

        /** Un moment de recette ou de plat : `null` reste `null`, une valeur inconnue aussi. */
        fun orNull(value: String?): Meal? = entries.firstOrNull { it.api == value }

        /** L'ordre du plan et des filtres, le même que la PWA : petit-déj, déjeuner, dîner, collation. */
        val planOrder = listOf(Breakfast, Lunch, Dinner, Snack)

        /** Le repas que l'heure suggère, mêmes bornes que `mealForHour` (lib/meal.ts). */
        fun forNow(): Meal {
            val hour = LocalTime.now(ZoneId.of("Europe/Paris")).hour
            return when {
                hour < 11 -> Breakfast
                hour < 15 -> Lunch
                hour < 18 -> Snack
                else -> Dinner
            }
        }
    }
}

private const val HEALTH_SYNC_INTERVAL_MS = 60 * 60 * 1000L

/** Où en est l'app une fois la session ouverte. */
enum class Gate { Checking, Onboarding, Ready }

/**
 * L'état partagé de l'app : session, journal du jour, données du bouton +.
 *
 * Chaque écriture relit ensuite l'écran Aujourd'hui : le serveur reste la
 * seule source de vérité (CLAUDE.md, pas de stockage local comme référence).
 */
class AppModel(application: Application) : AndroidViewModel(application) {
    val api = Api(TokenStore(application))
    val health = HealthSync(application)

    /** Instant de la dernière synchronisation Santé réussie, en mémoire seulement. */
    private var healthSyncedAt = 0L
    private var healthSyncing = false

    var gate by mutableStateOf(Gate.Checking)
        private set
    var today by mutableStateOf<TodayResponse?>(null)
        private set
    var todayError by mutableStateOf<String?>(null)
        private set
    var quick by mutableStateOf<QuickAddContext?>(null)
        private set

    /** Augmente à chaque écriture réussie : les écrans s'en servent pour relire. */
    var revision by mutableIntStateOf(0)
        private set

    fun bump() {
        revision++
    }

    /** Une écriture est en vol : les boutons des feuilles patientent. */
    var writing by mutableStateOf(false)
        private set

    /** Health Connect présent mais pas encore autorisé : Aujourd'hui propose de le relier. */
    var healthLinkable by mutableStateOf(false)
        private set

    /** L'achat intégré : abonnement et Cuisine+. */
    val purchases = PurchaseStore(application, api, viewModelScope, ::toast)

    /** Une limite gratuite atteinte : la coquille ouvre l'écran Premium, puis remet à faux. */
    var paywallRequested by mutableStateOf(false)

    fun requestPaywall() {
        paywallRequested = true
    }

    /** Un rappel du déjeuner touché : la coquille ouvre la feuille Repas, puis remet à faux. */
    var pendingMealSheet by mutableStateOf(false)

    fun openMealFromReminder() {
        pendingMealSheet = true
    }

    /** Vrai juste après l'onboarding : Aujourd'hui montre la carte d'arrivée. */
    var welcome by mutableStateOf(false)
        private set

    private val _toasts = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val toasts: SharedFlow<String> = _toasts

    init {
        viewModelScope.launch {
            api.signedIn.collect { signed ->
                if (signed) checkProfile() else reset()
            }
        }
    }

    private fun reset() {
        gate = Gate.Checking
        today = null
        quick = null
        welcome = false
        // Plus de session, plus de rappel : il revient à la connexion.
        LunchReminder.cancel(getApplication())
    }

    /** Sans profil corporel, le compte vient d'être créé : direction l'onboarding. */
    fun checkProfile() {
        viewModelScope.launch {
            gate = Gate.Checking
            when (val result = api.profile()) {
                is ApiResult.Ok -> {
                    if (result.value.profile == null) {
                        gate = Gate.Onboarding
                    } else {
                        gate = Gate.Ready
                        refreshToday()
                        syncHealth()
                        LunchReminder.schedule(getApplication())
                        purchases.syncPending()
                    }
                }
                is ApiResult.Failed -> {
                    // Hors ligne : on ouvre quand même l'app, l'écran dira l'erreur.
                    gate = Gate.Ready
                    todayError = result.message
                }
            }
        }
    }

    fun finishOnboarding() {
        welcome = true
        gate = Gate.Ready
        refreshToday()
    }

    fun signOut() = api.signOut()

    fun refreshToday() {
        viewModelScope.launch {
            when (val result = api.today()) {
                is ApiResult.Ok -> {
                    today = result.value
                    todayError = null
                    LunchReminder.noteToday(
                        getApplication(),
                        result.value.today,
                        result.value.entries.any { it.meal == "lunch" || it.meal == "dinner" },
                    )
                }
                is ApiResult.Failed -> todayError = result.message
            }
        }
    }

    /** Lu à l'ouverture du + : toujours frais. */
    fun loadQuick() {
        viewModelScope.launch {
            api.quickAdd().valueOrNull()?.let { quick = it }
        }
    }

    suspend fun search(query: String): ApiResult<List<SearchHit>> = when (val result = api.search(query)) {
        is ApiResult.Ok -> ApiResult.Ok(result.value.hits)
        is ApiResult.Failed -> result
    }

    /** Issue d'une lecture de code-barres. */
    sealed interface BarcodeOutcome {
        data class Found(val hit: SearchHit) : BarcodeOutcome
        data class Incomplete(val partial: fr.aars.app.data.PartialProduct) : BarcodeOutcome
        data class Unknown(val barcode: String) : BarcodeOutcome
        data class Failed(val message: String) : BarcodeOutcome
    }

    /** Cache produits, puis Open Food Facts, côté serveur (`/api/products/{code}/resolve`). */
    suspend fun resolveBarcode(barcode: String): BarcodeOutcome = when (val result = api.resolveBarcode(barcode)) {
        is ApiResult.Failed -> BarcodeOutcome.Failed(result.message)
        is ApiResult.Ok -> {
            val body = result.value
            val product = body.product
            val partial = body.partial
            when {
                body.kind == "found" && product != null -> BarcodeOutcome.Found(product.toHit())
                body.kind == "incomplete" && partial != null -> BarcodeOutcome.Incomplete(partial)
                else -> BarcodeOutcome.Unknown(barcode)
            }
        }
    }

    /** Un produit complété à la main entre au cache, puis se note comme un autre. */
    suspend fun saveManualProduct(barcode: String, name: String, per100g: MacroValues, servingSizeG: Double?): SearchHit? =
        api.saveManualProduct(barcode, name, per100g, servingSizeG).valueOrNull()?.product?.toHit()

    private fun fr.aars.app.data.CachedProduct.toHit() =
        SearchHit(kind = "product", ref = ref, name = name, per100g = per100g, servingSizeG = servingSizeG, origin = "cache")

    fun addRecent(recent: RecentFood, meal: Meal, done: () -> Unit) = write(
        { api.repeatEntry(recent.entryId, meal.api) },
        "${recent.label} ajouté ${meal.inPhrase}",
        done,
    )

    fun replayFavorite(favorite: QuickFavorite, meal: Meal, done: () -> Unit) = write(
        { api.replayFavorite(favorite.id, meal.api) },
        "${favorite.name} ajouté ${meal.inPhrase}",
        done,
    )

    /** [fromScan] dit si l'aliment vient du scanner plutôt que de la recherche. */
    fun addHit(hit: SearchHit, quantityG: Int, meal: Meal, fromScan: Boolean, done: () -> Unit) = write(
        { api.addEntry(hit, quantityG, meal.api, if (fromScan) "barcode" else "search") },
        "${hit.name} ajouté ${meal.inPhrase}",
        done,
    )

    fun addManual(label: String, macros: MacroValues, meal: Meal, done: () -> Unit) = write(
        { api.addManualEntry(label, macros, meal.api) },
        "$label ajouté ${meal.inPhrase}",
        done,
    )

    fun weighIn(weightKg: Double, done: () -> Unit) = write(
        { api.weighIn(weightKg) },
        "Pesée enregistrée · ${formatKg(weightKg)} kg",
        done,
    )

    fun eatPlanned(planId: Long, name: String) = write(
        { api.journalPlanned(planId) },
        "$name noté dans le journal",
        {},
    )

    fun deleteEntry(entry: fr.aars.app.data.Entry) = write(
        { api.deleteEntry(entry.id) },
        "${entry.foodLabel} retiré du journal",
        {},
    )

    fun saveFavorite(meal: Meal) = write(
        { api.saveFavorite(meal.api, null) },
        "${meal.label} gardé en favori",
        {},
    )

    /**
     * Relit Health Connect et pousse les trente derniers jours.
     *
     * Appelée à chaque retour au premier plan, au plus une fois par heure, et
     * à la demande depuis l'écran Santé ([force]). Silencieuse sans permission :
     * c'est l'écran Santé qui invite à la donner. Rend le nombre de journées
     * envoyées, ou `null` en cas d'échec.
     */
    suspend fun syncHealthNow(force: Boolean = false): Int? {
        if (gate != Gate.Ready || healthSyncing) return null
        val now = System.currentTimeMillis()
        if (!force && now - healthSyncedAt < HEALTH_SYNC_INTERVAL_MS) return null
        if (!health.canRead()) return null
        healthSyncing = true
        try {
            val days = runCatching { health.readDays() }.getOrNull() ?: return null
            if (days.isEmpty()) {
                healthSyncedAt = now
                return 0
            }
            return when (api.postActivity(days)) {
                is ApiResult.Ok -> {
                    healthSyncedAt = now
                    revision++
                    refreshToday()
                    days.size
                }
                is ApiResult.Failed -> null
            }
        } finally {
            healthSyncing = false
        }
    }

    fun syncHealth() {
        viewModelScope.launch {
            healthLinkable = health.availability() == HealthAvailability.Available && !health.canRead()
            syncHealthNow()
        }
    }

    /**
     * Après la demande d'accès ouverte depuis Aujourd'hui : relie Santé en un
     * geste, sans raccourci ni jeton comme sur la PWA, et synchronise aussitôt.
     */
    fun healthAccessAnswered() {
        viewModelScope.launch {
            healthLinkable = health.availability() == HealthAvailability.Available && !health.canRead()
            if (healthLinkable) return@launch
            val sent = syncHealthNow(force = true)
            _toasts.emit(
                when (sent) {
                    null -> "La synchronisation a échoué. Réessaie dans un instant."
                    0 -> "Aucune dépense trouvée dans Health Connect sur 30 jours"
                    else -> "Santé reliée · $sent journée${if (sent > 1) "s" else ""} synchronisée${if (sent > 1) "s" else ""}"
                },
            )
        }
    }

    fun toast(message: String) {
        _toasts.tryEmit(message)
    }

    private fun write(call: suspend () -> ApiResult<Unit>, success: String, done: () -> Unit) {
        if (writing) return
        writing = true
        viewModelScope.launch {
            val result = call()
            writing = false
            when (result) {
                is ApiResult.Ok -> {
                    done()
                    revision++
                    _toasts.emit(success)
                    refreshToday()
                }
                is ApiResult.Failed -> {
                    _toasts.emit(result.message)
                    if (result.code == "premium_required") requestPaywall()
                }
            }
        }
    }
}
