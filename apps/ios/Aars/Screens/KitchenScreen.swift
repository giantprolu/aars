import SwiftUI

/// Quatre moments par jour (05/10/2026), sept jours : ce que le plan peut porter.
private let slotsPerWeek = Meal.planOrder.count * 7

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
    let onImportRecipe: () -> Void
    let onCatalogMeal: (CatalogMealRow, String) -> Void

    @State private var section = 0
    @State private var filling = false
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
            case 1:
                RecipesSection(
                    model: model, week: week, onNewRecipe: onNewRecipe, onImportRecipe: onImportRecipe,
                    onCatalogMeal: { onCatalogMeal($0, week) }
                )
            default: shoppingSection(items: items)
            }
        }
        .task(id: "\(week)-\(model.revision)-\(reload)") { await load() }
        // Pour dire, avant le toucher, si Cuisine+ est ouverte sur ce compte.
        .task { if model.purchases.billing == nil { await model.purchases.load(model.api) } }
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
                let open = openSlots(planned)
                if open > 0 {
                    CuisinePlusAction(
                        icon: .sparkles,
                        title: "Remplir la semaine",
                        detail: "\(open) repas \(open > 1 ? "libres" : "libre") : tes plats d'abord, puis le catalogue",
                        locked: model.purchases.billing?.kitchenPlus == false,
                        busy: filling,
                        action: fillWeek
                    )
                }
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

    /// Les repas encore libres, du jour même à dimanche, sur les quatre moments.
    private func openSlots(_ planned: [PlannedRow]) -> Int {
        (0 ..< 7).map { addDays(week, $0) }.filter { $0 >= today }.reduce(0) { count, date in
            count + Meal.planOrder.filter { meal in
                !planned.contains { $0.planDate == date && Meal.fromApi($0.meal) == meal }
            }.count
        }
    }

    private func fillWeek() {
        if model.purchases.billing?.kitchenPlus == false {
            model.paywallRequested = true
            return
        }
        guard !filling else { return }
        filling = true
        Task {
            switch await model.api.fillWeek(weekStart: week, meals: Meal.planOrder) {
            case .success(let result):
                if result.placed == 0 {
                    model.toast(result.empty > 0 ? "Pas assez de plats pour remplir la semaine" : "La semaine est déjà pleine")
                } else if result.added.isEmpty {
                    model.toast(placedLabel(result.placed))
                } else {
                    let count = result.added.count
                    model.toast("\(placedLabel(result.placed)), \(count) \(count > 1 ? "plats ajoutés" : "plat ajouté") aux courses")
                }
                model.bump()
            case .failure(let failure):
                if failure.code == "premium_required" {
                    model.paywallRequested = true
                } else {
                    model.toast(failure.message)
                }
            }
            filling = false
        }
    }

    private func placedLabel(_ count: Int) -> String {
        "\(count) repas \(count > 1 ? "placés" : "placé")"
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

/// Lignes jour × petit-déj, déjeuner, dîner, collation. Le passé est barré, le jour même est surligné.
private struct PlanGrid: View {
    let monday: String
    let today: String
    let planned: [PlannedRow]
    let onEat: (PlannedRow) -> Void
    let onEmpty: (PlanSlot) -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Color.clear.frame(width: 36, height: 1)
                ForEach(Meal.planOrder, id: \.self) { meal in
                    Text(meal.short)
                        .textStyle(nt(11, 400, Neutrals.muted))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            ForEach(0 ..< 7, id: \.self) { offset in
                let date = addDays(monday, offset)
                let isToday = date == today
                Hairline()
                HStack(spacing: 4) {
                    Text(dayLabel(date))
                        .textStyle(isToday ? nt(11.5, 700, kitchen.textOnLight) : nt(11.5, 400, Neutrals.muted))
                        .frame(width: 36, alignment: .leading)
                    ForEach(Meal.planOrder, id: \.self) { meal in
                        PlanCell(
                            row: planned.first { $0.planDate == date && Meal.fromApi($0.meal) == meal },
                            date: date,
                            today: today,
                            onEat: onEat,
                            onEmpty: { onEmpty(PlanSlot(date: date, meal: meal)) }
                        )
                    }
                }
                .padding(.horizontal, 8)
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
                    cell(Text(row.recipeName).strikethrough(), nt(10.5, 400, Neutrals.faint, line: 1.2), Neutrals.chip)
                } else if date == today {
                    cell(Text(row.recipeName), nt(10.5, 600, kitchen.textOnFill, line: 1.2), kitchen.fill)
                        .tap { onEat(row) }
                        .accessibilityHint("Manger, et l'inscrire au journal")
                } else {
                    cell(Text(row.recipeName), nt(10.5, line: 1.2), kitchen.soft)
                }
            } else if date < today {
                Text("—").textStyle(nt(11, 400, Neutrals.faint)).frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("+")
                    .textStyle(nt(12, 400, kitchen.textOnLight))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dashedBorder(kitchen.seg, radius: 8)
                    .tap(onEmpty)
                    .accessibilityLabel("Placer un plat")
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func cell(_ text: Text, _ style: NT, _ background: Color) -> some View {
        // Quatre colonnes : le nom tient sur deux lignes plutôt qu'une coupée court.
        text
            .textStyle(style)
            .lineLimit(2)
            .padding(.horizontal, 5)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: 8))
    }
}

