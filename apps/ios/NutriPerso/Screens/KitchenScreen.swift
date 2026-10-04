import SwiftUI

/// Deux repas par jour, sept jours : ce que le plan peut porter.
private let slotsPerWeek = 14

/// Une case vide du plan, en attente d'un plat.
struct PlanSlot: Equatable {
    let date: String
    let meal: Meal
}

/// Cuisine (C3) : Plan, Recettes, Courses, sur la semaine en cours.
struct KitchenScreen: View {
    let model: AppModel
    let onMe: () -> Void
    let onPlanSlot: (PlanSlot, [BasketRow]) -> Void
    let onScanCheck: (String, [ShoppingItemRow]) -> Void
    let onAddItem: (String) -> Void
    let onNewRecipe: () -> Void

    @State private var section = 0
    @State private var plan = Loaded<PlanResponse>()
    @State private var basket = Loaded<BasketResponse>()
    @State private var shopping = Loaded<ShoppingResponse>()
    @State private var reload = 0
    /// Cochés à l'instant : la case suit le doigt, le serveur suit (comme la PWA).
    @State private var checking: [Int: Bool] = [:]

    private var today: String { model.today?.today ?? localToday() }
    private var week: String { mondayOf(today) }

    var body: some View {
        let kitchen = Domains.kitchen
        let items = shopping.value?.list?.items ?? []
        let bought = items.filter(isChecked).count
        ScreenColumn {
            DomainHeader(
                title: "Cuisine",
                subtitle: AttributedString("\(shortDate(week)) – \(shortDate(addDays(week, 6)))"),
                initials: initialsOf(model.today?.identity),
                onAvatar: onMe,
                badge: DomainBadge(icon: .utensils, colors: kitchen)
            )
            SegmentedPill(
                options: ["Plan", "Recettes", "Courses"],
                selected: section,
                onSelect: { section = $0 },
                track: kitchen.soft,
                textColor: kitchen.textOnLight,
                selectedTextColor: kitchen.textOnLight,
                badges: shopping.value?.list == nil || items.count == bought ? [:] : [2: "\(items.count - bought)"]
            )
            switch section {
            case 0: planSection(items: items, bought: bought)
            case 1: RecipesSection(model: model, week: week, onNewRecipe: onNewRecipe)
            default: shoppingSection(items: items)
            }
        }
        .task(id: "\(week)-\(model.revision)-\(reload)") { await load() }
    }

    private func load() async {
        async let planned = model.api.plan(weekStart: week)
        async let chosen = model.api.basket(weekStart: week)
        async let list = model.api.shopping(weekStart: week)
        plan.take(await planned)
        basket.take(await chosen)
        shopping.take(await list)
        checking = [:]
    }

    private func isChecked(_ item: ShoppingItemRow) -> Bool {
        checking[item.id] ?? (item.checkedAt != nil)
    }

    // MARK: Plan.

    @ViewBuilder
    private func planSection(items: [ShoppingItemRow], bought: Int) -> some View {
        LoadedGate(loaded: plan, onRetry: { reload += 1 }) { planResponse in
            LoadedGate(loaded: basket, skeletons: []) { basketResponse in
                let planned = planResponse.planned
                let chosen = basketResponse.basket
                HStack(spacing: 8) {
                    StatTile(label: "Plats choisis", value: "\(chosen.count)")
                    StatTile(label: "Repas placés", value: "\(planned.count)", unit: " / \(slotsPerWeek)", progress: Double(planned.count) / Double(slotsPerWeek))
                    StatTile(label: "Courses", value: "\(bought)", unit: " / \(items.count)", progress: items.isEmpty ? 0 : Double(bought) / Double(items.count))
                }
                .fixedSize(horizontal: false, vertical: true)
                BasketCard(basket: chosen) { section = 1 }
                PlanGrid(
                    monday: week,
                    today: today,
                    planned: planned,
                    onEat: { model.eatPlanned(planId: $0.id, name: $0.recipeName) },
                    onEmpty: { slot in
                        if chosen.isEmpty {
                            model.toast("Choisis d'abord des plats dans Recettes")
                        } else {
                            onPlanSlot(slot, chosen)
                        }
                    }
                )
            }
        }
    }

    // MARK: Courses.

