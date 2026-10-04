import SwiftUI

private let mealTrack = Color(argb: 0xFFF3F0ED)

private enum MealMode {
    case home, favorites, manual
}

/**
 « Ajouter un repas » : le repas suivant l'heure, la recherche, les récents
 (un toucher ajoute), et les modes.
 */
struct MealSheet: View {
    let visible: Bool
    let model: AppModel
    /// Un aliment trouvé par le scanner, prêt à doser.
    let preset: SearchHit?
    let onDismiss: () -> Void
    let onScan: () -> Void

    @State private var meal = Meal.forNow()
    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var searching = false
    @State private var searchError: String?
    @State private var selected: SearchHit?
    @State private var quantity = ""
    @State private var mode = MealMode.home
    @State private var favorites: [QuickFavorite]?

    var body: some View {
        NutriSheet(visible: visible, title: "Ajouter un repas", onDismiss: onDismiss) {
            SegmentedPill(
                options: Meal.allCases.map(\.short),
                selected: Meal.allCases.firstIndex(of: meal) ?? 0,
                onSelect: { meal = Meal.allCases[$0] },
                track: mealTrack,
                selectedBackground: Domains.nutrition.fill,
                selectedTextColor: Domains.nutrition.textOnFill,
                textStyle: nt(13, 600),
                itemPadding: 6
            )
            step
        }
        .onChange(of: visible, initial: true) { _, shown in
            if shown { reset() }
        }
        .task(id: query) { await runSearch() }
    }

    @ViewBuilder
    private var step: some View {
        if let pick = selected {
            QuantityStep(hit: pick, quantity: $quantity, meal: meal, busy: model.writing, onAdd: { add(pick) }) {
                selected = nil
            }
        } else if mode == .manual {
            ManualStep(meal: meal, busy: model.writing, onBack: { mode = .home }) { label, macros in
                model.addManual(label: label, macros: macros, meal: meal, done: onDismiss)
            }
        } else if mode == .favorites {
            FavoritesStep(favorites: favorites, onBack: { mode = .home }) { favorite in
                Haptics.selection()
                model.replayFavorite(favorite, meal: meal, done: onDismiss)
            }
            .task { favorites = await model.api.favorites().value?.favorites ?? [] }
        } else {
            home
        }
    }

    @ViewBuilder
    private var home: some View {
        let nutrition = Domains.nutrition
        NutriField(
            text: $query,
            placeholder: "Aliment, recette, favori…",
            submitLabel: .search,
            height: 46,
            background: nutrition.soft,
            border: nil,
            leadingIcon: .search,
            textSize: 14
        )
        if query.trimmingCharacters(in: .whitespaces).count >= 3 {
            SearchResults(hits: hits, searching: searching, error: searchError) { hit in
                selected = hit
                quantity = formatGrams(hit.servingSizeG ?? 100)
            }
        } else {
            recents
            HStack(spacing: 8) {
                ModeTile(label: "Scanner", icon: .scanBarcode, action: onScan)
                ModeTile(label: "Favoris", icon: .star) { mode = .favorites }
                ModeTile(label: "À la main", icon: .pencil) { mode = .manual }
            }
        }
    }

    private var recents: some View {
        let quick = model.quick
        let chips = quick?.favorites ?? []
        let recents = quick?.recents ?? []
        return VStack(alignment: .leading, spacing: 8) {
            SectionCaps(text: "Récents")
            if chips.isEmpty && recents.isEmpty {
                Text(quick == nil ? "Chargement…" : "Tes aliments récents apparaîtront ici.")
                    .textStyle(TextStyles.secondary)
                    .padding(.horizontal, 4)
            } else {
                FlowLayout {
                    ForEach(chips) { favorite in
                        QuickChip(label: favorite.name) {
                            Haptics.selection()
                            model.replayFavorite(favorite, meal: meal, done: onDismiss)
                        }
                    }
                    ForEach(Array(recents.enumerated()), id: \.offset) { _, recent in
                        QuickChip(label: "\(recent.label) \(formatGrams(recent.quantityG)) g") {
                            Haptics.selection()
                            model.addRecent(recent, meal: meal, done: onDismiss)
                        }
                    }
                }
            }
        }
    }

    private func reset() {
        meal = Meal.forNow()
        query = ""
        hits = []
        mode = .home
        selected = preset
        quantity = preset.map { formatGrams($0.servingSizeG ?? 100) } ?? ""
    }

