import Foundation
import HealthKit

/**
 Le pont Santé de l'app iOS : HealthKit, lu au premier plan.

 L'app ne lit qu'un type, l'énergie active, que l'iPhone et la montre
 enregistrent directement, et n'en garde qu'un total par jour, poussé sur
 `POST /api/activity` avec le jeton de session. Pas de lecture en
 arrière-plan : chaque ouverture relit les trente derniers jours, ce qui
 rattrape toute journée manquée tant que l'app est ouverte une fois par mois.
 Rien n'est écrit dans Santé.
 */
@MainActor
final class HealthSync {
    static let windowDays = 30
    /// Au-delà du plafond du serveur, la valeur est fausse et ferait refuser tout le lot.
    private static let maxKcal = 20000.0

    private let store = HKHealthStore()
    private let activeEnergy = HKQuantityType(.activeEnergyBurned)

    /// Les jours du journal sont ceux de Paris, comme côté serveur.
    private let paris: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
        return calendar
    }()

    /// Faux sur un appareil sans Santé.
    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    /**
     Vrai une fois la demande d'accès présentée. HealthKit ne dit pas si la
     lecture a été accordée, par confidentialité : un refus se voit seulement
     à des journées vides.
     */
    func wasAsked() async -> Bool {
        guard isAvailable else { return false }
        let status = try? await store.statusForAuthorizationRequest(toShare: [], read: [activeEnergy])
        return status == .unnecessary
    }

    /// Présente la demande d'accès en lecture, une seule fois.
    func requestAccess() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await store.requestAuthorization(toShare: [], read: [activeEnergy])
            return true
        } catch {
            return false
        }
    }

    /**
     L'énergie active des `days` derniers jours, aujourd'hui compris, jour par
     jour. Un jour sans aucune mesure est omis plutôt qu'envoyé à zéro : le
     téléphone resté dans un tiroir ne doit pas tirer la médiane vers le bas.
     `nil` si la lecture échoue.
     */
    func readDays(_ days: Int = windowDays) async -> [ActivityDay]? {
        let today = paris.startOfDay(for: Date())
        guard let start = paris.date(byAdding: .day, value: -(days - 1), to: today),
              let end = paris.date(byAdding: .day, value: 1, to: today)
        else { return nil }
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: activeEnergy, predicate: HKQuery.predicateForSamples(withStart: start, end: end)),
            options: .cumulativeSum,
            anchorDate: today,
            intervalComponents: DateComponents(day: 1)
        )
        guard let collection = try? await descriptor.result(for: store) else { return nil }
        var result: [ActivityDay] = []
        collection.enumerateStatistics(from: start, to: end) { statistics, _ in
            guard let sum = statistics.sumQuantity() else { return }
            let kcal = sum.doubleValue(for: .kilocalorie())
            guard kcal.isFinite, kcal >= 0, kcal <= Self.maxKcal else { return }
            let day = self.paris.dateComponents([.year, .month, .day], from: statistics.startDate)
            result.append(ActivityDay(
                day: String(format: "%04d-%02d-%02d", day.year ?? 0, day.month ?? 0, day.day ?? 0),
                activeKcal: (kcal * 10).rounded() / 10
            ))
        }
        return result
    }
}
