import Foundation
import UserNotifications

/**
 Le rappel du déjeuner, programmé sur le téléphone.

 Même règle que le serveur (`services/reminders.ts`) : un seul rappel par
 jour, à 14 heures à Paris, et seulement si ni déjeuner ni dîner n'est noté.
 iOS ne laisse pas une app vérifier le journal à heure fixe sans notification
 venue d'un serveur : les rappels des quatorze prochains jours sont donc posés
 d'avance, et celui du jour est retiré dès que l'app voit le repas noté — à
 chaque lecture d'Aujourd'hui, donc après chaque ajout. Rien n'est envoyé au
 serveur ni conservé par lui.
 */
@MainActor
final class LunchReminder {
    static let hour = 14
    private static let horizonDays = 14
    private static let prefix = "lunch-"
    private static let enabledKey = "lunchReminder"

    private let center = UNUserNotificationCenter.current()
    private let paris: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
        return calendar
    }()

    /// Une préférence de cet appareil, comme l'abonnement d'un navigateur sur le web.
    var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: Self.enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.enabledKey) }
    }

    /// Faux si les notifications ont été refusées, ici ou plus tard dans Réglages.
    func allowed() async -> Bool {
        let status = await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional || status == .ephemeral
    }

    /// Demande l'autorisation au besoin, puis active. Faux si elle est refusée.
    func enable(today: TodayResponse?) async -> Bool {
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return false }
        enabled = true
        await plan(after: today)
        return true
    }

    func disable() async {
        enabled = false
        await removePending()
    }

    /// Retire les rappels posés sans changer la préférence : à la déconnexion.
    func pause() async {
        await removePending()
    }

    /**
     Repose les rappels à venir. Celui du jour saute si un déjeuner ou un
     dîner est noté, ou si 14 heures est passé : le dîner compte aussi, un
     repas de midi rangé sous le mauvais repas reste un repas noté.
     */
    func plan(after today: TodayResponse?) async {
        guard enabled else { return }
        await removePending()
        for (day, fire) in days(after: today, now: Date()) {
            let content = UNMutableNotificationContent()
            content.title = "Rien de noté ce midi"
            content.body = "Deux touches maintenant valent mieux qu’un souvenir approximatif ce soir."
            content.sound = .default
            content.userInfo = ["open": "meal"]
            var components = paris.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            components.timeZone = paris.timeZone
            let request = UNNotificationRequest(
                identifier: Self.prefix + day,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            )
            try? await center.add(request)
        }
    }

    /**
     Les jours à rappeler : les quatorze à partir d'aujourd'hui (jour de Paris,
     celui du serveur), sans ceux dont 14 heures est passé, ni aujourd'hui si
     un déjeuner ou un dîner est noté.
     */
    func days(after today: TodayResponse?, now: Date) -> [(day: String, fire: Date)] {
        let start = today?.today ?? isoDay(paris.dateComponents([.year, .month, .day], from: now))
        let noted = today?.entries.contains { $0.meal == "lunch" || $0.meal == "dinner" } ?? false
        return (0 ..< Self.horizonDays).compactMap { offset in
            let day = addDays(start, offset)
            guard let fire = fireDate(day), fire > now, !(offset == 0 && noted) else { return nil }
            return (day, fire)
        }
    }

    /// Les rappels en attente, pour les vérifications.
    func pendingDays() async -> [String] {
        await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(Self.prefix) }
            .map { String($0.dropFirst(Self.prefix.count)) }
            .sorted()
    }

    private func removePending() async {
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// 14 heures à Paris, ce jour-là.
    private func fireDate(_ iso: String) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return paris.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: Self.hour))
    }

    private func isoDay(_ parts: DateComponents) -> String {
        String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

/**
 Reçoit le toucher sur un rappel et le transmet à l'app : la feuille Repas
 s'ouvre. Un rappel qui tombe pendant qu'on est dans l'app s'affiche aussi.
 */
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate {
    private let onOpenMeal: @MainActor () -> Void

    init(onOpenMeal: @escaping @MainActor () -> Void) {
        self.onOpenMeal = onOpenMeal
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let open = response.notification.request.content.userInfo["open"] as? String
        guard open == "meal" else { return }
        await onOpenMeal()
    }
}