/// Une action de Cuisine+, avec le badge tant qu'elle n'est pas ouverte sur ce compte.
private struct CuisinePlusAction: View {
    let icon: Lucide
    let title: String
    let detail: String
    let locked: Bool
    let busy: Bool
    let action: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        HStack(spacing: 12) {
            LucideIcon(icon, 18, kitchen.textOnFill)
                .frame(width: 36, height: 36)
                .background(kitchen.fill, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(title).textStyle(nt(14.5, 600))
                    if locked {
                        Badge(text: "Cuisine+", background: kitchen.fill, foreground: kitchen.textOnFill, size: 10)
                    }
                }
                Text(busy ? "Un instant…" : detail).textStyle(TextStyles.small).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            LucideIcon(.chevronRight, 16, kitchen.textOnLight)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .tinted(kitchen.soft, radius: Radius.tile)
        .opacity(busy ? 0.6 : 1)
        .tap { if !busy { action() } }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
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
    let onImportRecipe: () -> Void
    let onCatalogMeal: (CatalogMealRow) -> Void

    @State private var recipes = Loaded<RecipesResponse>()
    @State private var catalog = Loaded<CatalogResponse>()
    @State private var query = ""
    /// 0 : tout ; ensuite les moments, dans l'ordre du plan.
    @State private var moment = 0
    @State private var reload = 0

    private var wanted: Meal? { moment == 0 ? nil : Meal.planOrder[moment - 1] }

    private func matches(_ name: String, _ meal: String?) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespaces)
        return (needle.isEmpty || name.localizedCaseInsensitiveContains(needle)) && (wanted == nil || Meal.orNil(meal) == wanted)
    }

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
        SegmentedPill(
            options: ["Tout"] + Meal.planOrder.map(\.short),
            selected: moment,
            onSelect: { moment = $0 },
            track: kitchen.soft,
            textColor: kitchen.textOnLight,
            selectedTextColor: kitchen.textOnLight,
            textStyle: nt(12.5, 600)
        )
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                LucideIcon(.plus, 16, kitchen.textOnLight)
                Text("Nouvelle recette").textStyle(nt(14, 600, kitchen.textOnLight)).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(12)
            .tinted(kitchen.soft, radius: Radius.tile)
            .tap(onNewRecipe)
            HStack(spacing: 6) {
                LucideIcon(.link, 16, kitchen.textOnLight)
                Text("Importer").textStyle(nt(14, 600, kitchen.textOnLight)).lineLimit(1)
                if model.purchases.billing?.kitchenPlus == false {
                    Badge(text: "Cuisine+", background: kitchen.fill, foreground: kitchen.textOnFill, size: 10)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(12)
            .tinted(kitchen.soft, radius: Radius.tile)
            .tap {
                if model.purchases.billing?.kitchenPlus == false {
                    model.paywallRequested = true
                } else {
                    onImportRecipe()
                }
            }
            .accessibilityLabel("Importer une recette depuis un lien")
        }
        LoadedGate(loaded: recipes, onRetry: { reload += 1 }) { response in
            list(response.recipes)
        }
        .task(id: "\(model.revision)-\(reload)") { recipes.take(await model.api.recipes()) }
        // Le catalogue : les plats de l'objectif que le compte n'a pas encore.
        LoadedGate(loaded: catalog, onRetry: { reload += 1 }) { response in
            dishes(response.meals.filter { $0.recipeId == nil && matches($0.name, $0.slot) })
        }
        .task(id: "catalog-\(model.revision)-\(reload)") { catalog.take(await model.api.catalog()) }
    }

    @ViewBuilder
    private func list(_ all: [RecipeRow]) -> some View {
        let shown = all.filter { matches($0.name, $0.meal) }
        let filtered = !query.trimmingCharacters(in: .whitespaces).isEmpty || wanted != nil
        Text("Mes recettes").textStyle(nt(15, 600)).padding(.horizontal, 4)
        if shown.isEmpty {
            EmptyCard(
                title: filtered ? "Aucun résultat" : "Aucune recette",
                text: filtered ? "Essaie un autre mot ou un autre moment." : "Crée ta première recette, ou prends-en une dans le catalogue ci-dessous."
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

    @ViewBuilder
    private func dishes(_ shown: [CatalogMealRow]) -> some View {
        if !shown.isEmpty {
            Text("Catalogue").textStyle(nt(15, 600)).padding(.horizontal, 4).padding(.top, 8)
            Text("Des plats prêts pour ton objectif. Touche-en un pour le voir.").textStyle(TextStyles.secondary).padding(.horizontal, 4)
            ForEach(Array(stride(from: 0, to: shown.count, by: 2)), id: \.self) { start in
                HStack(alignment: .top, spacing: 10) {
                    DishCard(name: shown[start].name, imageUrl: shown[start].imageUrl, detail: catalogLine(shown[start])) {
                        onCatalogMeal(shown[start])
                    }
                    if start + 1 < shown.count {
                        DishCard(name: shown[start + 1].name, imageUrl: shown[start + 1].imageUrl, detail: catalogLine(shown[start + 1])) {
                            onCatalogMeal(shown[start + 1])
                        }
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

/// Ce qu'une carte du catalogue dit sous le nom : moment, calories par part, durée.
private func catalogLine(_ meal: CatalogMealRow) -> String {
    [
        Meal.orNil(meal.slot)?.short,
        meal.kcal > 0 ? "\(formatInt(Double(meal.kcal))) kcal" : nil,
        meal.prepMinutes.map { "\($0) min" },
    ].compactMap { $0 }.joined(separator: " · ")
}

private struct RecipeCard: View {
    let recipe: RecipeRow
    let action: () -> Void

    var body: some View {
        DishCard(name: recipe.name, imageUrl: recipe.imageUrl, detail: detail, action: action)
    }

    private var detail: String {
        let parts = [
            recipe.kcalPerServing > 0 ? "\(formatInt(recipe.kcalPerServing)) kcal" : nil,
            recipe.prepMinutes.map { "\($0) min" },
        ].compactMap { $0 }
        return parts.isEmpty ? "\(servings(recipe.servings)) parts" : parts.joined(separator: " · ")
    }
}

/// Une carte de plat : photo (ou motif), nom sur deux lignes, une ligne de détail.
private struct DishCard: View {
    let name: String
    let imageUrl: String?
    let detail: String
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
                    if let url = imageUrl.flatMap(URL.init(string:)) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() }
                        }
                    }
                }
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: Radius.tile, topTrailingRadius: Radius.tile))
            VStack(alignment: .leading, spacing: 0) {
                Text(name).textStyle(nt(14, 600, line: 1.25)).lineLimit(2)
                Text(detail).textStyle(TextStyles.small)
            }
            .padding(10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(radius: Radius.tile)
        .tap(action)
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
        let title = slot.map { "\(dayLabel($0.date)) · \($0.meal.label.lowercased())" } ?? ""
        NutriSheet(visible: slot != nil, title: title, onDismiss: onDismiss, gap: 10) {
            ForEach(ordered) { item in
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

    /// Les plats de ce moment d'abord, puis ceux sans moment, puis les autres.
    private var ordered: [BasketRow] {
        func rank(_ item: BasketRow) -> Int {
            guard let meal = Meal.orNil(item.meal) else { return 1 }
            return meal == slot?.meal ? 0 : 2
        }
        return basket.enumerated()
            .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }
            .map(\.element)
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
