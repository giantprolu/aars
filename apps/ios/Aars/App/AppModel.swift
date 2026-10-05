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

    /// Le mot court des colonnes du plan : matin, midi, soir, collation.
    var moment: String {
        switch self {
        case .breakfast: "Matin"
        case .lunch: "Midi"
        case .snack: "Collation"
        case .dinner: "Soir"
        }
    }

    static func fromApi(_ value: String) -> Meal {
        Meal(rawValue: value) ?? .snack
    }

    /// Un moment de recette ou de plat : `nil` reste `nil`, une valeur inconnue aussi.
    static func orNil(_ value: String?) -> Meal? {
        value.flatMap(Meal.init(rawValue:))
    }

    /// L'ordre du plan et des filtres, le même que la PWA : matin, midi, soir, collation.
    static let planOrder: [Meal] = [.breakfast, .lunch, .dinner, .snack]

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
    let health = HealthSync()
    let reminders = LunchReminder()
    let purchases = PurchaseStore()

    /// Une action a buté sur une limite gratuite : la coquille ouvre Premium, puis remet à faux.
    var paywallRequested = false

    /// Faux tant que l'accès à Santé n'a pas été demandé : Aujourd'hui propose de le relier.
    private(set) var healthLinked: Bool?

    /// Un rappel touché : la coquille ouvre la feuille Repas, puis remet à faux.
    var pendingMealSheet = false

    /// Instant de la dernière synchronisation Santé réussie, en mémoire seulement.
    @ObservationIgnored private var healthSyncedAt: Date?
    @ObservationIgnored private var healthSyncing = false

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
            // Plus de session, plus de rappel : ils reviendront à la connexion.
            await reminders.pause()
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
                purchases.listen(api)
                await refreshToday()
                syncHealth()
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
            await reminders.plan(after: value)
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

    /**
     Relit Santé et pousse les trente derniers jours.

     Appelée à chaque retour au premier plan, au plus une fois par heure, et à
     la demande depuis l'écran Santé (`force`). Silencieuse tant que l'accès
     n'a pas été demandé : c'est l'écran Santé qui invite à le donner. Rend le
     nombre de journées envoyées, ou `nil` en cas d'échec.
     */
    func syncHealthNow(force: Bool = false) async -> Int? {
        guard gate == .ready, !healthSyncing else { return nil }
        if !force, let last = healthSyncedAt, Date().timeIntervalSince(last) < 3600 { return nil }
        guard await health.wasAsked() else { return nil }
        healthSyncing = true
        defer { healthSyncing = false }
        guard let days = await health.readDays() else { return nil }
        if days.isEmpty {
            healthSyncedAt = Date()
            return 0
        }
        switch await api.postActivity(days) {
        case .success:
            healthSyncedAt = Date()
            revision += 1
            await refreshToday()
            return days.count
        case .failure:
            return nil
        }
    }

    func syncHealth() {
        Task {
            healthLinked = await health.wasAsked()
            _ = await syncHealthNow()
        }
    }

    /**
     Relie Santé en un geste, sans raccourci ni jeton comme sur la PWA : la
     demande d'accès du système, puis la première synchronisation. HealthKit
     tait un refus de lecture : il se voit à trente jours vides.
     */
    func linkHealth() async {
        _ = await health.requestAccess()
        healthLinked = await health.wasAsked()
        guard healthLinked == true else { return }
        switch await syncHealthNow(force: true) {
        case nil: toast("La synchronisation a échoué. Réessaie dans un instant.")
        case 0: toast("Aucune dépense trouvée dans Santé sur 30 jours")
        case let count?: toast("Santé reliée · \(count) journée\(count > 1 ? "s" : "") synchronisée\(count > 1 ? "s" : "")")
        }
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
                if failure.code == "premium_required" { paywallRequested = true }
            }
        }
    }
}

private extension CachedProduct {
    var hit: SearchHit {
        SearchHit(kind: "product", ref: ref, name: name, per100g: per100g, servingSizeG: servingSizeG, origin: "cache")
    }
}
