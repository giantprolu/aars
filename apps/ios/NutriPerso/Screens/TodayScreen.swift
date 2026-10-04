import SwiftUI

/// Aujourd'hui (C1) : la semaine, la jauge du jour, quatre tuiles, les repas notés.
struct TodayScreen: View {
    let model: AppModel
    let onMe: () -> Void
    let onPick: (AddSheet) -> Void
    let onOpenTab: (Tab) -> Void
    let onHistory: () -> Void
    let onEditGoal: () -> Void

    var body: some View {
        let data = model.today
        ScreenColumn {
            DomainHeader(title: "Aujourd'hui", subtitle: subtitle(data), initials: initialsOf(data?.identity), onAvatar: onMe)
            if let error = model.todayError {
                ErrorBanner(message: error) { Task { await model.refreshToday() } }
            }
            if let data {
                if model.welcome { WelcomeCard(data: data) }
                WeekStrip(data: data, onHistory: onHistory)
                CalorieCard(data: data, onEditTarget: onEditGoal)
                HStack(alignment: .top, spacing: 10) {
                    SessionTile(session: data.session) { onPick(.session) }
                    PlannedTile(meal: data.plannedMeal, onEat: { model.eatPlanned(planId: $0.planId, name: $0.name) }) {
                        onOpenTab(.kitchen)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .top, spacing: 10) {
                    WeightTile(weight: data.weight) { onPick(.weigh) }
                    ActivityTile(
                        activity: data.activity,
                        linkable: model.health.isAvailable && model.healthLinked == false
                    ) {
                        Task { await model.linkHealth() }
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                if data.entries.isEmpty {
                    EmptyCard(
                        title: "Rien de noté pour l'instant",
                        text: "Touche + puis Repas : cherche un aliment, scanne un code-barres, ou refais un récent."
                    )
                } else {
                    MealJournal(entries: data.entries, onDelete: model.deleteEntry, onFavorite: model.saveFavorite)
                }
            } else {
                Skeletons(heights: [70, 190, 128, 96])
            }
        }
        .refreshable { await model.refreshToday() }
    }

    private func subtitle(_ data: TodayResponse?) -> AttributedString {
        var text = AttributedString(data.map { formatLongDate($0.today) } ?? "")
        if data?.target?.trainingDay == true {
            text += AttributedString(" · ")
            text += styled("jour d'entraînement", size: 12.5, weight: 600, color: Domains.training.textOnLight)
        }
        return text
    }
}

private struct WeekStrip: View {
    let data: TodayResponse
    let onHistory: () -> Void

    var body: some View {
        let nutrition = Domains.nutrition
        let reference = data.target?.targetKcal ?? data.week.map(\.kcal).max() ?? 1
        VStack(spacing: 6) {
            HStack {
                Text("Semaine \(data.isoWeek)").textStyle(TextStyles.small)
                Spacer()
                LinkText(text: "Historique", color: nutrition.textOnLight, size: 12, chevron: true, action: onHistory)
            }
            HStack(spacing: 6) {
                ForEach(data.week, id: \.day) { day in
                    let isToday = day.day == data.today
                    let isPast = day.day < data.today
                    let ratio = min(max(day.kcal / max(reference, 1), 0), 1)
                    let empty = !isToday && (!isPast || ratio == 0)
                    VStack(spacing: 4) {
                        GeometryReader { geometry in
                            RoundedRectangle(cornerRadius: 4)
                                .fill(isToday && ratio > 0 ? nutrition.fill : isPast && ratio > 0 ? nutrition.light : Neutrals.emptyBar)
                                .frame(height: empty || ratio == 0 ? 3 : geometry.size.height * max(ratio, 0.1))
                                .frame(maxHeight: .infinity, alignment: .bottom)
                        }
                        .frame(height: 30)
                        Text(formatDayInitial(day.day))
                            .textStyle(isToday ? nt(11, 700, nutrition.textOnLight) : nt(11, 400, isPast ? Neutrals.muted : Neutrals.faint))
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .card()
    }
}

private struct CalorieCard: View {
    let data: TodayResponse
    let onEditTarget: () -> Void

    var body: some View {
        let nutrition = Domains.nutrition
        let target = data.target
        let eaten = data.totals.kcal
        VStack(spacing: 14) {
            HStack(spacing: 18) {
                Ring(size: 112, thickness: 10, track: nutrition.seg, parts: [(target.map { eaten / $0.targetKcal } ?? 0, nutrition.fill)]) {
                    VStack(spacing: 0) {
                        if let target {
                            let remaining = target.targetKcal - eaten
                            Text(formatInt(abs(remaining))).textStyle(TextStyles.ringValue)
                            Text(remaining >= 0 ? "restantes" : "en trop").textStyle(nt(11, 400, Neutrals.muted))
                        } else {
                            Text(formatInt(eaten)).textStyle(TextStyles.ringValue)
                            Text("mangées").textStyle(nt(11, 400, Neutrals.muted))
                        }
                    }
                }
                VStack(spacing: 10) {
                    MacroBar(label: "Protéines", value: data.totals.proteinG, target: target?.proteinG, colors: Macros.protein)
                    MacroBar(label: "Glucides", value: data.totals.carbsG, target: target?.carbsG, colors: Macros.carbs)
                    MacroBar(label: "Lipides", value: data.totals.fatG, target: target?.fatG, colors: Macros.fat)
                }
            }
            VStack(spacing: 12) {
                Hairline()
                HStack(spacing: 0) {
                    StatColumn(value: formatInt(eaten), label: "mangées")
                    Neutrals.divider.frame(width: 1)
                    StatColumn(
                        value: target.map { formatInt($0.targetKcal) } ?? "—",
                        label: "cible · modifier",
                        labelStyle: nt(11.5, 500, nutrition.textOnLight)
                    )
                    .tap(onEditTarget)
                    Neutrals.divider.frame(width: 1)
                    let cycle = target?.cycleKcal ?? 0
                    StatColumn(value: cycle == 0 ? "—" : formatSigned(cycle, decimals: 0), label: "entraînement", valueColor: Domains.training.textOnLight)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .card()
    }
}

private struct StatColumn: View {
    let value: String
    let label: String
    var valueColor: Color = Neutrals.ink
    var labelStyle: NT = nt(11.5, 400, Neutrals.muted)

    var body: some View {
        VStack(spacing: 0) {
            Text(value).textStyle(nt(16, 600, valueColor))
            Text(label).textStyle(labelStyle)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }
}

private struct TileHeader: View {
    let label: String
    let icon: Lucide
    let color: Color
    var weight: CGFloat = 600
    var alpha: Double = 1

    var body: some View {
        HStack {
            Text(label).textStyle(nt(11.5, weight, color)).opacity(alpha)
            Spacer(minLength: 4)
            LucideIcon(icon, 16, color)
        }
    }
}

private struct SessionTile: View {
    let session: QuickSession?
    let onStart: () -> Void

    var body: some View {
        let training = Domains.training
        let open = session?.kind == "open"
        VStack(alignment: .leading, spacing: 10) {
            TileHeader(label: open ? "Séance en cours" : "Séance du jour", icon: .dumbbell, color: training.textOnFill, weight: 500, alpha: 0.85)
            Text(session?.name ?? "Aucune séance prévue")
                .textStyle(nt(16, 600, training.textOnFill, line: 1.2))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            PillButton(text: open ? "Reprendre" : "Commencer", background: .white, foreground: training.fill, icon: .play, action: onStart)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 128, maxHeight: .infinity, alignment: .topLeading)
        .tinted(training.fill)
    }
}

private struct PlannedTile: View {
    let meal: PlannedMeal?
    let onEat: (PlannedMeal) -> Void
    let onPlan: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        VStack(alignment: .leading, spacing: 10) {
            TileHeader(label: meal?.meal == "lunch" ? "Ce midi" : "Ce soir", icon: .cookingPot, color: kitchen.textOnLight)
            VStack(alignment: .leading, spacing: 0) {
                Text(meal?.name ?? "Rien de prévu").textStyle(nt(15, 600, line: 1.2))
                if let meal {
                    Text(detail(meal)).textStyle(TextStyles.small)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            if let meal {
                if meal.eaten {
                    PillButton(text: "Mangé", background: kitchen.seg, foreground: kitchen.textOnLight, enabled: false) {}
                } else {
                    PillButton(text: "Manger", background: kitchen.fill, foreground: kitchen.textOnFill) { onEat(meal) }
                }
            } else {
                PillButton(text: "Planifier", background: kitchen.fill, foreground: kitchen.textOnFill, action: onPlan)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 128, maxHeight: .infinity, alignment: .topLeading)
        .tinted(kitchen.soft)
    }

    private func detail(_ meal: PlannedMeal) -> String {
        let parts = meal.servings == 1 ? "1 part" : "\(formatServings(meal.servings)) parts"
        return [meal.kcal.map { "\(formatInt($0)) kcal" }, parts].compactMap { $0 }.joined(separator: " · ")
    }
}

/// « 2 », « 1,5 » : une part entière sans décimale.
func formatServings(_ value: Double) -> String {
    let text = formatKg(value)
    return text.hasSuffix(",0") ? String(text.dropLast(2)) : text
}

private struct WeightTile: View {
    let weight: WeightSummary?
    let onWeigh: () -> Void

    var body: some View {
        let body = Domains.body
        VStack(alignment: .leading, spacing: 6) {
            TileHeader(label: "Poids", icon: .scale, color: body.textOnLight)
            if let weight {
                Text(valueWithUnit(formatKg(weight.latestKg), " kg", extra: weight.changeKg.map { formatSigned($0) }, extraColor: body.textOnLight))
                    .textStyle(nt(20, 600, tracking: -0.02))
                Sparkline(values: weight.weeks, color: body.fill).frame(height: 22)
            } else {
                Text("—").textStyle(nt(20, 600, tracking: -0.02))
                Text("Touche pour te peser").textStyle(nt(11.5, 400, Neutrals.muted))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .tinted(body.soft)
        .tap(onWeigh)
    }
}

private struct ActivityTile: View {
    let activity: ActivitySummary
    /// Santé pas encore reliée : la tuile le propose, en un toucher.
    let linkable: Bool
    let onLink: () -> Void

    var body: some View {
        let body = Domains.body
        let training = Domains.training
        VStack(alignment: .leading, spacing: 6) {
            TileHeader(label: "Activité (Santé)", icon: .flame, color: body.textOnLight)
            if linkable {
                Text("Ta dépense réelle ajuste la cible.").textStyle(nt(11.5, 400, Neutrals.muted))
                PillButton(text: "Relier Santé", background: body.fill, foreground: body.textOnFill, icon: .heart, action: onLink)
            } else {
                Text(valueWithUnit(activity.activeKcal.map { formatInt($0) } ?? "—", " kcal"))
                    .textStyle(nt(20, 600, tracking: -0.02))
            }
            if activity.sessionsPlanned > 0 {
                SegmentDots(done: activity.sessionsDone, total: activity.sessionsPlanned, on: training.fill, off: training.seg, height: 5)
                Text("\(activity.sessionsDone) séance\(activity.sessionsDone > 1 ? "s" : "") sur \(activity.sessionsPlanned)")
                    .textStyle(nt(11.5, 400, Neutrals.muted))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .tinted(body.soft)
    }
}

/// La carte d'arrivée (O4), juste après l'onboarding.
private struct WelcomeCard: View {
    let data: TodayResponse

    var body: some View {
        let name = data.identity.displayName ?? data.identity.handle
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(name.map { "C'est prêt, \($0)" } ?? "C'est prêt").textStyle(nt(15, 600))
                Spacer()
                Text("3 sur 3").textStyle(TextStyles.small)
            }
            VStack(alignment: .leading, spacing: 8) {
                if let target = data.target {
                    CheckLine(fill: Domains.nutrition.fill, tint: Domains.nutrition.textOnFill, text: "Cible : \(formatInt(target.targetKcal)) kcal par jour")
                }
                if let handle = data.identity.handle {
                    CheckLine(fill: Domains.community.fill, tint: Domains.community.textOnFill, text: "Profil : @\(handle)")
                }
                if data.activity.sessionsPlanned > 0 {
                    CheckLine(fill: Domains.training.fill, tint: Domains.training.textOnFill, text: "Programme : \(data.activity.sessionsPlanned) séances par semaine")
                }
            }
        }
        .padding(16)
        .card(radius: Radius.sessionCard)
    }
}

/// Les repas du jour, repliés ; un toucher déplie le détail, retire un
/// aliment (en deux temps) ou garde le repas en favori.
struct MealJournal: View {
    let entries: [Entry]
    let onDelete: ((Entry) -> Void)?
    let onFavorite: ((Meal) -> Void)?

    @State private var open: Meal?
    @State private var confirm: Int?

    var body: some View {
        let byMeal = Meal.allCases.compactMap { meal -> (Meal, [Entry])? in
            let items = entries.filter { Meal.fromApi($0.meal) == meal }
            return items.isEmpty ? nil : (meal, items)
        }
        VStack(spacing: 0) {
            ForEach(Array(byMeal.enumerated()), id: \.offset) { index, group in
                section(meal: group.0, items: group.1)
                if index < byMeal.count - 1 { Hairline() }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .card()
    }

    @ViewBuilder
    private func section(meal: Meal, items: [Entry]) -> some View {
        let total = { (key: KeyPath<MacroValues, Double>) in items.reduce(0) { $0 + $1.macros[keyPath: key] } }
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(meal.label).textStyle(TextStyles.bodyStrong)
                if open != meal {
                    Text(items.map(\.foodLabel).joined(separator: ", ")).textStyle(TextStyles.small).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            MacroSplit(protein: total(\.proteinG), carbs: total(\.carbsG), fat: total(\.fatG)).padding(.leading, 10)
            Text(formatInt(total(\.kcal))).textStyle(nt(14, 600)).frame(width: 54, alignment: .trailing)
        }
        .padding(.vertical, 10)
        .tap {
            Haptics.selection()
            open = open == meal ? nil : meal
        }
        if open == meal {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(items) { entry in row(entry) }
                if let onFavorite {
                    HStack(spacing: 6) {
                        LucideIcon(.star, 15, Domains.kitchen.textOnLight)
                        Text("Garder ce repas en favori").textStyle(nt(13, 600, Domains.kitchen.textOnLight))
                    }
                    .padding(.vertical, 6)
                    .tap { onFavorite(meal) }
                }
            }
            .padding(.bottom, 8)
        }
    }

    private func row(_ entry: Entry) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(entry.foodLabel).textStyle(nt(13.5, 500)).lineLimit(2)
                Text("\(formatInt(entry.quantityG)) g").textStyle(TextStyles.small)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(formatInt(entry.macros.kcal)) kcal").textStyle(nt(13, 600))
            if let onDelete {
                let confirming = confirm == entry.id
                Text(confirming ? "Supprimer ?" : "Retirer")
                    .textStyle(nt(12.5, 600, confirming ? Macros.protein.text : Neutrals.muted))
                    .padding(4)
                    .tap {
                        if confirming {
                            confirm = nil
                            onDelete(entry)
                        } else {
                            confirm = entry.id
                        }
                    }
                    .padding(.leading, 10)
            }
        }
        .padding(.vertical, 6)
    }
}
