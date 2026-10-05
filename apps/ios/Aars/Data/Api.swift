import Foundation
import Observation

/// L'échec d'un appel, prêt à afficher.
struct ApiFailure: Error, Sendable {
    let status: Int
    let code: String?
    let message: String
}

/// Issue d'un appel : jamais d'erreur levée jusqu'à l'écran.
typealias ApiResult<T> = Result<T, ApiFailure>

extension Result {
    var value: Success? {
        if case .success(let value) = self { value } else { nil }
    }
}

/**
 Le client de l'API Aars, même surface que l'app Android (data/Api.kt).

 Le jeton part en `Authorization: Bearer`, jamais en paramètre : le serveur en
 tire l'utilisateur, l'app n'envoie jamais d'identifiant elle-même
 (CLAUDE.md). Un 401 purge le jeton et repasse l'app sur la connexion.
 */
@MainActor
@Observable
final class Api {
    /// L'adresse du serveur, posée par `NUTRI_API_URL` (Config/Aars.xcconfig).
    let baseURL: String
    private(set) var signedIn: Bool

    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let encoder = JSONEncoder()
    @ObservationIgnored private let decoder = JSONDecoder()

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "NutriAPIBaseURL") as? String
        var base = configured?.trimmingCharacters(in: .whitespaces) ?? ""
        while base.hasSuffix("/") { base.removeLast() }
        baseURL = base.isEmpty ? "https://aars-app.vercel.app" : base

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        session = URLSession(configuration: configuration)

        TokenStore.forgetPreviousInstall()
        signedIn = TokenStore.read() != nil
    }

    // MARK: Session.

    func login(email: String, password: String) async -> ApiResult<Void> {
        await openSession("/api/session", body: Credentials(email: email.trimmed, password: password))
    }

    func register(email: String, password: String) async -> ApiResult<Void> {
        await openSession("/api/users", body: Credentials(email: email.trimmed, password: password))
    }

    /// Code de secours : nouveau mot de passe et session ouverte dans la foulée.
    func recover(email: String, code: String, password: String) async -> ApiResult<Void> {
        await openSession("/api/recover", body: RecoverBody(email: email.trimmed, code: code.trimmed, password: password))
    }

    private func openSession(_ path: String, body: some Encodable) async -> ApiResult<Void> {
        let result = decode(await raw("POST", path, body: encode(body), opening: true), as: SessionResponse.self)
        switch result {
        case .failure(let failure):
            return .failure(failure)
        case .success(let response):
            guard let token = response.token else {
                // Serveur pas encore à jour : il a posé un cookie au lieu de
                // rendre le jeton.
                return .failure(ApiFailure(
                    status: 500,
                    code: "outdated_server",
                    message: "Le serveur \(baseURL) n'est pas à jour pour l'app (pas de jeton). "
                        + "Le compte est peut-être créé : connecte-toi une fois le serveur à jour."
                ))
            }
            TokenStore.write(token)
            signedIn = true
            return .success(())
        }
    }

    func signOut() {
        TokenStore.clear()
        signedIn = false
    }

    // MARK: Lectures.

    func today() async -> ApiResult<TodayResponse> { await get("/api/today") }
    func quickAdd() async -> ApiResult<QuickAddContext> { await get("/api/quick-add") }
    func favorites() async -> ApiResult<FavoritesResponse> { await get("/api/favorites") }
    func profile() async -> ApiResult<ProfileResponse> { await get("/api/profile") }
    func preferences() async -> ApiResult<PreferencesResponse> { await get("/api/training/preferences") }
    func templates() async -> ApiResult<TemplatesResponse> { await get("/api/training") }
    func trainingHome() async -> ApiResult<TrainingHome> { await get("/api/training/home") }
    func progress(period: Int) async -> ApiResult<ProgressResponse> { await get("/api/training/progress?period=\(period)") }
    func socialHome() async -> ApiResult<SocialHome> { await get("/api/social/home") }

    func feed(before: Int? = nil) async -> ApiResult<FeedResponse> {
        await get("/api/social/feed" + (before.map { "?before=\($0)" } ?? ""))
    }

    func history(offset: Int, limit: Int = 30) async -> ApiResult<HistoryResponse> {
        await get("/api/history?offset=\(offset)&limit=\(limit)")
    }

    func journal(date: String) async -> ApiResult<JournalDay> { await get("/api/journal/\(date)") }
    func deleteEntry(id: Int) async -> ApiResult<Void> { await send("DELETE", "/api/entries/\(id)") }

    func saveFavorite(meal: String, name: String?) async -> ApiResult<Void> {
        await send("POST", "/api/favorites", FavoriteBody(meal: meal, name: name))
    }

    func people(query: String) async -> ApiResult<PeopleResponse> { await get("/api/social/people?q=" + query.queryEncoded) }

    func relation(action: String, userId: Int) async -> ApiResult<Void> {
        await send("POST", "/api/social/relations", RelationBody(action: action, userId: userId))
    }

    /// Signale une personne, ou une de ses séances, à l'équipe qui modère.
    func report(userId: Int, sessionId: Int?, reason: String, note: String?) async -> ApiResult<Void> {
        await send("POST", "/api/social/reports", ReportBody(userId: userId, sessionId: sessionId, reason: reason, note: note))
    }

    func recoveryCode() async -> ApiResult<RecoveryCodeResponse> {
        decode(await raw("POST", "/api/account/recovery-code", body: Data("{}".utf8)), as: RecoveryCodeResponse.self)
    }

    /// L'export complet, en JSON brut, tel que le serveur le rend.
    func exportData() async -> ApiResult<String> {
        await raw("GET", "/api/account/export", body: nil).map { String(decoding: $0, as: UTF8.self) }
    }

    /// Un mauvais mot de passe répond 401 : ici, il ne ferme pas la session.
    func deleteAccount(password: String) async -> ApiResult<Void> {
        let result = await raw("DELETE", "/api/account", body: encode(PasswordBody(password: password)), keepSession: true)
        if case .failure(let failure) = result { return .failure(failure) }
        signOut()
        return .success(())
    }

    func me() async -> ApiResult<MeResponse> { await get("/api/me") }
    func billing() async -> ApiResult<BillingResponse> { await get("/api/billing") }

    /// Fait vérifier une transaction App Store par le serveur, qui la relit chez Apple.
    func verifyApple(transactionId: String) async -> ApiResult<BillingStatus> {
        decode(await raw("POST", "/api/billing/apple", body: encode(AppleTransactionBody(transactionId: transactionId))), as: BillingStatus.self)
    }
    func plan(weekStart: String) async -> ApiResult<PlanResponse> { await get("/api/plan?from=\(weekStart)") }
    func basket(weekStart: String) async -> ApiResult<BasketResponse> { await get("/api/basket?weekStart=\(weekStart)") }
    func shopping(weekStart: String) async -> ApiResult<ShoppingResponse> { await get("/api/shopping?from=\(weekStart)") }
    func recipes() async -> ApiResult<RecipesResponse> { await get("/api/recipes") }
    func search(query: String) async -> ApiResult<SearchResponse> { await get("/api/search?q=" + query.queryEncoded) }
    func product(barcode: String) async -> ApiResult<ProductResponse> { await get("/api/products/\(barcode)") }
    func resolveBarcode(_ barcode: String) async -> ApiResult<ResolveResponse> { await get("/api/products/\(barcode)/resolve") }

    /// Enregistre au cache un produit complété à la main (code-barres inconnu ou incomplet).
    func saveManualProduct(barcode: String, name: String, per100g: MacroValues, servingSizeG: Double?) async -> ApiResult<ProductResponse> {
        let body = CacheProductBody(barcode: barcode, name: name, per100g: per100g, servingSizeG: servingSizeG, source: "manual")
        return decode(await raw("POST", "/api/products", body: encode(body)), as: ProductResponse.self)
    }

    // MARK: Écritures. Leur réponse n'est pas lue : l'écran relit ce qu'il affiche.

    func repeatEntry(entryId: Int, meal: String) async -> ApiResult<Void> {
        await send("POST", "/api/entries/repeat", RepeatBody(entryId: entryId, meal: meal))
    }

    func replayFavorite(id: Int, meal: String) async -> ApiResult<Void> {
        await send("POST", "/api/favorites/\(id)", MealBody(meal: meal))
    }

    func addEntry(_ hit: SearchHit, quantityG: Int, meal: String, via: String) async -> ApiResult<Void> {
        // Un produit venu d'Open Food Facts doit être en base avant d'être
        // journalisé, sinon sa référence ne pointe vers rien (SearchFlow web).
        // L'entrée porte ses propres macros : un échec ici ne l'empêche pas.
        await cacheIfOff(hit)
        let body = NewEntryBody(
            foodLabel: hit.name, per100g: hit.per100g, quantityG: quantityG,
            sourceKind: hit.kind, sourceRef: hit.ref, meal: meal, via: via
        )
        return await send("POST", "/api/entries", body)
    }

    /// Une saisie à la main : un aliment ad hoc de 100 g, dont les macros pour
    /// 100 g sont donc celles de la portion saisie.
    func addManualEntry(label: String, macros: MacroValues, meal: String) async -> ApiResult<Void> {
        let body = NewEntryBody(
            foodLabel: label, per100g: macros, quantityG: 100,
            sourceKind: "manual", sourceRef: nil, meal: meal, via: nil
        )
        return await send("POST", "/api/entries", body)
    }

    /// Note la part planifiée dans le journal, et la barre dans Cuisine.
    func journalPlanned(planId: Int) async -> ApiResult<Void> {
        await send("POST", "/api/plan/\(planId)", ActionBody(action: "journal"))
    }

    func planMeal(planDate: String, meal: String, recipeId: Int, servings: Double) async -> ApiResult<Void> {
        await send("POST", "/api/plan", PlanMealBody(planDate: planDate, meal: meal, recipeId: recipeId, servings: servings))
    }

    /// « Remplir la semaine » (Cuisine+).
    func fillWeek(weekStart: String, meals: [Meal]) async -> ApiResult<FillWeekResponse> {
        decode(
            await raw("POST", "/api/plan/auto", body: encode(FillWeekBody(weekStart: weekStart, meals: meals.map(\.rawValue)))),
            as: FillWeekResponse.self
        )
    }

    /// Les plats du catalogue pour l'objectif du compte.
    func catalog() async -> ApiResult<CatalogResponse> { await get("/api/catalog") }

    /// Ajoute un plat du catalogue aux recettes, sans le mettre au panier.
    func installCatalog(slug: String) async -> ApiResult<Void> {
        await send("POST", "/api/catalog", CatalogSlugsBody(slugs: [slug]))
    }

    /// Choisit un plat du catalogue pour la semaine : installé s'il ne l'est pas, puis mis au panier.
    func chooseCatalog(weekStart: String, slug: String) async -> ApiResult<Void> {
        await send("POST", "/api/basket", BasketCatalogBody(weekStart: weekStart, slugs: [slug]))
    }

    /// Lit une page de recette et rend un brouillon (Cuisine+). Rien n'est enregistré.
    func importRecipe(url: String) async -> ApiResult<RecipeDraft> {
        decode(await raw("POST", "/api/recipes/import", body: encode(ImportRecipeBody(url: url))), as: RecipeDraftResponse.self).map(\.draft)
    }

    func addToBasket(weekStart: String, recipeId: Int, servings: Double) async -> ApiResult<Void> {
        await send("POST", "/api/basket", BasketRecipeBody(weekStart: weekStart, recipeId: recipeId, servings: servings))
    }

    func checkItem(_ item: ShoppingItemRow, checked: Bool) async -> ApiResult<Void> {
        await send(
            "PATCH", "/api/shopping/items/\(item.id)",
            CheckItemBody(checked: checked, barcode: nil, refKind: item.refKind, refValue: item.refValue)
        )
    }

    func generateShopping(weekStart: String) async -> ApiResult<Void> {
        await send("POST", "/api/shopping", FromBody(from: weekStart))
    }

    func addShoppingItem(weekStart: String, hit: SearchHit, quantityG: Int) async -> ApiResult<Void> {
        await cacheIfOff(hit)
        let body = AddItemBody(from: weekStart, refKind: hit.kind, refValue: hit.ref, label: hit.name, quantityG: quantityG)
        return await send("POST", "/api/shopping/items", body)
    }

    func scanMatch(barcode: String, weekStart: String) async -> ApiResult<ScanMatch> {
        await get("/api/shopping/scan?barcode=\(barcode)&from=\(weekStart)")
    }

    func checkItemScanned(_ item: ShoppingItemRow, barcode: String) async -> ApiResult<Void> {
        await send(
            "PATCH", "/api/shopping/items/\(item.id)",
            CheckItemBody(checked: true, barcode: barcode, refKind: item.refKind, refValue: item.refValue)
        )
    }

    /// Une recette écrite sur l'app ; ses ingrédients viennent de la recherche.
    func createRecipe(_ body: RecipeCreateBody, hits: [SearchHit]) async -> ApiResult<Void> {
        for hit in hits { await cacheIfOff(hit) }
        return await send("POST", "/api/recipes", body)
    }

    /// Un produit venu d'Open Food Facts doit être en base avant d'être référencé.
    private func cacheIfOff(_ hit: SearchHit) async {
        guard hit.origin == "off" else { return }
        let product = CacheProductBody(barcode: hit.ref, name: hit.name, per100g: hit.per100g, servingSizeG: hit.servingSizeG, source: "off")
        _ = await send("POST", "/api/products", product)
    }

    func kudos(sessionId: Int, given: Bool) async -> ApiResult<Void> {
        await send("PUT", "/api/social/kudos", KudosBody(sessionId: sessionId, given: given))
    }

    // MARK: Séances.

    func startSession(templateId: Int?) async -> ApiResult<StartedSession> {
        let body = StartSessionBody(templateId: templateId, free: templateId == nil)
        return decode(await raw("POST", "/api/training/sessions", body: encode(body)), as: StartedSession.self)
    }

    func runner(sessionId: Int) async -> ApiResult<Runner> { await get("/api/training/sessions/\(sessionId)/runner") }

    func recordSet(_ body: SetBody) async -> ApiResult<Void> { await send("POST", "/api/training/sets", body) }

    func finishSession(_ sessionId: Int) async -> ApiResult<Void> {
        await send("POST", "/api/training/sessions/\(sessionId)", ActionBody(action: "finish"))
    }

    func discardSession(_ sessionId: Int) async -> ApiResult<Void> { await send("DELETE", "/api/training/sessions/\(sessionId)") }

    func setVisibility(sessionId: Int, visibility: String) async -> ApiResult<Void> {
        await send("PATCH", "/api/training/sessions/\(sessionId)/visibility", VisibilityBody(visibility: visibility))
    }

    func favoriteSession(_ sessionId: Int) async -> ApiResult<Void> {
        await send("POST", "/api/training/sessions/\(sessionId)/favorite", NameBody())
    }

    func addSessionExercise(sessionId: Int, exerciseId: Int) async -> ApiResult<Void> {
        await send("POST", "/api/training/sessions/\(sessionId)/exercises", ExerciseIdBody(exerciseId: exerciseId))
    }

    func exercises() async -> ApiResult<ExercisesResponse> { await get("/api/training/exercises") }

    func compose(_ body: ComposeBody) async -> ApiResult<ComposeResponse> {
        decode(await raw("POST", "/api/training/templates", body: encode(body)), as: ComposeResponse.self)
    }

    func analyseLog(_ text: String) async -> ApiResult<AnalyseResponse> {
        decode(await raw("POST", "/api/training/import", body: encode(AnalyseBody(text: text))), as: AnalyseResponse.self)
    }

    func saveLog(date: String, lines: [WrittenLine]) async -> ApiResult<SavedLog> {
        decode(await raw("POST", "/api/training/import", body: encode(SaveLogBody(sessionDate: date, lines: lines))), as: SavedLog.self)
    }

    /// Les journées lues dans Santé, en un seul envoi.
    func postActivity(_ days: [ActivityDay]) async -> ApiResult<Void> {
        await send("POST", "/api/activity", ActivityBatch(days: days))
    }

    func weighIn(_ weightKg: Double) async -> ApiResult<Void> {
        await send("POST", "/api/weight", WeighInBody(weightKg: weightKg))
    }

    func saveProfile(_ profile: BodyProfile) async -> ApiResult<TargetResponse> {
        decode(await raw("PUT", "/api/profile", body: encode(profile)), as: TargetResponse.self)
    }

    func saveIdentity(handle: String, displayName: String?) async -> ApiResult<Void> {
        await send("PUT", "/api/social/identity", IdentityBody(handle: handle, displayName: displayName))
    }

    func savePreferences(_ preferences: TrainingPreferences) async -> ApiResult<Void> {
        await send("PUT", "/api/training/preferences", preferences)
    }

    func generateProgram() async -> ApiResult<Void> { await send("POST", "/api/training", GenerateBody()) }

    // MARK: Mécanique.

    private func get<T: Decodable>(_ path: String) async -> ApiResult<T> {
        decode(await raw("GET", path, body: nil), as: T.self)
    }

    private func send(_ method: String, _ path: String, _ body: some Encodable) async -> ApiResult<Void> {
        await raw(method, path, body: encode(body)).map { _ in () }
    }

    private func send(_ method: String, _ path: String) async -> ApiResult<Void> {
        await raw(method, path, body: nil).map { _ in () }
    }

    private func encode(_ body: some Encodable) -> Data? {
        try? encoder.encode(body)
    }

    private func decode<T: Decodable>(_ result: ApiResult<Data>, as type: T.Type) -> ApiResult<T> {
        result.flatMap { data in
            do {
                return .success(try decoder.decode(type, from: data))
            } catch {
                return .failure(ApiFailure(status: 0, code: "malformed", message: "Réponse du serveur illisible."))
            }
        }
    }

    /**
     Un appel, corps de réponse brut. `opening` marque l'ouverture de session :
     pas de jeton envoyé, et un 401 y veut dire « mauvais mot de passe », pas
     « session expirée ».
     */
    private func raw(
        _ method: String,
        _ path: String,
        body: Data?,
        opening: Bool = false,
        keepSession: Bool = false
    ) async -> ApiResult<Data> {
        guard let url = URL(string: baseURL + path) else {
            return .failure(ApiFailure(status: 0, code: "network", message: "Adresse du serveur invalide."))
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("mobile", forHTTPHeaderField: "X-Client")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if !opening, let token = TokenStore.read() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            return .failure(ApiFailure(status: 0, code: "network", message: "Serveur injoignable. Vérifie ta connexion."))
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200 ..< 300).contains(status) {
            return .success(data)
        }
        if status == 401, !opening, !keepSession { signOut() }
        let detail = (try? decoder.decode(ApiErrorBody.self, from: data))?.error
        return .failure(ApiFailure(status: status, code: detail?.code, message: detail?.message ?? "Erreur \(status)."))
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Encodé pour une valeur de paramètre : `&`, `=`, `+` compris.
    var queryEncoded: String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#")
        return addingPercentEncoding(withAllowedCharacters: allowed) ?? self
    }
}
