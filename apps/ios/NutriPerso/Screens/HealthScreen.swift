import SwiftUI

/**
 Santé : le pont HealthKit, ouvert depuis la ligne Santé de Moi.

 Les maquettes ne dessinent que la tuile Activité et la ligne de réglage ; cet
 écran en reprend la couleur (Corps) et les briques, comme sur Android. Les
 chiffres viennent du serveur (`/api/me`, `healthBridge`) : c'est lui qui
 décide si la cible suit la mesure, l'écran ne recalcule rien.
 */
struct HealthScreen: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var asked: Bool?
    @State private var syncing = false
    @State private var me = Loaded<MeResponse>()
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let bodyColors = Domains.body
        ScreenColumn(withTabBar: false) {
            BackLink(label: "Moi", action: onBack)
            Text("Santé").textStyle(TextStyles.screenTitle).padding(.horizontal, 4)
            Text("Ta dépense active du jour, lue dans Santé. Dès trois journées reçues, la cible suit ta dépense "
                + "réelle, en médiane sur quatorze jours, au lieu du niveau d'activité déclaré.")
                .textStyle(TextStyles.secondary)
                .padding(.horizontal, 4)
            if let bridge = me.value?.healthBridge { BridgeCard(bridge: bridge) }
            if !model.health.isAvailable {
                EmptyCard(
                    title: "Santé indisponible",
                    text: "Cet appareil n'a pas l'app Santé. La cible reste calculée sur le niveau d'activité déclaré."
                )
            } else if asked == false {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ce que l'app lit").textStyle(nt(14, 600))
                    Text("L'énergie active, sur les trente derniers jours. Elle n'en garde qu'un total par jour, "
                        + "n'écrit rien dans Santé et ne lit rien en arrière-plan.")
                        .textStyle(TextStyles.secondary)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
                PrimaryButton(text: "Autoriser l'accès", colors: bodyColors, height: 48, busy: syncing, textSize: 15, action: allow)
            } else if asked == true {
                PrimaryButton(text: "Synchroniser maintenant", colors: bodyColors, height: 48, busy: syncing, textSize: 15, action: sync)
                Text("La synchronisation se fait seule à chaque ouverture de l'app, et rattrape les jours manqués.")
                    .textStyle(nt(12.5, 400, Neutrals.muted))
                    .padding(.horizontal, 4)
                SectionCaps(text: "Accès")
                HStack(spacing: 12) {
                    LucideIcon(.slidersHorizontal, 17, Neutrals.muted)
                    Text("Gérer l'accès dans Réglages").textStyle(TextStyles.bodyStrong).frame(maxWidth: .infinity, alignment: .leading)
                    LucideIcon(.chevronRight, 16, Neutrals.faint)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .card()
                .tap {
                    if let settings = URL(string: UIApplication.openSettingsURLString) { openURL(settings) }
                }
                Text("Dans Réglages › Santé › Accès aux données et appareils › NutriPerso.")
                    .textStyle(nt(12.5, 400, Neutrals.muted))
                    .padding(.horizontal, 4)
            }
        }
        .task(id: model.revision) { me.take(await model.api.me()) }
        // Revenir de Réglages peut tout changer : on relit l'état à chaque retour.
        .task(id: scenePhase) { asked = await model.health.wasAsked() }
    }

    private func allow() {
        syncing = true
        Task {
            let shown = await model.health.requestAccess()
            asked = await model.health.wasAsked()
            syncing = false
            if shown { sync() }
        }
    }

    private func sync() {
        syncing = true
        Task {
            let sent = await model.syncHealthNow(force: true)
            syncing = false
            switch sent {
            case nil: model.toast("La synchronisation a échoué. Réessaie dans un instant.")
            // HealthKit tait un refus de lecture : il ressemble à trente jours vides.
            case 0: model.toast("Aucune dépense trouvée dans Santé sur 30 jours")
            case let count?: model.toast("\(count) journée\(count > 1 ? "s" : "") synchronisée\(count > 1 ? "s" : "")")
            }
        }
    }
}

private struct BridgeCard: View {
    let bridge: HealthBridge

    var body: some View {
        let bodyColors = Domains.body
        let missing = max(bridge.requiredDays - bridge.dayCount, 0)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Activité (Santé)").textStyle(nt(11.5, 600, bodyColors.textOnLight))
                Spacer()
                if missing == 0 {
                    Badge(text: "Actif", background: Domains.training.soft, foreground: Domains.training.textOnLight)
                } else if bridge.lastDay != nil {
                    Badge(text: "En attente", background: Neutrals.chip, foreground: Neutrals.muted)
                }
            }
            line("Dernière journée reçue", bridge.lastDay.map { day in
                formatDay(day) + (bridge.lastKcal.map { " · \(formatInt($0)) kcal" } ?? "")
            } ?? "—")
            line("Dépense médiane", bridge.dayCount == 0 ? "—" : "\(formatInt(bridge.typicalKcal)) kcal sur \(bridge.dayCount) j")
            Hairline(color: bodyColors.seg)
            Text(missing == 0
                ? "La cible suit ta dépense mesurée."
                : "Encore \(missing) journée\(missing > 1 ? "s" : "") avant que la cible bascule sur la mesure.")
                .textStyle(nt(12.5, 400, bodyColors.textOnLight))
        }
        .padding(14)
        .tinted(bodyColors.soft, radius: Radius.tile)
        // Même seuil que la page web : au-delà, c'est la source qui se trompe.
        if bridge.peakKcal > 4000 {
            Text("Une journée atteint \(formatInt(bridge.peakKcal)) kcal actives, ce qu'aucun corps ne dépense. "
                + "La cible l'ignore : elle est calculée sur la médiane. Vérifie l'app qui écrit dans Santé.")
                .textStyle(nt(13, 500, Macros.protein.text))
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .tinted(Macros.protein.track, radius: Radius.tile)
        }
    }

    private func line(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).textStyle(nt(13, 400, Neutrals.muted))
            Spacer()
            Text(value).textStyle(nt(13.5, 600))
        }
    }

    /// « Aujourd'hui », « Hier », sinon « Jeudi 2 octobre ».
    private func formatDay(_ iso: String) -> String {
        var paris = Calendar(identifier: .gregorian)
        paris.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
        let parts = paris.dateComponents([.year, .month, .day], from: Date())
        let today = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        if iso == today { return "Aujourd'hui" }
        if iso == addDays(today, -1) { return "Hier" }
        return formatLongDate(iso)
    }
}
