import SwiftUI

/// Retour à gauche, une action facultative à droite.
private struct BackRow<Trailing: View>: View {
    let label: String
    let onBack: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack {
            BackLink(label: label, action: onBack)
            Spacer()
            trailing
        }
        .padding(.horizontal, 4)
    }
}

/// Moi (C6) : identité, poids, records du mois, régularité, réglages.
struct MeScreen: View {
    let model: AppModel
    let onBack: () -> Void
    let onProgress: () -> Void
    let onWeigh: () -> Void
    let onAccount: () -> Void
    let onHealth: () -> Void
    let onPremium: () -> Void

    @State private var me = Loaded<MeResponse>()
    @State private var reload = 0
    @State private var appearance = 0
    @State private var reminderOn = false
    /// Faux si les notifications ont été refusées dans Réglages.
    @State private var notificationsAllowed = true
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScreenColumn(withTabBar: false) {
            BackRow(label: "Retour", onBack: onBack) {
                LucideIcon(.settings, 20, Neutrals.muted).tap(onAccount).accessibilityLabel("Compte et données")
            }
            LoadedGate(loaded: me, onRetry: { reload += 1 }) { data in
                identity(data)
                weight(data)
                HStack(spacing: 10) {
                    trainingTile("Records ce mois", "\(data.recordsThisMonth)", data.topRecord ?? "Aucun pour l'instant")
                    trainingTile("Régularité", "\(data.activeWeeks)/\(data.weeks)", "semaines actives")
                }
                .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 12) {
                    LucideIcon(.trendingUp, 18, Domains.training.fill)
                    Text("Progression détaillée").textStyle(TextStyles.bodyStrong).frame(maxWidth: .infinity, alignment: .leading)
                    LucideIcon(.chevronRight, 16, Neutrals.faint)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .card()
                .tap(onProgress)
                settings(data)
            }
        }
        .task(id: "\(model.revision)-\(reload)") {
            me.take(await model.api.me())
            await model.purchases.load(model.api)
        }
        .task(id: scenePhase) {
            reminderOn = model.reminders.enabled
            notificationsAllowed = await model.reminders.allowed()
        }
    }

    private func identity(_ data: MeResponse) -> some View {
        HStack(spacing: 12) {
            Avatar(initials: initialsOf(data.identity), size: 48, background: Domains.body.fill, foreground: .white, fontSize: 16)
            VStack(alignment: .leading, spacing: 0) {
                Text(data.identity.displayName ?? data.identity.handle.map { "@\($0)" } ?? "Moi")
                    .textStyle(nt(22, 600, line: 1.2, tracking: -0.03))
                Text("\(data.gym ?? "Salle non précisée") · \(data.sessionsPerWeek) séances par semaine")
                    .textStyle(TextStyles.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 4)
    }

    private func weight(_ data: MeResponse) -> some View {
        let body = Domains.body
        // Même règle que la page web : 45 à 90 % de la hauteur entre le plus
        // bas et le plus haut, 60 % à plat, 6 % sans pesée.
        let known = data.weights.compactMap { $0 }
        let low = known.min() ?? 0
        let high = known.max() ?? 0
        let ratios = data.weights.map { value -> Double in
            guard let value else { return 0.06 }
            return known.count < 2 || high == low ? 0.6 : 0.45 + (value - low) / (high - low) * 0.45
        }
        let colors = data.weights.enumerated().map { index, value -> Color in
            if value == nil { return body.seg.opacity(0.4) }
            return index == data.weights.count - 1 ? body.fill : body.seg
        }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Poids · moyenne de la semaine").textStyle(nt(11.5, 600, body.textOnLight))
                    Text(valueWithUnit(
                        data.weekAverageKg.map(formatKg) ?? "—", " kg", unitSize: 13,
                        extra: data.weightChangeKg.flatMap { $0 == 0 ? nil : formatSigned($0) }, extraColor: body.textOnLight
                    ))
                    .textStyle(nt(26, 600, tracking: -0.03))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 6) {
                    LucideIcon(.plus, 12, .white)
                    Text("Pesée").textStyle(nt(12.5, 700, .white))
                }
                .padding(.horizontal, 12)
                .frame(height: 32)
                .background(body.fill, in: Capsule())
                .tap(onWeigh)
            }
            Bars(ratios: ratios, colors: colors).frame(height: 70)
        }
        .padding(14)
        .tinted(body.soft)
    }

    /// À 14 heures, si ni déjeuner ni dîner n'est noté.
    private func toggleReminder() {
        Task {
            if reminderOn {
                await model.reminders.disable()
                reminderOn = false
                model.toast("Rappel du déjeuner coupé")
            } else if await model.reminders.enable(today: model.today) {
                reminderOn = true
                notificationsAllowed = true
                model.toast("Rappel à 14 h si rien n’est noté")
            } else {
                model.toast("Notifications refusées : autorise-les dans Réglages")
            }
        }
    }

    private func trainingTile(_ label: String, _ value: String, _ note: String) -> some View {
        let training = Domains.training
        return VStack(alignment: .leading, spacing: 0) {
            Text(label).textStyle(nt(11.5, 600, training.textOnLight))
            Text(value).textStyle(nt(22, 600))
            Text(note).textStyle(TextStyles.small).lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .tinted(training.soft)
    }

    private func settings(_ data: MeResponse) -> some View {
        let training = Domains.training
        return VStack(spacing: 0) {
            SettingRow(icon: .sunMoon, label: "Apparence") {
                SegmentedPill(
                    options: ["Clair", "Sombre", "Auto"],
                    selected: appearance,
                    onSelect: { choice in
                        appearance = choice
                        if choice != 0 { model.toast("Seul le thème clair est dessiné pour l'instant") }
                    },
                    textStyle: nt(12, 500),
                    selectedWeight: 600,
                    padding: 2,
                    itemPadding: 3,
                    itemHorizontalPadding: 9,
                    fill: false
                )
            }
            Hairline()
            SettingRow(icon: .bell, label: "Rappel du déjeuner") {
                HStack(spacing: 8) {
                    // Activé mais refusé dans Réglages : rien ne sonnera, on le dit.
                    if reminderOn && !notificationsAllowed {
                        Badge(text: "Refusé", background: Neutrals.chip, foreground: Neutrals.muted)
                            .tap {
                                if let settings = URL(string: UIApplication.openSettingsURLString) { openURL(settings) }
                            }
                            .accessibilityHint("Autoriser les notifications dans Réglages")
                    }
                    NutriSwitch(isOn: reminderOn, action: toggleReminder)
                        .accessibilityLabel("Rappel du déjeuner")
                }
            }
            Hairline()
            SettingRow(icon: .activity, label: "Santé", action: onHealth) {
                HStack(spacing: 8) {
                    switch data.health {
                    case "active": Badge(text: "Actif", background: training.soft, foreground: training.textOnLight)
                    case "pending": Badge(text: "En attente", background: Neutrals.chip, foreground: Neutrals.muted)
                    default: Badge(text: "Inactif", background: Neutrals.chip, foreground: Neutrals.muted)
                    }
                    LucideIcon(.chevronRight, 16, Neutrals.faint)
                }
            }
            Hairline()
            SettingRow(icon: .star, label: "Abonnement", action: onPremium) {
                HStack(spacing: 8) {
                    if model.purchases.premium {
                        Badge(text: "Premium", background: Domains.nutrition.fill, foreground: Domains.nutrition.textOnFill)
                    } else {
                        Badge(text: "Gratuit", background: Neutrals.chip, foreground: Neutrals.muted)
                    }
                    LucideIcon(.chevronRight, 16, Neutrals.faint)
                }
            }
            Hairline()
            SettingRow(icon: .keyRound, label: "Compte et données", action: onAccount) {
                LucideIcon(.chevronRight, 16, Neutrals.faint)
            }
        }
        .card()
    }
}

