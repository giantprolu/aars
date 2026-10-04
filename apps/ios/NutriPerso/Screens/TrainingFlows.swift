import SwiftUI

/// Le gabarit des écrans du Sport poussés par-dessus la coquille.
private struct FlowScaffold<Content: View, Footer: View>: View {
    let title: String
    let onClose: () -> Void
    @ViewBuilder let content: Content
    @ViewBuilder let footer: Footer

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).textStyle(TextStyles.screenTitle).frame(maxWidth: .infinity, alignment: .leading)
                CloseButton(action: onClose)
            }
            .padding(16)
            ScrollView {
                VStack(alignment: .leading, spacing: Space.block) { content }
                    .padding(.horizontal, Space.screenH)
            }
            .scrollDismissesKeyboard(.interactively)
            VStack(spacing: 8) { footer }
                .padding(16)
        }
        .background(Neutrals.screen.ignoresSafeArea())
    }
}

/// Un exercice choisi, et ce qu'on en tape.
private struct Composed: Identifiable {
    let id = UUID()
    let exercise: CatalogExercise
    var sets = "3"
    var reps: String
    var seconds: String

    init(_ exercise: CatalogExercise) {
        self.exercise = exercise
        reps = exercise.kind == "strength" ? "10" : ""
        seconds = exercise.kind == "strength" ? "" : "45"
    }
}

/**
 Composer une séance : choisir des exercices, leurs séries, puis la lancer
 aussitôt ou la garder en favori (`POST /api/training/templates`).
 */
struct ComposeScreen: View {
    let model: AppModel
    let onClose: () -> Void
    let onStarted: (Int) -> Void

    @State private var catalog: [CatalogExercise]?
    @State private var picking = false
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    @State private var chosen: [Composed] = []

    var body: some View {
        let training = Domains.training
        ZStack {
            FlowScaffold(title: "Composer", onClose: onClose) {
                Labeled(label: "Nom, facultatif") {
                    NutriField(text: $name, placeholder: "Haut du corps", focusColor: training.textOnLight).filtered($name, maxLength(60))
                }
                ForEach($chosen) { $item in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(item.exercise.name).textStyle(nt(15, 600)).frame(maxWidth: .infinity, alignment: .leading)
                            LucideIcon(.x, 16, Neutrals.muted)
                                .tap { chosen.removeAll { $0.id == item.id } }
                                .accessibilityLabel("Retirer")
                        }
                        HStack(spacing: 8) {
                            SmallNumber(label: "séries", value: $item.sets)
                            if item.exercise.kind == "strength" {
                                SmallNumber(label: "reps", value: $item.reps)
                            } else {
                                SmallNumber(label: "secondes", value: $item.seconds)
                            }
                        }
                    }
                    .padding(12)
                    .card(radius: Radius.tile)
                }
                HStack(spacing: 0) {
                    LucideIcon(.plus, 16, training.textOnLight)
                    Text(catalog == nil ? "  Chargement du catalogue…" : "  Ajouter un exercice").textStyle(nt(14, 600, training.textOnLight))
                }
                .frame(maxWidth: .infinity)
                .padding(14)
                .tinted(training.soft, radius: Radius.tile)
                .tap { if catalog != nil { picking = true } }
                if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
            } footer: {
                PrimaryButton(text: "Commencer", colors: training, height: 52, enabled: !chosen.isEmpty, busy: busy) { submit(start: true) }
                GhostButton(text: "Garder en favori sans commencer") { if !chosen.isEmpty { submit(start: false) } }
            }
            if picking {
                ExercisePicker(exercises: catalog ?? [], onPick: { exercise in
                    chosen.append(Composed(exercise))
                    picking = false
                }, onClose: { picking = false })
                .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.3), value: picking)
    }

    private func loadCatalog() async {
        switch await model.api.exercises() {
        case .success(let response):
            let favorites = Set(response.favoriteIds)
            // Les favoris d'abord, l'ordre du serveur ensuite.
            catalog = response.exercises.filter { favorites.contains($0.id) } + response.exercises.filter { !favorites.contains($0.id) }
        case .failure(let failure):
            error = failure.message
        }
    }

    private func submit(start: Bool) {
        let exercises = chosen.compactMap { item -> ComposedExercise? in
            guard let sets = Int(item.sets) else { return nil }
            let timed = item.exercise.kind != "strength"
            return ComposedExercise(
                exerciseId: item.exercise.id,
                sets: sets,
                reps: timed ? nil : Int(item.reps),
                seconds: timed ? Int(item.seconds) : nil
            )
        }
        guard exercises.count == chosen.count, !exercises.isEmpty else {
            error = "Chaque exercice demande un nombre de séries."
            return
        }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        busy = true
        error = nil
        Task {
            let result = await model.api.compose(ComposeBody(name: trimmed.isEmpty ? nil : trimmed, exercises: exercises, keep: !start, start: start))
            busy = false
            switch result {
            case .success(let response):
                model.bump()
                if start, let sessionId = response.sessionId {
                    onStarted(sessionId)
                } else {
                    model.toast("Séance gardée dans tes favoris")
                    onClose()
                }
            case .failure(let failure):
                error = failure.message
            }
        }
    }
}

