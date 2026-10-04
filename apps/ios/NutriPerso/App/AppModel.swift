import Foundation
import Observation

/// Les quatre repas de l'API, dans l'ordre du sélecteur.
enum Meal: String, CaseIterable, Sendable {
    case breakfast, lunch, snack, dinner

    var label: String {
        switch self {
        case .breakfast: "Petit-déjeuner"
        case .lunch: "Déjeuner"
        case .snack: "Collation"
        case .dinner: "Dîner"
        }
    }

    var short: String {
        self == .breakfast ? "Petit-déj" : label
    }

    var inPhrase: String {
        switch self {
        case .breakfast: "au petit-déjeuner"
        case .lunch: "au déjeuner"
        case .snack: "à la collation"
        case .dinner: "au dîner"
        }
    }

    static func fromApi(_ value: String) -> Meal {
        Meal(rawValue: value) ?? .snack
    }

    /// Le repas que l'heure suggère, mêmes bornes que `mealForHour` (lib/meal.ts).
    static func forNow() -> Meal {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
        let hour = calendar.component(.hour, from: Date())
        switch hour {
        case ..<11: return .breakfast
        case ..<15: return .lunch
        case ..<18: return .snack
        default: return .dinner
        }
    }
}

/// Où en est l'app une fois la session ouverte.
enum Gate {
    case checking, onboarding, ready
}

/**
 L'état partagé de l'app : session, journal du jour, données du bouton +.

 Chaque écriture relit ensuite l'écran Aujourd'hui : le serveur reste la seule
 source de vérité (CLAUDE.md, pas de stockage local comme référence).
 */
@MainActor
@Observable
final class AppModel {
    let api = Api()
    let toasts = ToastCenter()

    private(set) var gate = Gate.checking
    private(set) var today: TodayResponse?
    private(set) var todayError: String?
    private(set) var quick: QuickAddContext?

    /// Augmente à chaque écriture réussie : les écrans s'en servent pour relire.
    private(set) var revision = 0

    /// Une écriture est en vol : les boutons des feuilles patientent.
    private(set) var writing = false

    /// Vrai juste après l'onboarding : Aujourd'hui montre la carte d'arrivée.
    private(set) var welcome = false

    func bump() {
        revision += 1
    }

    /// Suit l'ouverture et la fermeture de session (`RootView`).
    func sessionChanged() async {
        if api.signedIn {
            await checkProfile()
        } else {
            gate = .checking
            today = nil
            quick = nil
            welcome = false
        }
    }

    /// Sans profil corporel, le compte vient d'être créé : direction l'onboarding.
    func checkProfile() async {
        gate = .checking
        switch await api.profile() {
        case .success(let response):
            if response.profile == nil {
                gate = .onboarding
            } else {
                gate = .ready
                await refreshToday()
            }
        case .failure(let failure):
            // Hors ligne : on ouvre quand même l'app, l'écran dira l'erreur.
            gate = .ready
            todayError = failure.message
        }
    }

    func finishOnboarding() {
        welcome = true
        gate = .ready
        Task { await refreshToday() }
    }

    func signOut() {
        api.signOut()
    }

    func refreshToday() async {
        switch await api.today() {
        case .success(let value):
            today = value
            todayError = nil
        case .failure(let failure):
            todayError = failure.message
        }
    }

    /// Lu à l'ouverture du + : toujours frais.
    func loadQuick() {
        Task {
            if let value = await api.quickAdd().value { quick = value }
        }
    }

    func search(_ query: String) async -> ApiResult<[SearchHit]> {
        await api.search(query: query).map(\.hits)
    }

    /// Issue d'une lecture de code-barres.
    enum BarcodeOutcome {
        case found(SearchHit)
        case incomplete(PartialProduct)
        case unknown(String)
        case failed(String)
    }

    /// Cache produits, puis Open Food Facts, côté serveur (`/api/products/{code}/resolve`).
    func resolveBarcode(_ barcode: String) async -> BarcodeOutcome {
        switch await api.resolveBarcode(barcode) {
        case .failure(let failure):
            return .failed(failure.message)
        case .success(let body):
            if body.kind == "found", let product = body.product { return .found(product.hit) }
            if body.kind == "incomplete", let partial = body.partial { return .incomplete(partial) }
            return .unknown(barcode)
        }
    }

    /// Un produit complété à la main entre au cache, puis se note comme un autre.
    func saveManualProduct(barcode: String, name: String, per100g: MacroValues, servingSizeG: Double?) async -> SearchHit? {
        await api.saveManualProduct(barcode: barcode, name: name, per100g: per100g, servingSizeG: servingSizeG).value?.product.hit
    }

    func addRecent(_ recent: RecentFood, meal: Meal, done: @escaping () -> Void) {
        write({ await $0.repeatEntry(entryId: recent.entryId, meal: meal.rawValue) }, "\(recent.label) ajouté \(meal.inPhrase)", done)
    }

    func replayFavorite(_ favorite: QuickFavorite, meal: Meal, done: @escaping () -> Void) {
        write({ await $0.replayFavorite(id: favorite.id, meal: meal.rawValue) }, "\(favorite.name) ajouté \(meal.inPhrase)", done)
    }

    /// `fromScan` dit si l'aliment vient du scanner plutôt que de la recherche.
    func addHit(_ hit: SearchHit, quantityG: Int, meal: Meal, fromScan: Bool, done: @escaping () -> Void) {
        write(
            { await $0.addEntry(hit, quantityG: quantityG, meal: meal.rawValue, via: fromScan ? "barcode" : "search") },
            "\(hit.name) ajouté \(meal.inPhrase)",
            done
        )
    }

    func addManual(label: String, macros: MacroValues, meal: Meal, done: @escaping () -> Void) {
        write({ await $0.addManualEntry(label: label, macros: macros, meal: meal.rawValue) }, "\(label) ajouté \(meal.inPhrase)", done)
    }

    func weighIn(_ weightKg: Double, done: @escaping () -> Void) {
        write({ await $0.weighIn(weightKg) }, "Pesée enregistrée · \(formatKg(weightKg)) kg", done)
    }

    func eatPlanned(planId: Int, name: String) {
        write({ await $0.journalPlanned(planId: planId) }, "\(name) noté dans le journal", {})
    }

    func deleteEntry(_ entry: Entry) {
        write({ await $0.deleteEntry(id: entry.id) }, "\(entry.foodLabel) retiré du journal", {})
    }

    func saveFavorite(_ meal: Meal) {
        write({ await $0.saveFavorite(meal: meal.rawValue, name: nil) }, "\(meal.label) gardé en favori", {})
    }

    func toast(_ message: String) {
        toasts.show(message)
    }

    private func write(_ call: @escaping (Api) async -> ApiResult<Void>, _ success: String, _ done: @escaping () -> Void) {
        guard !writing else { return }
        writing = true
        Task {
            let result = await call(api)
            writing = false
            switch result {
            case .success:
                done()
                revision += 1
                toasts.show(success)
                await refreshToday()
            case .failure(let failure):
                toasts.show(failure.message)
            }
        }
    }
}

private extension CachedProduct {
    var hit: SearchHit {
        SearchHit(kind: "product", ref: ref, name: name, per100g: per100g, servingSizeG: servingSizeG, origin: "cache")
    }
}