private struct SettingRow<Trailing: View>: View {
    let icon: Lucide
    let label: String
    var action: (() -> Void)?
    @ViewBuilder let trailing: Trailing

    var body: some View {
        let row = HStack(spacing: 12) {
            LucideIcon(icon, 17, Neutrals.muted)
            Text(label).textStyle(TextStyles.bodyStrong).frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        if let action {
            row.tap(action)
        } else {
            row
        }
    }
}

private let periods = [(4, "4 sem."), (12, "12 sem."), (52, "1 an")]

/// Progression (C7) : tonnage et poids par semaine, puis le 1RM estimé par exercice.
struct ProgressScreen: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var period = 1
    @State private var progress = Loaded<ProgressResponse>()
    @State private var reload = 0

    var body: some View {
        ScreenColumn(withTabBar: false) {
            BackRow(label: "Moi", onBack: onBack) { EmptyView() }
            HStack(alignment: .bottom) {
                Text("Progression").textStyle(TextStyles.screenTitle)
                Spacer()
                SegmentedPill(
                    options: periods.map(\.1),
                    selected: period,
                    onSelect: { period = $0 },
                    track: Neutrals.periodTrack,
                    textStyle: nt(12, 500),
                    selectedWeight: 600,
                    padding: 2,
                    itemPadding: 4,
                    itemHorizontalPadding: 10,
                    fill: false
                )
            }
            .padding(.horizontal, 4)
            LoadedGate(loaded: progress, onRetry: { reload += 1 }) { data in
                chart(data)
                exercises(data.exercises)
                Text("L'écart compare la dernière séance à la première de la période, sur le 1RM estimé quand l'exercice se charge.")
                    .textStyle(nt(12, 400, Neutrals.muted))
                    .padding(.horizontal, 4)
            }
        }
        .task(id: "\(period)-\(model.revision)-\(reload)") { progress.take(await model.api.progress(period: periods[period].0)) }
    }

