package fr.nutriperso.app.data

import fr.nutriperso.app.BuildConfig
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Issue d'un appel : jamais d'exception jusqu'à l'écran. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Failed(val status: Int, val code: String?, val message: String) : ApiResult<Nothing>
}

fun <T> ApiResult<T>.valueOrNull(): T? = when (this) {
    is ApiResult.Ok -> value
    is ApiResult.Failed -> null
}

/**
 * Le client de l'API NutriPerso.
 *
 * Le jeton part en `Authorization: Bearer`, jamais en paramètre : le serveur
 * en tire l'utilisateur, l'app n'envoie jamais d'identifiant elle-même
 * (CLAUDE.md). Un 401 purge le jeton et repasse l'app sur la connexion.
 */
class Api(private val tokens: TokenStore) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()

    private val _signedIn = MutableStateFlow(tokens.read() != null)
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    // Session.

    suspend fun login(email: String, password: String): ApiResult<Unit> =
        openSession("/api/session", Credentials(email.trim(), password))

    suspend fun register(email: String, password: String): ApiResult<Unit> =
        openSession("/api/users", Credentials(email.trim(), password))

    /** Code de secours : nouveau mot de passe et session ouverte dans la foulée. */
    suspend fun recover(email: String, code: String, password: String): ApiResult<Unit> =
        openSession("/api/recover", json.encodeToString(RecoverBody.serializer(), RecoverBody(email.trim(), code.trim(), password)))

    private suspend fun openSession(path: String, body: Credentials): ApiResult<Unit> =
        openSession(path, json.encodeToString(Credentials.serializer(), body))

    private suspend fun openSession(path: String, body: String): ApiResult<Unit> {
        val result = decode(
            raw("POST", path, body, opening = true),
            SessionResponse.serializer(),
        )
        return when (result) {
            is ApiResult.Failed -> result
            is ApiResult.Ok -> {
                val token = result.value.token
                if (token == null) {
                    // Serveur pas encore à jour : il a posé un cookie au lieu de
                    // rendre le jeton.
                    ApiResult.Failed(
                        500,
                        "outdated_server",
                        "Le serveur ${BuildConfig.API_BASE_URL} n'est pas à jour pour l'app (pas de jeton). " +
                            "Le compte est peut-être créé : connecte-toi une fois le serveur à jour.",
                    )
                } else {
                    tokens.write(token)
                    _signedIn.value = true
                    ApiResult.Ok(Unit)
                }
            }
        }
    }

    fun signOut() {
        tokens.clear()
        _signedIn.value = false
    }

    // Lectures.

    suspend fun today() = get("/api/today", TodayResponse.serializer())
    suspend fun quickAdd() = get("/api/quick-add", QuickAddContext.serializer())
    suspend fun favorites() = get("/api/favorites", FavoritesResponse.serializer())
    suspend fun profile() = get("/api/profile", ProfileResponse.serializer())
    suspend fun preferences() = get("/api/training/preferences", PreferencesResponse.serializer())
    suspend fun templates() = get("/api/training", TemplatesResponse.serializer())
    suspend fun trainingHome() = get("/api/training/home", TrainingHome.serializer())
    suspend fun progress(period: Int) = get("/api/training/progress?period=$period", ProgressResponse.serializer())
    suspend fun socialHome() = get("/api/social/home", SocialHome.serializer())
    suspend fun feed(before: Long? = null) =
        get("/api/social/feed" + (before?.let { "?before=$it" } ?: ""), FeedResponse.serializer())
    suspend fun history(offset: Int, limit: Int = 30) =
        get("/api/history?offset=$offset&limit=$limit", HistoryResponse.serializer())
    suspend fun journal(date: String) = get("/api/journal/$date", JournalDay.serializer())
    suspend fun deleteEntry(id: Long) = sendEmpty("DELETE", "/api/entries/$id")
    suspend fun saveFavorite(meal: String, name: String?) =
        send("POST", "/api/favorites", json.encodeToString(FavoriteBody.serializer(), FavoriteBody(meal, name)))
    suspend fun people(query: String) =
        get("/api/social/people?q=" + URLEncoder.encode(query, "UTF-8"), PeopleResponse.serializer())
    suspend fun relation(action: String, userId: Long) =
        send("POST", "/api/social/relations", json.encodeToString(RelationBody.serializer(), RelationBody(action, userId)))
    suspend fun recoveryCode() = decode(raw("POST", "/api/account/recovery-code", "{}"), RecoveryCodeResponse.serializer())

    /** L'export complet, en JSON brut, tel que le serveur le rend. */
    suspend fun exportData(): ApiResult<String> = raw("GET", "/api/account/export", null)

    /** Un mauvais mot de passe répond 401 : ici, il ne ferme pas la session. */
    suspend fun deleteAccount(password: String): ApiResult<Unit> =
        when (val result = raw("DELETE", "/api/account", json.encodeToString(PasswordBody.serializer(), PasswordBody(password)), keepSession = true)) {
            is ApiResult.Ok -> {
                signOut()
                ApiResult.Ok(Unit)
            }
            is ApiResult.Failed -> result
        }

    suspend fun me() = get("/api/me", MeResponse.serializer())
    suspend fun plan(weekStart: String) = get("/api/plan?from=$weekStart", PlanResponse.serializer())
    suspend fun basket(weekStart: String) = get("/api/basket?weekStart=$weekStart", BasketResponse.serializer())
    suspend fun shopping(weekStart: String) = get("/api/shopping?from=$weekStart", ShoppingResponse.serializer())
    suspend fun recipes() = get("/api/recipes", RecipesResponse.serializer())
    suspend fun search(query: String) =
        get("/api/search?q=" + URLEncoder.encode(query, "UTF-8"), SearchResponse.serializer())
    suspend fun product(barcode: String) = get("/api/products/$barcode", ProductResponse.serializer())
    suspend fun resolveBarcode(barcode: String) = get("/api/products/$barcode/resolve", ResolveResponse.serializer())

    /** Enregistre au cache un produit complété à la main (code-barres inconnu ou incomplet). */
    suspend fun saveManualProduct(barcode: String, name: String, per100g: MacroValues, servingSizeG: Double?) = decode(
        raw(
            "POST", "/api/products",
            json.encodeToString(CacheProductBody.serializer(), CacheProductBody(barcode, name, per100g, servingSizeG, "manual")),
        ),
        ProductResponse.serializer(),
    )

    // Écritures. Leur réponse n'est pas lue : l'écran relit ce qu'il affiche.

    suspend fun repeatEntry(entryId: Long, meal: String) =
        send("POST", "/api/entries/repeat", json.encodeToString(RepeatBody.serializer(), RepeatBody(entryId, meal)))

    suspend fun replayFavorite(id: Long, meal: String) =
        send("POST", "/api/favorites/$id", json.encodeToString(MealBody.serializer(), MealBody(meal)))

    suspend fun addEntry(hit: SearchHit, quantityG: Int, meal: String): ApiResult<Unit> {
        // Un produit venu d'Open Food Facts doit être en base avant d'être
        // journalisé, sinon sa référence ne pointe vers rien (SearchFlow web).
        // L'entrée porte ses propres macros : un échec ici ne l'empêche pas.
        if (hit.origin == "off") {
            val product = CacheProductBody(hit.ref, hit.name, hit.per100g, hit.servingSizeG, "off")
            send("POST", "/api/products", json.encodeToString(CacheProductBody.serializer(), product))
        }
        val body = NewEntryBody(hit.name, hit.per100g, quantityG, hit.kind, hit.ref, meal)
        return send("POST", "/api/entries", json.encodeToString(NewEntryBody.serializer(), body))
    }

    /**
     * Une saisie à la main : un aliment ad hoc de 100 g, dont les macros pour
     * 100 g sont donc celles de la portion saisie.
     */
    suspend fun addManualEntry(label: String, macros: MacroValues, meal: String): ApiResult<Unit> {
        val body = NewEntryBody(label, macros, 100, "manual", null, meal)
        return send("POST", "/api/entries", json.encodeToString(NewEntryBody.serializer(), body))
    }

    /** Note la part planifiée dans le journal, et la barre dans Cuisine. */
    suspend fun journalPlanned(planId: Long) =
        send("POST", "/api/plan/$planId", json.encodeToString(ActionBody.serializer(), ActionBody("journal")))

    suspend fun planMeal(planDate: String, meal: String, recipeId: Long, servings: Double) = send(
        "POST", "/api/plan",
        json.encodeToString(PlanMealBody.serializer(), PlanMealBody(planDate, meal, recipeId, servings)),
    )

    suspend fun addToBasket(weekStart: String, recipeId: Long, servings: Double) = send(
        "POST", "/api/basket",
        json.encodeToString(BasketRecipeBody.serializer(), BasketRecipeBody(weekStart = weekStart, recipeId = recipeId, servings = servings)),
    )

    suspend fun checkItem(item: ShoppingItemRow, checked: Boolean) = send(
        "PATCH", "/api/shopping/items/${item.id}",
        json.encodeToString(CheckItemBody.serializer(), CheckItemBody(checked, null, item.refKind, item.refValue)),
    )

    suspend fun generateShopping(weekStart: String) =
        send("POST", "/api/shopping", json.encodeToString(FromBody.serializer(), FromBody(weekStart)))

    suspend fun addShoppingItem(weekStart: String, hit: SearchHit, quantityG: Int): ApiResult<Unit> {
        cacheIfOff(hit)
        val body = AddItemBody(weekStart, hit.kind, hit.ref, hit.name, quantityG)
        return send("POST", "/api/shopping/items", json.encodeToString(AddItemBody.serializer(), body))
    }

    suspend fun scanMatch(barcode: String, weekStart: String) =
        get("/api/shopping/scan?barcode=$barcode&from=$weekStart", ScanMatch.serializer())

    suspend fun checkItemScanned(item: ShoppingItemRow, barcode: String) = send(
        "PATCH", "/api/shopping/items/${item.id}",
        json.encodeToString(CheckItemBody.serializer(), CheckItemBody(true, barcode, item.refKind, item.refValue)),
    )

    /** Une recette écrite sur l'app ; ses ingrédients viennent de la recherche. */
    suspend fun createRecipe(body: RecipeCreateBody, hits: List<SearchHit>): ApiResult<Unit> {
        hits.forEach { cacheIfOff(it) }
        return send("POST", "/api/recipes", json.encodeToString(RecipeCreateBody.serializer(), body))
    }

    /** Un produit venu d'Open Food Facts doit être en base avant d'être référencé. */
    private suspend fun cacheIfOff(hit: SearchHit) {
        if (hit.origin == "off") {
            val product = CacheProductBody(hit.ref, hit.name, hit.per100g, hit.servingSizeG, "off")
            send("POST", "/api/products", json.encodeToString(CacheProductBody.serializer(), product))
        }
    }

    suspend fun kudos(sessionId: Long, given: Boolean) =
        send("PUT", "/api/social/kudos", json.encodeToString(KudosBody.serializer(), KudosBody(sessionId, given)))

    // Séances.

    suspend fun startSession(templateId: Long?) = decode(
        raw("POST", "/api/training/sessions", json.encodeToString(StartSessionBody.serializer(), StartSessionBody(templateId, templateId == null))),
        StartedSession.serializer(),
    )

    suspend fun runner(sessionId: Long) = get("/api/training/sessions/$sessionId/runner", Runner.serializer())

    suspend fun recordSet(body: SetBody) =
        send("POST", "/api/training/sets", json.encodeToString(SetBody.serializer(), body))

    suspend fun finishSession(sessionId: Long) =
        send("POST", "/api/training/sessions/$sessionId", json.encodeToString(ActionBody.serializer(), ActionBody("finish")))

    suspend fun discardSession(sessionId: Long) = sendEmpty("DELETE", "/api/training/sessions/$sessionId")

    suspend fun setVisibility(sessionId: Long, visibility: String) = send(
        "PATCH", "/api/training/sessions/$sessionId/visibility",
        json.encodeToString(VisibilityBody.serializer(), VisibilityBody(visibility)),
    )

    suspend fun favoriteSession(sessionId: Long) =
        send("POST", "/api/training/sessions/$sessionId/favorite", json.encodeToString(NameBody.serializer(), NameBody()))

    suspend fun addSessionExercise(sessionId: Long, exerciseId: Long) = send(
        "POST", "/api/training/sessions/$sessionId/exercises",
        json.encodeToString(ExerciseIdBody.serializer(), ExerciseIdBody(exerciseId)),
    )

    suspend fun exercises() = get("/api/training/exercises", ExercisesResponse.serializer())

    suspend fun compose(body: ComposeBody) = decode(
        raw("POST", "/api/training/templates", json.encodeToString(ComposeBody.serializer(), body)),
        ComposeResponse.serializer(),
    )

    suspend fun analyseLog(text: String) = decode(
        raw("POST", "/api/training/import", json.encodeToString(AnalyseBody.serializer(), AnalyseBody(text = text))),
        AnalyseResponse.serializer(),
    )

    suspend fun saveLog(date: String, lines: List<WrittenLine>) = decode(
        raw("POST", "/api/training/import", json.encodeToString(SaveLogBody.serializer(), SaveLogBody(sessionDate = date, lines = lines))),
        SavedLog.serializer(),
    )

    /** Les journées lues dans Health Connect, en un seul envoi. */
    suspend fun postActivity(days: List<ActivityDay>) =
        send("POST", "/api/activity", json.encodeToString(ActivityBatch.serializer(), ActivityBatch(days)))

    suspend fun weighIn(weightKg: Double) =
        send("POST", "/api/weight", json.encodeToString(WeighInBody.serializer(), WeighInBody(weightKg)))

    suspend fun saveProfile(profile: BodyProfile) = decode(
        raw("PUT", "/api/profile", json.encodeToString(BodyProfile.serializer(), profile)),
        TargetResponse.serializer(),
    )

    suspend fun saveIdentity(handle: String, displayName: String?) = send(
        "PUT", "/api/social/identity",
        json.encodeToString(IdentityBody.serializer(), IdentityBody(handle, displayName)),
    )

    suspend fun savePreferences(preferences: TrainingPreferences) = send(
        "PUT", "/api/training/preferences", json.encodeToString(TrainingPreferences.serializer(), preferences),
    )

    suspend fun generateProgram() =
        send("POST", "/api/training", json.encodeToString(GenerateBody.serializer(), GenerateBody()))

    // Mécanique.

    private suspend fun <T> get(path: String, decoder: KSerializer<T>): ApiResult<T> =
        decode(raw("GET", path, null), decoder)

    private suspend fun send(method: String, path: String, body: String): ApiResult<Unit> =
        when (val result = raw(method, path, body)) {
            is ApiResult.Ok -> ApiResult.Ok(Unit)
            is ApiResult.Failed -> result
        }

    private suspend fun sendEmpty(method: String, path: String): ApiResult<Unit> =
        when (val result = raw(method, path, null)) {
            is ApiResult.Ok -> ApiResult.Ok(Unit)
            is ApiResult.Failed -> result
        }

    private fun <T> decode(result: ApiResult<String>, decoder: KSerializer<T>): ApiResult<T> =
        when (result) {
            is ApiResult.Failed -> result
            is ApiResult.Ok -> try {
                ApiResult.Ok(json.decodeFromString(decoder, result.value))
            } catch (e: SerializationException) {
                ApiResult.Failed(0, "malformed", "Réponse du serveur illisible.")
            } catch (e: IllegalArgumentException) {
                ApiResult.Failed(0, "malformed", "Réponse du serveur illisible.")
            }
        }

    /**
     * Un appel, corps de réponse brut. [opening] marque l'ouverture de
     * session : pas de jeton envoyé, et un 401 y veut dire « mauvais mot de
     * passe », pas « session expirée ».
     */
    private suspend fun raw(
        method: String,
        path: String,
        body: String?,
        opening: Boolean = false,
        keepSession: Boolean = false,
    ): ApiResult<String> = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url(BuildConfig.API_BASE_URL + path)
            .header("Accept", "application/json")
            .header("X-Client", "mobile")
            .method(method, body?.toRequestBody(jsonType))
        if (!opening) tokens.read()?.let { builder.header("Authorization", "Bearer $it") }

        try {
            client.newCall(builder.build()).execute().use { response ->
                val text = response.body.string()
                if (response.isSuccessful) {
                    return@withContext ApiResult.Ok(text)
                }
                if (response.code == 401 && !opening && !keepSession) signOut()
                val error = try {
                    json.decodeFromString(ApiErrorBody.serializer(), text).error
                } catch (e: SerializationException) {
                    null
                } catch (e: IllegalArgumentException) {
                    null
                }
                ApiResult.Failed(response.code, error?.code, error?.message ?: "Erreur ${response.code}.")
            }
        } catch (e: IOException) {
            ApiResult.Failed(0, "network", "Serveur injoignable. Vérifie ta connexion.")
        }
    }
}
