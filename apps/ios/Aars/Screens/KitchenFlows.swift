import SwiftUI

/// Recherche d'un aliment ou d'un produit, résultats en liste ; un toucher le choisit.
private struct FoodSearch: View {
    let model: AppModel
    let onPick: (SearchHit) -> Void

    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var message: String?

    var body: some View {
        let kitchen = Domains.kitchen
        NutriField(
            text: $query,
            placeholder: "Chercher un aliment",
            focusColor: kitchen.textOnLight,
            height: 46,
            background: kitchen.soft,
            border: nil,
            leadingIcon: .search,
            leadingTint: kitchen.textOnLight,
            textSize: 14
        )
        .task(id: query) { await search() }
        if let message {
            Text(message).textStyle(TextStyles.secondary).padding(.horizontal, 4)
        }
        if !hits.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(hits.enumerated()), id: \.offset) { _, hit in
                    HStack {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(hit.name).textStyle(TextStyles.bodyStrong).lineLimit(2)
                            Text("\(formatInt(hit.per100g.kcal)) kcal / 100 g").textStyle(TextStyles.small)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        LucideIcon(.plus, 16, kitchen.textOnLight)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .tap {
                        onPick(hit)
                        query = ""
                    }
                }
            }
            .card()
        }
    }

    private func search() async {
        message = nil
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 3 else {
            hits = []
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        switch await model.search(trimmed) {
        case .success(let found):
            hits = Array(found.prefix(10))
            if hits.isEmpty { message = "Aucun résultat." }
        case .failure(let failure):
            message = failure.message
        }
    }
}

private struct GramsField: View {
    @Binding var value: String

    var body: some View {
        HStack(spacing: 4) {
            TextField("", text: $value)
                .keyboardType(.numberPad)
                .textStyle(nt(15, 600, line: 1.2))
                .tint(Domains.kitchen.fill)
                .frame(width: 56)
                .filtered($value, onlyDigits(5))
            Text("g").textStyle(nt(12, 400, Neutrals.muted))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Neutrals.fieldBorder, lineWidth: 1))
    }
}

/// « 100 » pour un aliment sans portion connue.
private func defaultGrams(_ hit: SearchHit) -> String {
    String(Int(((hit.servingSizeG ?? 100) + 0.5).rounded(.down)))
}

/// « Un article » : un aliment ajouté à la main à la liste de la semaine.
struct AddItemScreen: View {
    let model: AppModel
    let weekStart: String
    let onClose: () -> Void

    @State private var picked: SearchHit?
    @State private var grams = ""
    @State private var busy = false

    var body: some View {
        FlowScaffold(title: "Un article", onClose: onClose) {
            if let hit = picked {
                HStack(spacing: 12) {
                    Text(hit.name).textStyle(nt(15, 600)).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    GramsField(value: $grams)
                }
                .padding(14)
                .tinted(Domains.kitchen.soft, radius: Radius.tile)
                GhostButton(text: "Choisir un autre aliment") { picked = nil }
            } else {
                FoodSearch(model: model) { hit in
                    picked = hit
                    grams = defaultGrams(hit)
                }
            }
        } footer: {
            if let hit = picked {
                PrimaryButton(text: "Ajouter à la liste", colors: Domains.kitchen, height: 52, busy: busy) { add(hit) }
            }
        }
    }

    private func add(_ hit: SearchHit) {
        guard let quantity = Int(grams), quantity > 0 else {
            model.toast("Une quantité en grammes.")
            return
        }
        busy = true
        Task {
            switch await model.api.addShoppingItem(weekStart: weekStart, hit: hit, quantityG: quantity) {
            case .success:
                model.bump()
                model.toast("\(hit.name) ajouté à la liste")
                onClose()
            case .failure(let failure):
                model.toast(failure.message)
            }
            busy = false
        }
    }
}

/**
 « Scanner pour cocher » : en rayon, le produit scanné propose l'article de la
 liste qu'il coche ; on confirme ou on en choisit un autre. Le produit est
 retenu pour cet ingrédient, comme sur la PWA.
 */
struct ScanCheckScreen: View {
    let model: AppModel
    let weekStart: String
    let items: [ShoppingItemRow]
    let onClose: () -> Void

    @State private var access = CameraAccess.unknown
    @State private var match: ScanMatch?
    @State private var busy = false
    @State private var chosen: Int?
    @Environment(\.openURL) private var openURL

