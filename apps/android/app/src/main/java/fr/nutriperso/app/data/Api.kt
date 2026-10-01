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

    private suspend fun openSession(path: String, body: Credentials): ApiResult<Unit> {
        val result = decode(
            raw("POST", path, json.encodeToString(Credentials.serializer(), body), opening = true),
            SessionResponse.serializer(),
        )
        return when (result) {
            is ApiResult.Failed -> result
            is ApiResult.Ok -> {
                val token = result.value.token
                if (token == null) {
                    // Serveur pas encore à jour : il a posé un cookie au lieu de
                    // rendre le jeton.
                    ApiResult.Failed(500, "internal", "Le serveur n'a pas rendu de jeton de session.")
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
    suspend fun search(query: String) =
        get("/api/search?q=" + URLEncoder.encode(query, "UTF-8"), SearchResponse.serializer())
    suspend fun product(barcode: String) = get("/api/products/$barcode", ProductResponse.serializer())

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
                if (response.code == 401 && !opening) signOut()
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