private struct SmallNumber: View {
    let label: String
    @Binding var value: String

    var body: some View {
        HStack(spacing: 4) {
            TextField("", text: $value)
                .keyboardType(.numberPad)
                .textStyle(nt(15, 600, line: 1.2))
                .tint(Domains.training.fill)
                .filtered($value, onlyDigits(4))
            Text(label).textStyle(nt(12, 400, Neutrals.muted))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Neutrals.fieldBorder, lineWidth: 1))
    }
}

private let example = """
Chest press machine 4X12 27.5kg - 20 kg - 27.5 kg - 20 kg
shoulder press machine 3X10 50 - 42.5 - 35
pec deck 2X12 et 1X10 (echec) 6-6-6
"""

private let warnings = [
    "no_sets": "Aucune série reconnue sur cette ligne.",
    "weight_count": "Le nombre de charges ne correspond pas au nombre de séries.",
]

private func describe(_ set: ParsedSet) -> String {
    let main: String
    if let seconds = set.seconds {
        main = "\(seconds) s"
    } else if let weight = set.weightKg, let reps = set.reps {
        main = "\(formatNumber(weight)) kg × \(reps)"
    } else if let reps = set.reps {
        main = "\(reps) reps"
    } else {
        main = "?"
    }
    return set.toFailure ? "\(main) (échec)" : main
}

/**
 « Déjà faite » : coller une séance écrite à la main (carnet, notes), la
 faire lire par le serveur, vérifier, puis l'enregistrer à sa date.
 */
struct ImportScreen: View {
    let model: AppModel
    let onClose: () -> Void

    @State private var text = ""
    @State private var lines: [AnalysedLine]?
    @State private var dayOffset = 0
    @State private var busy = false
    @State private var error: String?

    /// Le jour choisi, au calendrier du téléphone.
    private var date: Date {
        Calendar.current.date(byAdding: .day, value: -dayOffset, to: Date()) ?? Date()
    }

    private var isoDate: String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    var body: some View {
        let training = Domains.training
        FlowScaffold(title: "Séance déjà faite", onClose: onClose) {
            if let lines {
                review(lines)
            } else {
                Text("Une ligne par exercice : le nom, les séries et les charges, comme sur un carnet.").textStyle(TextStyles.secondary)
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(example).textStyle(nt(14, 400, Neutrals.faint)).padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
                    }
                    TextEditor(text: $text)
                        .textStyle(nt(14))
                        .scrollContentBackground(.hidden)
                        .tint(training.fill)
                        .filtered($text, maxLength(4000))
                }
                .frame(minHeight: 180)
                .padding(9)
                .card(radius: Radius.field)
            }
            if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
        } footer: {
            if let lines {
                PrimaryButton(text: "Enregistrer", colors: training, height: 52, busy: busy) { save(lines) }
                GhostButton(text: "Modifier le texte") { self.lines = nil }
            } else {
                PrimaryButton(
                    text: "Lire la séance", colors: training, height: 52,
                    enabled: !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, busy: busy, action: analyse
                )
            }
        }
    }

    @ViewBuilder
    private func review(_ lines: [AnalysedLine]) -> some View {
        let training = Domains.training
        Labeled(label: "Date") {
            HStack(spacing: 6) {
                ForEach([("Aujourd'hui", 0), ("Hier", 1), ("Avant-hier", 2)], id: \.1) { label, offset in
                    let selected = offset == dayOffset
                    Text(label)
                        .textStyle(nt(13, selected ? 600 : 500, selected ? training.textOnFill : training.textOnLight))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(selected ? training.fill : training.soft, in: Capsule())
                        .tap { dayOffset = offset }
                }
            }
        }
        Text(formatLongDate(isoDate)).textStyle(TextStyles.secondary)
        ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
            let matched = line.candidates.first { $0.id == line.matchedExerciseId }
            VStack(alignment: .leading, spacing: 4) {
                Text(matched?.name ?? line.name).textStyle(nt(15, 600))
                if matched == nil { Text("Nouvel exercice, créé sous ce nom").textStyle(TextStyles.small) }
                Text(line.sets.isEmpty ? "—" : line.sets.map(describe).joined(separator: " · ")).textStyle(nt(13, 400, Neutrals.muted))
                if let warning = warnings[line.warning] {
                    Text(warning).textStyle(nt(12.5, 500, Domains.kitchen.textOnLight))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .card(radius: Radius.tile)
        }
    }

    private func analyse() {
        busy = true
        error = nil
        Task {
            switch await model.api.analyseLog(text) {
            case .success(let response): lines = response.lines
            case .failure(let failure): error = failure.message
            }
            busy = false
        }
    }

    private func save(_ lines: [AnalysedLine]) {
        let written = lines.filter { !$0.sets.isEmpty }.map { WrittenLine(exerciseId: $0.matchedExerciseId, name: $0.name, sets: $0.sets) }
        guard !written.isEmpty else {
            error = "Aucune série à enregistrer."
            return
        }
        busy = true
        Task {
            switch await model.api.saveLog(date: isoDate, lines: written) {
            case .success:
                model.bump()
                model.toast("Séance enregistrée")
                onClose()
            case .failure(let failure):
                error = failure.message
            }
            busy = false
        }
    }
}