    var body: some View {
        let kitchen = Domains.kitchen
        ZStack {
            Neutrals.scanner.ignoresSafeArea()
            if access == .granted {
                CameraPreview(paused: busy || match != nil, onBarcode: scanned).ignoresSafeArea()
            }
            VStack(spacing: 0) {
                HStack {
                    Text("En rayon").textStyle(nt(17, 600, .white)).frame(maxWidth: .infinity, alignment: .leading)
                    CloseButton(dark: true, action: onClose)
                }
                .padding(20)
                Spacer()
                CappedScroll(maxHeight: 420) {
                    VStack(alignment: .leading, spacing: 10) { panel(kitchen) }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background {
                    UnevenRoundedRectangle(topLeadingRadius: Radius.sheet, topTrailingRadius: Radius.sheet)
                        .fill(Neutrals.card)
                        .ignoresSafeArea(edges: .bottom)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { access = await CameraAccess.request() }
    }

    @ViewBuilder
    private func panel(_ kitchen: DomainColors) -> some View {
        let open = items.filter { $0.checkedAt == nil }
        if access == .denied {
            PrimaryButton(text: "Autoriser la caméra", colors: kitchen, height: 48) {
                if let settings = URL(string: UIApplication.openSettingsURLString) { openURL(settings) }
            }
        } else if access == .unavailable {
            Text("Caméra indisponible sur cet appareil.").textStyle(TextStyles.secondary)
        } else if let current = match {
            Text(current.productName ?? "Produit inconnu d'Open Food Facts").textStyle(nt(15, 600))
            Text(current.suggestedItemId != nil ? "C'est sans doute cet article :" : "Quel article coche-t-il ?").textStyle(TextStyles.secondary)
            ForEach(open) { item in
                let selected = item.id == chosen
                HStack {
                    Text(item.label).textStyle(nt(14, selected ? 600 : 400)).frame(maxWidth: .infinity, alignment: .leading)
                    Text(item.quantityLabel).textStyle(TextStyles.small)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 9)
                .background(selected ? kitchen.soft : .clear, in: RoundedRectangle(cornerRadius: 12))
                .tap { chosen = item.id }
            }
            let target = open.first { $0.id == chosen }
            PrimaryButton(text: "Cocher", colors: kitchen, height: 48, enabled: target != nil) {
                if let target { check(target, barcode: current.barcode) }
            }
            GhostButton(text: "Scanner un autre produit") {
                match = nil
                chosen = nil
            }
        } else {
            Text(busy ? "Recherche du produit…" : "Scanne le paquet que tu mets dans le chariot.").textStyle(TextStyles.secondary)
        }
    }

    private func scanned(_ barcode: String) {
        busy = true
        Task {
            switch await model.api.scanMatch(barcode: barcode, weekStart: weekStart) {
            case .success(let found):
                match = found
                chosen = found.suggestedItemId
            case .failure(let failure):
                model.toast(failure.message)
            }
            busy = false
        }
    }

    private func check(_ item: ShoppingItemRow, barcode: String) {
        Task {
            switch await model.api.checkItemScanned(item, barcode: barcode) {
            case .success:
                model.bump()
                model.toast("\(item.label) coché")
                match = nil
                chosen = nil
            case .failure(let failure):
                model.toast(failure.message)
            }
        }
    }
}

/// Un ingrédient de la recette en cours d'écriture.
private struct Ingredient: Identifiable {
    let id = UUID()
    let hit: SearchHit
    var grams: String
    /// La ligne de la page d'origine, pour une recette importée.
    var line: String?

    init(_ hit: SearchHit) {
        self.hit = hit
        grams = defaultGrams(hit)
    }

    /// Un ingrédient du brouillon : sans poids connu, le champ reste vide et sera réclamé.
    init(_ draft: DraftIngredient) {
        hit = draft.hit
        grams = draft.quantityG.map { String(Int($0.rounded())) } ?? ""
        line = draft.line
    }
}

/// Écrire une recette : nom, parts, ingrédients trouvés par la recherche, étapes.
/// Avec un brouillon (import de Cuisine+), tout arrive rempli, à relire.
/// Un plat du catalogue : photo, moment, ingrédients et étapes. On le prend
/// pour la semaine (installé puis mis au panier), ou seulement dans ses recettes.
struct CatalogMealScreen: View {
    let model: AppModel
    let meal: CatalogMealRow
    let weekStart: String
    let onClose: () -> Void

    @State private var busy = false

    var body: some View {
        let kitchen = Domains.kitchen
        FlowScaffold(title: meal.name, onClose: onClose) {
            Color.clear
                .aspectRatio(1.6, contentMode: .fit)
                .overlay {
                    PhotoStripes(background: kitchen.soft, stripe: kitchen.seg)
                    if let url = meal.imageUrl.flatMap(URL.init(string:)) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() }
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.tile))
            Text(summary).textStyle(TextStyles.secondary)
            Text("Ingrédients pour \(formatServings(meal.servings)) parts").textStyle(nt(13, 500))
            VStack(spacing: 0) {
                ForEach(Array(meal.ingredients.enumerated()), id: \.offset) { _, ingredient in
                    HStack {
                        Text(ingredient.label).textStyle(nt(14)).frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(formatInt(ingredient.quantityG)) g").textStyle(nt(13, 600, Neutrals.muted))
                    }
                    .padding(.vertical, 6)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .card(radius: Radius.tile)
            if !meal.steps.isEmpty {
                Text("Étapes").textStyle(nt(13, 500))
                ForEach(Array(meal.steps.enumerated()), id: \.offset) { index, step in
                    Text("\(index + 1). \(step)").textStyle(nt(14)).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        } footer: {
            PrimaryButton(text: "Ajouter aux plats de la semaine", colors: kitchen, height: 52, busy: busy) {
                run({ await model.api.chooseCatalog(weekStart: weekStart, slug: meal.slug) }, done: "\(meal.name) ajouté aux plats de la semaine")
            }
            GhostButton(text: "Seulement l'ajouter à mes recettes") {
                run({ await model.api.installCatalog(slug: meal.slug) }, done: "\(meal.name) ajouté à tes recettes")
            }
        }
    }

    private var summary: String {
        [
            Meal.orNil(meal.slot)?.label,
            meal.kcal > 0 ? "\(formatInt(Double(meal.kcal))) kcal par part" : nil,
            meal.proteinG > 0 ? "\(meal.proteinG) g de protéines" : nil,
            meal.prepMinutes.map { "\($0) min" },
        ].compactMap { $0 }.joined(separator: " · ")
    }

    private func run(_ call: @escaping @MainActor () async -> ApiResult<Void>, done: String) {
        guard !busy else { return }
        busy = true
        Task {
            switch await call() {
            case .success:
                model.toast(done)
                model.bump()
                onClose()
            case .failure(let failure):
                model.toast(failure.message)
            }
            busy = false
        }
    }
}

struct RecipeEditorScreen: View {
    let model: AppModel
    let draft: RecipeDraft?
    let onClose: () -> Void

    @State private var name: String
    @State private var servings: String
    @State private var minutes: String
    @State private var steps: String
    @State private var notes = ""
    /// 0 : aucun moment ; ensuite matin, midi, soir, collation.
    @State private var moment = 0
    @State private var ingredients: [Ingredient]
    @State private var error: String?
    @State private var busy = false

    init(model: AppModel, draft: RecipeDraft? = nil, onClose: @escaping () -> Void) {
        self.model = model
        self.draft = draft
        self.onClose = onClose
        _name = State(initialValue: draft?.name ?? "")
        _servings = State(initialValue: draft.map { formatServings($0.servings) } ?? "2")
        _minutes = State(initialValue: draft?.prepMinutes.map(String.init) ?? "")
        _steps = State(initialValue: draft?.steps.joined(separator: "\n") ?? "")
        _ingredients = State(initialValue: draft?.ingredients.map(Ingredient.init) ?? [])
    }

    var body: some View {
        let kitchen = Domains.kitchen
        FlowScaffold(title: draft == nil ? "Nouvelle recette" : "Recette importée", onClose: onClose) {
            if draft != nil {
                Text("Relis les ingrédients : chaque ligne de la page a été rapprochée d'un aliment, et les poids sont des ordres de grandeur.")
                    .textStyle(TextStyles.secondary)
            }
            Labeled(label: "Nom") {
                NutriField(text: $name, placeholder: "Curry de lentilles", focusColor: kitchen.textOnLight).filtered($name, maxLength(80))
            }
            Labeled(label: "Moment") {
                SegmentedPill(
                    options: ["Aucun"] + Meal.planOrder.map(\.moment),
                    selected: moment,
                    onSelect: { moment = $0 },
                    track: kitchen.soft,
                    textColor: kitchen.textOnLight,
                    selectedTextColor: kitchen.textOnLight,
                    textStyle: nt(12.5, 600)
                )
            }
            HStack(alignment: .top, spacing: 12) {
                Labeled(label: "Parts") {
                    NutriField(text: $servings, kind: .decimal, focusColor: kitchen.textOnLight).filtered($servings, maxLength(4))
                }
                Labeled(label: "Préparation (min)") {
                    NutriField(text: $minutes, kind: .number, focusColor: kitchen.textOnLight).filtered($minutes, onlyDigits(3))
                }
            }
            Text("Ingrédients").textStyle(nt(13, 500))
            ForEach($ingredients) { $item in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.hit.name).textStyle(nt(14, 500)).lineLimit(2)
                        if let line = item.line {
                            Text("« \(line) »").textStyle(TextStyles.small).lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    GramsField(value: $item.grams)
                    LucideIcon(.x, 16, Neutrals.muted)
                        .tap { ingredients.removeAll { $0.id == item.id } }
                        .accessibilityLabel("Retirer")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .card(radius: Radius.tile)
            }
            if let unmatched = draft?.unmatched, !unmatched.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Non repris, à ajouter si besoin").textStyle(nt(13, 600))
                    ForEach(Array(unmatched.enumerated()), id: \.offset) { _, line in
                        Text("· \(line)").textStyle(TextStyles.secondary)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .tinted(Domains.kitchen.soft, radius: Radius.tile)
            }
            FoodSearch(model: model) { ingredients.append(Ingredient($0)) }
            Labeled(label: "Étapes, une par ligne") {
                TextEditor(text: $steps)
                    .textStyle(nt(14))
                    .scrollContentBackground(.hidden)
                    .tint(kitchen.fill)
                    .filtered($steps, maxLength(5000))
                    .frame(minHeight: 110)
                    .padding(9)
                    .card(radius: Radius.field)
            }
            Labeled(label: "Notes, facultatif") {
                NutriField(text: $notes, submitLabel: .done, focusColor: kitchen.textOnLight).filtered($notes, maxLength(1000))
            }
            if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
        } footer: {
            PrimaryButton(text: "Enregistrer la recette", colors: kitchen, height: 52, busy: busy, action: save)
        }
    }

    private func save() {
        let parts = Double(servings.replacingOccurrences(of: ",", with: "."))
        let quantities = ingredients.map { Int($0.grams) }
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        if trimmedName.isEmpty {
            error = "Le nom de la recette est vide."
        } else if parts == nil || parts! <= 0 {
            error = "Le nombre de parts est invalide."
        } else if ingredients.isEmpty {
            error = "Ajoute au moins un ingrédient."
        } else if quantities.contains(where: { $0 == nil || $0! <= 0 }) {
            error = "Chaque ingrédient demande une quantité en grammes."
        } else {
            error = nil
        }
        guard error == nil, let parts else { return }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = RecipeCreateBody(
            name: trimmedName,
            servings: parts,
            steps: steps.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
            prepMinutes: Int(minutes),
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            ingredients: zip(ingredients, quantities).map { item, grams in
                IngredientBody(refKind: item.hit.kind, refValue: item.hit.ref, label: String(item.hit.name.prefix(120)), quantityG: grams ?? 0)
            },
            meal: moment == 0 ? nil : Meal.planOrder[moment - 1].rawValue,
            imported: draft == nil ? nil : true
        )
        busy = true
        Task {
            switch await model.api.createRecipe(body, hits: ingredients.map(\.hit)) {
            case .success:
                model.bump()
                model.toast("Recette « \(body.name) » créée")
                onClose()
            case .failure(let failure):
                error = failure.message
                if failure.code == "premium_required" { model.paywallRequested = true }
            }
            busy = false
        }
    }
}

/// Importer une recette depuis un lien (Cuisine+) : le lien, puis le brouillon dans l'éditeur.
struct ImportRecipeScreen: View {
    let model: AppModel
    let onClose: () -> Void

    @State private var url = ""
    @State private var draft: RecipeDraft?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let kitchen = Domains.kitchen
        if let draft {
            RecipeEditorScreen(model: model, draft: draft, onClose: onClose)
        } else {
            FlowScaffold(title: "Importer une recette", onClose: onClose) {
                Text("Colle le lien d'une page de recette, d'un site ou d'un blog de cuisine. Tu relis tout avant d'enregistrer.")
                    .textStyle(TextStyles.secondary)
                Labeled(label: "Lien de la page") {
                    NutriField(text: $url, placeholder: "https://…", kind: .url, submitLabel: .go, onSubmit: read, focusColor: kitchen.textOnLight)
                        .filtered($url, maxLength(2000))
                }
                if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
            } footer: {
                PrimaryButton(
                    text: "Lire la recette", colors: kitchen, height: 52,
                    enabled: !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, busy: busy, action: read
                )
            }
        }
    }

    private func read() {
        let link = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy, !link.isEmpty else { return }
        busy = true
        error = nil
        Task {
            switch await model.api.importRecipe(url: link) {
            case .success(let found):
                draft = found
            case .failure(let failure):
                if failure.code == "premium_required" {
                    model.paywallRequested = true
                } else {
                    error = failure.message
                }
            }
            busy = false
        }
    }
}