    @ViewBuilder
    private func shoppingSection(items: [ShoppingItemRow]) -> some View {
        let kitchen = Domains.kitchen
        LoadedGate(loaded: shopping, onRetry: { reload += 1 }) { response in
            if response.list == nil {
                EmptyCard(title: "Pas encore de liste", text: "Elle se compose à partir des plats choisis pour la semaine.")
                PrimaryButton(text: "Composer la liste de courses", colors: kitchen, height: 48, textSize: 15) {
                    regenerate(announce: false)
                }
            } else {
                ShoppingList(
                    items: items,
                    isChecked: isChecked,
                    onScan: { onScanCheck(week, items) },
                    onAddItem: { onAddItem(week) },
                    onRegenerate: { regenerate(announce: true) },
                    onToggle: toggle
                )
            }
        }
    }

    private func regenerate(announce: Bool) {
        Task {
            switch await model.api.generateShopping(weekStart: week) {
            case .success:
                if announce { model.toast("Liste recomposée depuis les plats de la semaine") }
                model.bump()
            case .failure(let failure):
                model.toast(failure.message)
            }
        }
    }

    private func toggle(_ item: ShoppingItemRow, _ checked: Bool) {
        checking[item.id] = checked
        Task {
            if case .failure = await model.api.checkItem(item, checked: checked) {
                checking[item.id] = nil
                model.toast("La case n'a pas pu être enregistrée")
            }
        }
    }
}

/// « 2 », « 1,5 » : une part entière sans décimale.
private func servings(_ value: Double) -> String {
    formatServings(value)
}