    private func runSearch() async {
        searchError = nil
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 3 else {
            hits = []
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        searching = true
        switch await model.search(trimmed) {
        case .success(let found): hits = Array(found.prefix(8))
        case .failure(let failure): searchError = failure.message
        }
        searching = false
    }

    private func add(_ pick: SearchHit) {
        guard let grams = Int(quantity), grams > 0 else {
            model.toast("Une quantité en grammes.")
            return
        }
        let fromScan = preset.map { $0.ref == pick.ref && $0.kind == pick.kind } ?? false
        model.addHit(pick, quantityG: grams, meal: meal, fromScan: fromScan, done: onDismiss)
    }
}

private struct QuickChip: View {
    let label: String
    let action: () -> Void

    var body: some View {
        let nutrition = Domains.nutrition
        HStack(spacing: 6) {
            LucideIcon(.plus, 12, nutrition.textOnLight)
            Text(label).textStyle(nt(13, 500, nutrition.textOnLight)).lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(nutrition.soft, in: Capsule())
        .tap(action)
    }
}

private struct ModeTile: View {
    let label: String
    let icon: Lucide
    let action: () -> Void

    var body: some View {
        let nutrition = Domains.nutrition
        VStack(spacing: 6) {
            LucideIcon(icon, 22, nutrition.textOnLight)
            Text(label).textStyle(nt(12.5, 600, nutrition.textOnLight)).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 8)
        .padding(.vertical, 12)
        .tinted(nutrition.soft, radius: Radius.tile)
        .tap(action)
    }
}

private struct SearchResults: View {
    let hits: [SearchHit]
    let searching: Bool
    let error: String?
    let onPick: (SearchHit) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let error {
                    message(error)
                } else if hits.isEmpty {
                    message(searching ? "Recherche…" : "Aucun résultat.")
                }
                ForEach(Array(hits.enumerated()), id: \.offset) { index, hit in
                    HStack {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(hit.name).textStyle(TextStyles.bodyStrong).lineLimit(2)
                            Text("\(formatInt(hit.per100g.kcal)) kcal / 100 g · \(hit.kind == "ciqual" ? "CIQUAL" : "Produit")")
                                .textStyle(TextStyles.small)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        LucideIcon(.plus, 16, Domains.nutrition.textOnLight)
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 10)
                    .tap { onPick(hit) }
                    if index < hits.count - 1 { Hairline().padding(.horizontal, 4) }
                }
            }
        }
        .frame(maxHeight: 320)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func message(_ text: String) -> some View {
        Text(text).textStyle(TextStyles.secondary).padding(4).frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct QuantityStep: View {
    let hit: SearchHit
    @Binding var quantity: String
    let meal: Meal
    let busy: Bool
    let onAdd: () -> Void
    let onBack: () -> Void

    var body: some View {
        let factor = Double(Int(quantity) ?? 0) / 100
        VStack(alignment: .leading, spacing: 10) {
            Text(hit.name).textStyle(nt(15, 600)).lineLimit(2)
            HStack(spacing: 12) {
                NutriField(text: $quantity, placeholder: "100", kind: .number, submitLabel: .done, onSubmit: onAdd, suffix: "g")
                    .frame(width: 120)
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(formatInt(hit.per100g.kcal * factor)) kcal").textStyle(nt(18, 600))
                    Text(
                        "P \(formatInt(hit.per100g.proteinG * factor)) · G \(formatInt(hit.per100g.carbsG * factor)) · L \(formatInt(hit.per100g.fatG * factor)) g"
                    )
                    .textStyle(TextStyles.small)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tinted(Domains.nutrition.soft, radius: Radius.tile)
        .filtered($quantity, onlyDigits(4))
        PrimaryButton(text: "Ajouter \(meal.inPhrase)", colors: Domains.nutrition, height: 52, busy: busy, textSize: 15.5, weight: 700, action: onAdd)
        GhostButton(text: "Retour", action: onBack)
    }
}

private struct ManualStep: View {
    let meal: Meal
    let busy: Bool
    let onBack: () -> Void
    let onAdd: (String, MacroValues) -> Void

    @State private var label = ""
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    var body: some View {
        Labeled(label: "Ce que tu as mangé") {
            NutriField(text: $label, placeholder: "Part de quiche")
        }
        Labeled(label: "Calories de la portion") {
            NutriField(text: $kcal, placeholder: "kcal", kind: .decimal)
        }
        HStack(spacing: 8) {
            NutriField(text: $protein, placeholder: "Prot. g", kind: .decimal)
            NutriField(text: $carbs, placeholder: "Gluc. g", kind: .decimal)
            NutriField(text: $fat, placeholder: "Lip. g", kind: .decimal, submitLabel: .done, onSubmit: submit)
        }
        PrimaryButton(
            text: "Ajouter \(meal.inPhrase)",
            colors: Domains.nutrition,
            height: 52,
            enabled: !label.trimmingCharacters(in: .whitespaces).isEmpty && number(kcal) != nil,
            busy: busy,
            textSize: 15.5,
            weight: 700,
            action: submit
        )
        .filtered($label, maxLength(200))
        .filtered($kcal, maxLength(5))
        .filtered($protein, maxLength(5))
        .filtered($carbs, maxLength(5))
        .filtered($fat, maxLength(5))
        GhostButton(text: "Retour", action: onBack)
    }

    private func number(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: ",", with: "."))
    }

    private func submit() {
        let name = label.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, let kcalValue = number(kcal), kcalValue >= 0 else { return }
        onAdd(name, MacroValues(
            kcal: kcalValue,
            proteinG: number(protein) ?? 0,
            carbsG: number(carbs) ?? 0,
            fatG: number(fat) ?? 0
        ))
    }
}

private struct FavoritesStep: View {
    let favorites: [QuickFavorite]?
    let onBack: () -> Void
    let onPick: (QuickFavorite) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let favorites, !favorites.isEmpty {
                    ForEach(favorites) { favorite in
                        HStack(spacing: 10) {
                            LucideIcon(.star, 16, Domains.kitchen.textOnLight)
                            Text(favorite.name).textStyle(TextStyles.bodyStrong).frame(maxWidth: .infinity, alignment: .leading)
                            LucideIcon(.plus, 16, Domains.nutrition.textOnLight)
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 11)
                        .tap { onPick(favorite) }
                    }
                } else {
                    Text(favorites == nil ? "Chargement…" : "Aucun repas favori. Mets un repas en favori depuis le journal.")
                        .textStyle(TextStyles.secondary)
                        .padding(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .frame(maxHeight: 320)
        .fixedSize(horizontal: false, vertical: true)
        GhostButton(text: "Retour", action: onBack)
    }
}

/// Pesée : − et + au dixième, initialisée sur la dernière pesée.
struct WeighSheet: View {
    let visible: Bool
    let model: AppModel
    let onDismiss: () -> Void

    @State private var draft = 70.0
    @State private var touched = false

    var body: some View {
        let last = model.quick?.lastWeighIn
        NutriSheet(visible: visible, title: "Pesée", onDismiss: onDismiss, gap: 16) {
            HStack(spacing: 22) {
                StepButton(icon: .minus) { step(-0.1) }
                VStack(spacing: 0) {
                    Text(formatKg(draft)).textStyle(TextStyles.bigNumber).multilineTextAlignment(.center)
                    Text("kg · ce matin").textStyle(nt(13, 400, Neutrals.muted))
                }
                .frame(width: 150)
                StepButton(icon: .plus) { step(0.1) }
            }
            .frame(maxWidth: .infinity)
            if let last {
                Text("Dernière : \(formatKg(last.weightKg)) kg, \(weekday(last.day))")
                    .textStyle(nt(13, 400, Neutrals.muted))
                    .frame(maxWidth: .infinity)
            }
            PrimaryButton(text: "Enregistrer", colors: Domains.body, height: 52, busy: model.writing, textSize: 15.5, weight: 700) {
                model.weighIn(draft, done: onDismiss)
            }
        }
        .onChange(of: visible, initial: true) { _, shown in
            if shown {
                touched = false
                syncDraft()
            }
        }
        .onChange(of: model.quick?.lastWeighIn?.weightKg) { syncDraft() }
    }

    private func syncDraft() {
        guard visible, !touched else { return }
        draft = model.quick?.lastWeighIn?.weightKg ?? model.today?.weight?.latestKg ?? 70
    }

    private func step(_ delta: Double) {
        Haptics.selection()
        touched = true
        draft = ((draft + delta) * 10).rounded() / 10
    }

    private func weekday(_ iso: String) -> String {
        guard let date = parseDay(iso) else { return iso }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let style = Date.VerbatimFormatStyle(format: "\(weekday: .wide)", locale: Locale(identifier: "fr_FR"), timeZone: .gmt, calendar: calendar)
        return date.formatted(style)
    }
}

private struct StepButton: View {
    let icon: Lucide
    let action: () -> Void

    var body: some View {
        LucideIcon(icon, 20, Domains.body.textOnLight)
            .frame(width: 52, height: 52)
            .background(Domains.body.soft, in: Circle())
            .tap(action)
    }
}

private func formatGrams(_ value: Double) -> String {
    String(Int((value + 0.5).rounded(.down)))
}