    private func chart(_ data: ProgressResponse) -> some View {
        let training = Domains.training
        let body = Domains.body
        let maxVolume = max(data.weeks.map(\.volumeKg).max() ?? 1, 1)
        let volume = data.volumeChange.map { "\($0 > 0 ? "+" : $0 < 0 ? "−" : "")\(abs($0)) %" } ?? "—"
        let weight = data.weightChangeKg.map { "\(formatSigned($0)) kg" } ?? "—"
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Tonnage et poids").textStyle(nt(13, 600))
                Spacer()
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(training.fill).frame(width: 8, height: 8)
                    Text("tonnage").textStyle(nt(11.5, 400, Neutrals.muted))
                }
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(body.fill).frame(width: 10, height: 3)
                    Text("poids").textStyle(nt(11.5, 400, Neutrals.muted))
                }
                .padding(.leading, 8)
            }
            ZStack {
                Bars(
                    ratios: data.weeks.map { max($0.volumeKg / maxVolume, 0.02) },
                    colors: data.weeks.indices.map { $0 == data.weeks.count - 1 ? training.fill : training.seg },
                    gap: data.period == 52 ? 2 : 6
                )
                WeightLine(weights: data.weights, color: body.fill)
            }
            .frame(height: 130)
            Hairline()
            HStack(spacing: 0) {
                figure("\(data.sessions)", "séances", training.fill)
                figure(volume, "tonnage", training.fill)
                figure(weight, "poids", body.textOnLight)
            }
        }
        .padding(14)
        .card()
    }

    private func figure(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 0) {
            Text(value).textStyle(nt(16, 600, color))
            Text(label).textStyle(nt(11, 400, Neutrals.muted))
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func exercises(_ rows: [ExerciseProgressRow]) -> some View {
        let training = Domains.training
        if rows.isEmpty {
            EmptyCard(title: "Rien sur cette période", text: "Aucune série enregistrée sur cette période.")
        } else {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Text("Exercice").textStyle(nt(11.5, 400, Neutrals.muted)).frame(maxWidth: .infinity, alignment: .leading)
                    Text("1RM est.").textStyle(nt(11.5, 400, Neutrals.muted)).frame(width: 72, alignment: .trailing)
                    Text("Écart").textStyle(nt(11.5, 400, Neutrals.muted)).frame(width: 72, alignment: .trailing)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                ForEach(rows) { exercise in
                    Hairline()
                    HStack(spacing: 0) {
                        Text(exercise.name).textStyle(TextStyles.bodyStrong).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        Text(exercise.value).textStyle(nt(14, 600)).frame(width: 72, alignment: .trailing)
                        Group {
                            if exercise.progressed {
                                Badge(text: exercise.change ?? "", background: training.soft, foreground: training.textOnLight, size: 12)
                            } else {
                                Badge(text: exercise.change ?? "1 séance", background: Neutrals.chip, foreground: Neutrals.muted, size: 12)
                            }
                        }
                        .frame(width: 72, alignment: .trailing)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
            }
            .card()
        }
    }
}

/// La courbe du poids posée sur les barres : de 20 à 90 sur une hauteur de 130, comme la page web.
private struct WeightLine: View {
    let weights: [Double?]
    let color: Color

    var body: some View {
        Canvas { context, size in
            let weighed = weights.enumerated().compactMap { index, value in value.map { (index, $0) } }
            guard weighed.count > 1, let low = weighed.map(\.1).min(), let high = weighed.map(\.1).max() else { return }
            let span = high > low ? high - low : 1
            let column = size.width / CGFloat(max(weights.count, 1))
            var path = Path()
            for (i, point) in weighed.enumerated() {
                let location = CGPoint(
                    x: CGFloat(point.0) * column + column / 2,
                    y: size.height * (20 + CGFloat((high - point.1) / span) * 70) / 130
                )
                if i == 0 { path.move(to: location) } else { path.addLine(to: location) }
            }
            context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
        }
    }
}