private struct BasketCard: View {
    let basket: [BasketRow]
    let onChoose: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("À cuisiner").textStyle(nt(13, 600))
                Spacer()
                LinkText(text: "Choisir des plats", color: kitchen.textOnLight, action: onChoose)
            }
            if basket.isEmpty {
                Text("Aucun plat choisi pour cette semaine.").textStyle(TextStyles.secondary)
            } else {
                FlowLayout {
                    ForEach(basket) { item in
                        Text(AttributedString("\(item.recipeName) ") + styled(
                            "\(servings(item.plannedServings))/\(servings(item.servings))", size: 12.5, weight: 700, color: kitchen.textOnLight
                        ))
                        .textStyle(nt(12.5))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .tinted(kitchen.soft, radius: Radius.small)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

/// Lignes jour × midi / soir. Le passé est barré, le jour même est surligné.
private struct PlanGrid: View {
    let monday: String
    let today: String
    let planned: [PlannedRow]
    let onEat: (PlannedRow) -> Void
    let onEmpty: (PlanSlot) -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Color.clear.frame(width: 46, height: 1)
                Text("Midi").textStyle(nt(11.5, 400, Neutrals.muted)).frame(maxWidth: .infinity, alignment: .leading)
                Text("Soir").textStyle(nt(11.5, 400, Neutrals.muted)).frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            ForEach(0 ..< 7, id: \.self) { offset in
                let date = addDays(monday, offset)
                let isToday = date == today
                Hairline()
                HStack(spacing: 6) {
                    Text(dayLabel(date))
                        .textStyle(isToday ? nt(12, 700, kitchen.textOnLight) : nt(12, 400, Neutrals.muted))
                        .frame(width: 46, alignment: .leading)
                    ForEach([Meal.lunch, Meal.dinner], id: \.self) { meal in
                        PlanCell(
                            row: planned.first { $0.planDate == date && Meal.fromApi($0.meal) == meal },
                            date: date,
                            today: today,
                            onEat: onEat,
                            onEmpty: { onEmpty(PlanSlot(date: date, meal: meal)) }
                        )
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isToday ? kitchen.soft : .clear)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.card))
        .card()
    }
}

private struct PlanCell: View {
    let row: PlannedRow?
    let date: String
    let today: String
    let onEat: (PlannedRow) -> Void
    let onEmpty: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        Group {
            if let row {
                if row.journaledAt != nil || date < today {
                    cell(Text(row.recipeName).strikethrough(), nt(12, 400, Neutrals.faint), Neutrals.chip)
                } else if date == today {
                    cell(Text("\(row.recipeName) · manger"), nt(12, 600, kitchen.textOnFill), kitchen.fill)
                        .tap { onEat(row) }
                } else {
                    cell(Text(row.recipeName), nt(12), kitchen.soft)
                }
            } else if date < today {
                Text("—").textStyle(nt(12, 400, Neutrals.faint)).frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("+")
                    .textStyle(nt(12, 400, kitchen.textOnLight))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dashedBorder(kitchen.seg, radius: 8)
                    .tap(onEmpty)
                    .accessibilityLabel("Placer un plat")
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func cell(_ text: Text, _ style: NT, _ background: Color) -> some View {
        text
            .textStyle(style)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: 8))
    }
}

/// Petite tuile chiffrée, avec mini-barre facultative.
struct StatTile: View {
    let label: String
    let value: String
    var unit: String?
    var progress: Double?
    var background: Color?
    var labelColor: Color = Neutrals.muted
    var labelWeight: CGFloat = 400
    var valueSize: CGFloat = 18

    var body: some View {
        let tile = VStack(alignment: .leading, spacing: 0) {
            Text(label).textStyle(nt(11.5, labelWeight, labelColor)).lineLimit(1)
            Text(unit.map { valueWithUnit(value, $0) } ?? AttributedString(value)).textStyle(nt(valueSize, 600))
            if let progress {
                ProgressTrack(fraction: progress, track: Domains.kitchen.soft, fill: Domains.kitchen.fill, height: 4).padding(.top, 4)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        if let background {
            tile.tinted(background, radius: Radius.tile)
        } else {
            tile.card(radius: Radius.tile)
        }
    }
}

/// Les recettes de l'utilisateur ; un toucher les ajoute au panier de la semaine.
private struct RecipesSection: View {
    let model: AppModel
    let week: String
    let onNewRecipe: () -> Void

    @State private var recipes = Loaded<RecipesResponse>()
    @State private var query = ""
    @State private var reload = 0

    var body: some View {
        let kitchen = Domains.kitchen
        NutriField(
            text: $query,
            placeholder: "Chercher une recette",
            focusColor: kitchen.textOnLight,
            height: 46,
            background: kitchen.soft,
            border: nil,
            leadingIcon: .search,
            leadingTint: kitchen.textOnLight,
            textSize: 14
        )
        HStack(spacing: 6) {
            LucideIcon(.plus, 16, kitchen.textOnLight)
            Text("Nouvelle recette").textStyle(nt(14, 600, kitchen.textOnLight))
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .tinted(kitchen.soft, radius: Radius.tile)
        .tap(onNewRecipe)
        LoadedGate(loaded: recipes, onRetry: { reload += 1 }) { response in
            list(response.recipes)
        }
        .task(id: "\(model.revision)-\(reload)") { recipes.take(await model.api.recipes()) }
    }

    @ViewBuilder
    private func list(_ all: [RecipeRow]) -> some View {
        let needle = query.trimmingCharacters(in: .whitespaces)
        let shown = all.filter { needle.isEmpty || $0.name.localizedCaseInsensitiveContains(needle) }
        if shown.isEmpty {
            EmptyCard(
                title: needle.isEmpty ? "Aucune recette" : "Aucun résultat",
                text: needle.isEmpty ? "Crée ta première recette avec le bouton ci-dessus." : "Essaie un autre mot."
            )
        } else {
            Text("Touche une recette pour l'ajouter aux plats de la semaine.").textStyle(TextStyles.secondary).padding(.horizontal, 4)
            ForEach(Array(stride(from: 0, to: shown.count, by: 2)), id: \.self) { start in
                HStack(alignment: .top, spacing: 10) {
                    RecipeCard(recipe: shown[start]) { add(shown[start]) }
                    if start + 1 < shown.count {
                        RecipeCard(recipe: shown[start + 1]) { add(shown[start + 1]) }
                    } else {
                        Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
                    }
                }
            }
        }
    }

    private func add(_ recipe: RecipeRow) {
        Task {
            switch await model.api.addToBasket(weekStart: week, recipeId: recipe.id, servings: max(recipe.servings, 1)) {
            case .success:
                model.toast("\(recipe.name) ajouté aux plats de la semaine")
                model.bump()
            case .failure(let failure):
                model.toast(failure.message)
            }
        }
    }
}

private struct RecipeCard: View {
    let recipe: RecipeRow
    let action: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        VStack(alignment: .leading, spacing: 0) {
            // Le motif reste dessous : il tient lieu de photo pendant le
            // chargement, et pour toute recette qui n'en a pas.
            Color.clear
                .aspectRatio(1.3, contentMode: .fit)
                .overlay {
                    PhotoStripes(background: kitchen.soft, stripe: kitchen.seg)
                    if let url = recipe.imageUrl.flatMap(URL.init(string:)) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() }
                        }
                    }
                }
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: Radius.tile, topTrailingRadius: Radius.tile))
            VStack(alignment: .leading, spacing: 0) {
                Text(recipe.name).textStyle(nt(14, 600, line: 1.25)).lineLimit(2)
                Text(detail).textStyle(TextStyles.small)
            }
            .padding(10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(radius: Radius.tile)
        .tap(action)
    }

    private var detail: String {
        let parts = [
            recipe.kcalPerServing > 0 ? "\(formatInt(recipe.kcalPerServing)) kcal" : nil,
            recipe.prepMinutes.map { "\($0) min" },
        ].compactMap { $0 }
        return parts.isEmpty ? "\(servings(recipe.servings)) parts" : parts.joined(separator: " · ")
    }
}

/// La liste par rayon, dans l'ordre du serveur ; cocher suit le doigt.
private struct ShoppingList: View {
    let items: [ShoppingItemRow]
    let isChecked: (ShoppingItemRow) -> Bool
    let onScan: () -> Void
    let onAddItem: () -> Void
    let onRegenerate: () -> Void
    let onToggle: (ShoppingItemRow, Bool) -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        let done = items.filter(isChecked).count
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Panier").textStyle(nt(13, 600))
                Spacer()
                Text("\(done) / \(items.count)").textStyle(nt(13, 600, kitchen.textOnLight))
            }
            ProgressTrack(fraction: Double(done) / Double(max(items.count, 1)), track: kitchen.soft, fill: kitchen.fill, height: 7)
        }
        .padding(14)
        .card()
        HStack(spacing: 8) {
            action("Scanner pour cocher", .scanBarcode, onScan)
            action("Un article", .plus, onAddItem)
        }
        ForEach(aisles, id: \.label) { aisle in
            VStack(alignment: .leading, spacing: 0) {
                SectionCaps(text: aisle.label).padding(.top, 10).padding(.bottom, 4)
                ForEach(aisle.rows) { item in row(item) }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
        Text("Recomposer depuis les plats de la semaine")
            .textStyle(nt(13, 600, kitchen.textOnLight))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(10)
            .tap(onRegenerate)
    }

    /// Les rayons dans l'ordre où le serveur les donne.
    private var aisles: [(label: String, rows: [ShoppingItemRow])] {
        var result: [(label: String, rows: [ShoppingItemRow])] = []
        for item in items {
            if let index = result.firstIndex(where: { $0.label == item.aisleLabel }) {
                result[index].rows.append(item)
            } else {
                result.append((item.aisleLabel, [item]))
            }
        }
        return result
    }

    private func action(_ label: String, _ icon: Lucide, _ perform: @escaping () -> Void) -> some View {
        let kitchen = Domains.kitchen
        return HStack(spacing: 8) {
            LucideIcon(icon, 18, kitchen.textOnLight)
            Text(label).textStyle(nt(13, 600, kitchen.textOnLight)).lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tinted(kitchen.soft, radius: Radius.tile)
        .tap(perform)
    }

    private func row(_ item: ShoppingItemRow) -> some View {
        let kitchen = Domains.kitchen
        let checked = isChecked(item)
        return HStack(spacing: 10) {
            ZStack {
                if checked {
                    RoundedRectangle(cornerRadius: 6).fill(kitchen.fill)
                    LucideIcon(.check, 13, kitchen.textOnFill)
                } else {
                    RoundedRectangle(cornerRadius: 6).strokeBorder(Neutrals.radioBorder, lineWidth: 1.5)
                }
            }
            .frame(width: 20, height: 20)
            Text(item.label)
                .strikethrough(checked)
                .textStyle(checked ? nt(14, 400, Neutrals.faint) : nt(14, 500))
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(item.quantityLabel).textStyle(nt(12.5, 400, Neutrals.muted))
        }
        .padding(.vertical, 9)
        .tap {
            Haptics.selection()
            onToggle(item, !checked)
        }
        .accessibilityAddTraits(checked ? .isSelected : [])
    }
}

/// Placer un plat choisi sur une case vide : la feuille.
struct PlanSlotSheet: View {
    let slot: PlanSlot?
    let basket: [BasketRow]
    let model: AppModel
    let onDismiss: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        let title = slot.map { "\(dayLabel($0.date)) · \($0.meal == .lunch ? "midi" : "soir")" } ?? ""
        NutriSheet(visible: slot != nil, title: title, onDismiss: onDismiss, gap: 10) {
            ForEach(basket) { item in
                HStack {
                    Text(item.recipeName).textStyle(nt(14, 600)).frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(servings(item.plannedServings))/\(servings(item.servings)) parts").textStyle(nt(12.5, 600, kitchen.textOnLight))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .tinted(kitchen.soft, radius: Radius.tile)
                .tap { place(item) }
            }
        }
    }

    private func place(_ item: BasketRow) {
        guard let slot else { return }
        Task {
            switch await model.api.planMeal(planDate: slot.date, meal: slot.meal.rawValue, recipeId: item.recipeId, servings: 1) {
            case .success:
                model.toast("\(item.recipeName) placé")
                model.bump()
                onDismiss()
            case .failure(let failure):
                model.toast(failure.message)
            }
        }
    }
}
