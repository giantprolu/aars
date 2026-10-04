import SwiftUI

/// Accent de la séance : Sport clair sur fond sombre (README de la maquette).
private let accent = Domains.training.light
private let dark = Neutrals.workoutDark
private let raised = Color(argb: 0xFF2A2621)
private let onDark = Color(argb: 0xFFF4F1EB)
private let onDarkMuted = Color(argb: 0xFFA39A8F)
private let warningInk = Color(argb: 0xFFF8DDE1)

/// Ce que l'utilisateur tape pour une série, avant de la valider.
private struct Draft {
    var weight: String
    var reps: String
    var seconds: String
    var failure: Bool

    init(_ set: RunnerSet) {
        weight = set.weightKg.map(formatNumber) ?? ""
        reps = set.reps.map(String.init) ?? ""
        seconds = set.seconds.map(String.init) ?? ""
        failure = set.toFailure
    }
}

/// 60, 27,5 : sans décimale inutile.
func formatNumber(_ value: Double) -> String {
    value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value).replacingOccurrences(of: ".", with: ",")
}

private func parseDecimal(_ text: String) -> Double? {
    Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
}

/// 4:05, ou 1:02:03 au-delà d'une heure.
private func clock(_ totalSeconds: Int) -> String {
    let s = max(totalSeconds, 0)
    return s >= 3600
        ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
        : String(format: "%d:%02d", s / 60, s % 60)
}

/// Un instant du serveur (`2026-10-04T18:02:11.000Z`).
func parseInstant(_ text: String) -> Date? {
    (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text)) ?? (try? Date.ISO8601FormatStyle().parse(text))
}

/// 1 240 kg, ou 12,4 t au-delà d'une tonne.
func formatTonnage(_ kg: Double) -> (value: String, unit: String) {
    kg >= 1000
        ? (String(format: "%.1f", locale: Locale(identifier: "fr_FR"), (kg / 100).rounded() / 10), " t")
        : (formatInt(kg), " kg")
}

/**
 La séance en cours, plein écran et sombre. Chaque série validée part au
 serveur, puis l'écran relit la séance : la consigne, la suggestion et le
 record viennent toujours du serveur.
 */
struct WorkoutScreen: View {
    let model: AppModel
    let sessionId: Int
    let onClose: () -> Void

    @State private var runner: Runner?
    @State private var error: String?
    @State private var busy = false
    @State private var reload = 0
    @State private var drafts: [String: Draft] = [:]
    @State private var restEndsAt = Date.distantPast
    @State private var now = Date()
    @State private var picking = false
    @State private var confirmDiscard = false

    var body: some View {
        ZStack {
            dark.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 12) { exercises }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                }
                .scrollDismissesKeyboard(.interactively)
                footer
            }
            if picking, let runner {
                ExercisePicker(exercises: runner.catalog, onPick: { exercise in
                    picking = false
                    act { await $0.addSessionExercise(sessionId: runner.id, exerciseId: exercise.id) }
                }, onClose: { picking = false })
                .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.3), value: picking)
        .preferredColorScheme(.dark)
        .task(id: reload) { await load() }
        .task { await tick() }
    }

    // MARK: Morceaux.

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text(runner?.name ?? "Séance").textStyle(nt(20, 600, onDark, tracking: -0.02)).lineLimit(1)
                    if let runner { Text(summary(runner)).textStyle(nt(12.5, 400, onDarkMuted)) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                CloseButton(dark: true, action: onClose)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            if let runner, runner.plannedSets > 0 {
                ProgressTrack(fraction: Double(runner.recordedSets) / Double(runner.plannedSets), track: raised, fill: accent, height: 5)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            if let error {
                Text(error).textStyle(nt(13, 500, warningInk)).padding(.horizontal, 20).padding(.vertical, 4)
            }
        }
    }

    private func summary(_ runner: Runner) -> String {
        let end = runner.finishedAt.flatMap(parseInstant) ?? now
        let elapsed = parseInstant(runner.startedAt).map { clock(Int(end.timeIntervalSince($0))) }
        let tonnage = formatTonnage(runner.volumeKg)
        return [elapsed, "\(runner.recordedSets) / \(runner.plannedSets) séries", tonnage.value + tonnage.unit]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    @ViewBuilder
    private var exercises: some View {
        if let runner {
            // La première série pas encore faite est la série active.
            let active = runner.exercises.lazy.compactMap { exercise in
                exercise.sets.first { !$0.done }.map { "\(exercise.exerciseId):\($0.setIndex)" }
            }.first
            ForEach(runner.exercises, id: \.position) { exercise in
                ExerciseBlock(
                    exercise: exercise,
                    closed: runner.closed,
                    timed: isTimed(exercise),
                    active: active,
                    busy: busy,
                    draft: { draft(exercise, $0) },
                    onDraft: { drafts[key(exercise, $0)] = $1 },
                    onSave: { save(exercise, $0) }
                )
            }
            if runner.canAddExercise {
                HStack(spacing: 8) {
                    LucideIcon(.plus, 16, accent)
                    Text("Ajouter un exercice").textStyle(nt(14, 600, accent))
                }
                .frame(maxWidth: .infinity)
                .padding(14)
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(raised, lineWidth: 1))
                .tap { picking = true }
            }
            if runner.closed {
                FinishedPanel(
                    runner: runner,
                    busy: busy,
                    onVisibility: { value in act { await $0.setVisibility(sessionId: runner.id, visibility: value) } },
                    onFavorite: { act { await $0.favoriteSession(runner.id) } }
                )
            } else {
                Text(confirmDiscard ? "Toucher encore pour supprimer cette séance" : "Abandonner la séance")
                    .textStyle(nt(13.5, 500, confirmDiscard ? warningInk : onDarkMuted))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(10)
                    .tap {
                        if confirmDiscard {
                            act({ await $0.discardSession(runner.id) }) {
                                model.bump()
                                onClose()
                            }
                        } else {
                            confirmDiscard = true
                        }
                    }
            }
        } else {
            Text(error == nil ? "Chargement…" : "")
                .textStyle(nt(14, 400, onDarkMuted))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
        }
    }

    /// Le repos, puis le bouton de fin.
    @ViewBuilder
    private var footer: some View {
        if let runner, !runner.closed {
            VStack(spacing: 10) {
                if restEndsAt > now {
                    HStack(spacing: 0) {
                        LucideIcon(.timer, 18, accent).padding(.trailing, 10)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Repos").textStyle(nt(12, 500, onDarkMuted))
                            Text(clock(Int(restEndsAt.timeIntervalSince(now).rounded(.up)))).textStyle(nt(22, 700, onDark, line: 1.1))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text("+30 s").textStyle(nt(13, 600, accent)).padding(8).tap { restEndsAt += 30 }
                        Text("Passer").textStyle(nt(13, 600, onDark)).padding(8).tap { restEndsAt = .distantPast }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(raised, in: RoundedRectangle(cornerRadius: 18))
                }
                Text("Terminer la séance")
                    .textStyle(nt(15.5, 700, dark))
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(accent, in: Capsule())
                    .tap(enabled: !busy) {
                        act({ await $0.finishSession(runner.id) }) {
                            restEndsAt = .distantPast
                            model.bump()
                            reload += 1
                        }
                    }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    // MARK: Logique.

    private func key(_ exercise: RunnerExercise, _ set: RunnerSet) -> String {
        "\(exercise.exerciseId):\(set.setIndex)"
    }

    private func draft(_ exercise: RunnerExercise, _ set: RunnerSet) -> Draft {
        drafts[key(exercise, set)] ?? Draft(set)
    }

    private func isTimed(_ exercise: RunnerExercise) -> Bool {
        exercise.kind == "hold" || exercise.kind == "cardio"
    }

    private func load() async {
        switch await model.api.runner(sessionId: sessionId) {
        case .success(let value):
            runner = value
            error = nil
        case .failure(let failure):
            error = failure.message
        }
    }

    /// L'horloge de la séance et du repos ; une vibration quand le repos finit.
    private func tick() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(500))
            let previous = now
            now = Date()
            if restEndsAt > previous && restEndsAt <= now { Haptics.longPress() }
        }
    }

    private func save(_ exercise: RunnerExercise, _ set: RunnerSet) {
        guard let current = runner else { return }
        let draft = draft(exercise, set)
        let timed = isTimed(exercise)
        let body = SetBody(
            sessionId: current.id,
            exerciseId: exercise.exerciseId,
            position: exercise.position,
            setIndex: set.setIndex,
            weightKg: timed ? nil : parseDecimal(draft.weight),
            reps: timed ? nil : Int(draft.reps.trimmingCharacters(in: .whitespaces)),
            seconds: timed ? Int(draft.seconds.trimmingCharacters(in: .whitespaces)) : nil,
            toFailure: draft.failure
        )
        busy = true
        Task {
            let result = await model.api.recordSet(body)
            busy = false
            if case .failure = result {
                error = "Série non enregistrée. Vérifie les valeurs."
                return
            }
            error = nil
            Haptics.selection()
            drafts[key(exercise, set)] = nil
            if !set.done, let rest = exercise.restSeconds { restEndsAt = Date().addingTimeInterval(Double(rest)) }
            let before = exercise.recordSetIndex
            switch await model.api.runner(sessionId: current.id) {
            case .success(let next):
                runner = next
                let after = next.exercises.first { $0.position == exercise.position }?.recordSetIndex
                if after == set.setIndex && before != set.setIndex { model.toast("Nouveau record sur \(exercise.name)") }
            case .failure:
                reload += 1
            }
        }
    }

    private func act(_ call: @escaping (Api) async -> ApiResult<Void>, after: (() -> Void)? = nil) {
        busy = true
        Task {
            let result = await call(model.api)
            busy = false
            switch result {
            case .failure(let failure): error = failure.message
            case .success: if let after { after() } else { reload += 1 }
            }
        }
    }
}

private struct ExerciseBlock: View {
    let exercise: RunnerExercise
    let closed: Bool
    let timed: Bool
    let active: String?
    let busy: Bool
    let draft: (RunnerSet) -> Draft
    let onDraft: (RunnerSet, Draft) -> Void
    let onSave: (RunnerSet) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text(exercise.name).textStyle(nt(16, 600, onDark)).lineLimit(2)
                    Text(exercise.prescription).textStyle(nt(12.5, 400, onDarkMuted))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(exercise.sets.filter(\.done).count)/\(exercise.sets.count)").textStyle(nt(13, 700, accent))
            }
            if let suggestion = exercise.suggestion {
                Text(suggestion.reason).textStyle(nt(12.5, 500, suggestion.trend == "up" ? accent : onDark))
            }
            if let previous = exercise.previous {
                Text("La dernière fois : \(previous)").textStyle(nt(12, 400, onDarkMuted))
            }
            ForEach(exercise.sets, id: \.setIndex) { set in
                SetRow(
                    set: set,
                    draft: draft(set),
                    timed: timed,
                    active: !closed && active == "\(exercise.exerciseId):\(set.setIndex)",
                    record: exercise.recordSetIndex == set.setIndex,
                    editable: !closed,
                    busy: busy,
                    onDraft: { onDraft(set, $0) },
                    onSave: { onSave(set) }
                )
            }
        }
        .padding(14)
        .background(raised, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct SetRow: View {
    let set: RunnerSet
    let draft: Draft
    let timed: Bool
    let active: Bool
    let record: Bool
    let editable: Bool
    let busy: Bool
    let onDraft: (Draft) -> Void
    let onSave: () -> Void

    var body: some View {
        // La série active se lit sur fond clair, les autres restent sombres.
        let ink = active ? Neutrals.ink : onDark
        let muted = active ? Neutrals.muted : onDarkMuted
        HStack(spacing: 8) {
            Text("\(set.setIndex)").textStyle(nt(13, 700, muted)).frame(width: 18, alignment: .leading)
            if timed {
                NumberBox(value: binding(\.seconds, onlyDigits(4)), unit: "s", ink: ink, muted: muted, enabled: editable)
            } else {
                NumberBox(value: binding(\.weight, decimalInput), unit: "kg", ink: ink, muted: muted, enabled: editable, decimal: true)
                NumberBox(value: binding(\.reps, onlyDigits(3)), unit: "reps", ink: ink, muted: muted, enabled: editable)
            }
            if record { LucideIcon(.trendingUp, 16, Neutrals.recordBg) }
            LucideIcon(.flame, 14, draft.failure ? Domains.kitchen.textOnFill : muted)
                .frame(width: 28, height: 28)
                .background(draft.failure ? Domains.kitchen.fill : .clear, in: Circle())
                .overlay(Circle().strokeBorder(muted, lineWidth: 1))
                .tap(enabled: editable) {
                    var next = draft
                    next.failure.toggle()
                    onDraft(next)
                }
                .accessibilityLabel("Jusqu'à l'échec")
            LucideIcon(.check, 18, set.done ? dark : active ? .white : muted)
                .frame(width: 36, height: 36)
                .background(set.done ? accent : active ? Domains.training.fill : .clear, in: Circle())
                .overlay {
                    if !set.done && !active { Circle().strokeBorder(muted, lineWidth: 1.5) }
                }
                .tap(enabled: editable && !busy, onSave)
                .accessibilityLabel("Valider la série \(set.setIndex)")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(active ? Neutrals.card : .clear, in: RoundedRectangle(cornerRadius: 12))
    }

    private func binding(_ field: WritableKeyPath<Draft, String>, _ clean: @escaping (String) -> String) -> Binding<String> {
        Binding(
            get: { draft[keyPath: field] },
            set: { value in
                var next = draft
                next[keyPath: field] = clean(value)
                onDraft(next)
            }
        )
    }

    private func decimalInput(_ text: String) -> String {
        String(text.filter { $0.isNumber || $0 == "," || $0 == "." }.prefix(6))
    }
}

private struct NumberBox: View {
    @Binding var value: String
    let unit: String
    let ink: Color
    let muted: Color
    let enabled: Bool
    var decimal = false

    var body: some View {
        HStack(spacing: 4) {
            TextField("", text: $value)
                .keyboardType(decimal ? .decimalPad : .numberPad)
                .textStyle(nt(16, 600, ink, line: 1.2))
                .tint(ink)
                .disabled(!enabled)
            Text(unit).textStyle(nt(12, 400, muted))
        }
        .padding(.horizontal, 10)
        .frame(height: 40)
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(muted.opacity(0.5), lineWidth: 1))
    }
}

private struct FinishedPanel: View {
    let runner: Runner
    let busy: Bool
    let onVisibility: (String) -> Void
    let onFavorite: () -> Void

    var body: some View {
        let kitchen = Domains.kitchen
        VStack(alignment: .leading, spacing: 10) {
            Text("Séance terminée").textStyle(nt(16, 600))
            Text("Ce que tes abonnés en voient").textStyle(nt(12.5, 500, Neutrals.muted))
            HStack(spacing: 0) {
                ForEach(runner.visibilities, id: \.value) { option in
                    let selected = option.value == runner.visibility
                    Text(option.label)
                        .textStyle(nt(13, selected ? 600 : 500, selected ? Neutrals.ink : Neutrals.muted))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(selected ? Neutrals.card : .clear, in: Capsule())
                        .tap(enabled: !busy && !selected) { onVisibility(option.value) }
                }
            }
            .padding(3)
            .background(Neutrals.chip, in: Capsule())
            if let note = runner.visibilities.first(where: { $0.value == runner.visibility })?.note {
                Text(note).textStyle(nt(12.5, 400, Neutrals.muted))
            }
            if runner.favorited {
                Text("Dans tes favoris").textStyle(nt(13, 600, kitchen.textOnLight))
            } else {
                HStack(spacing: 6) {
                    LucideIcon(.star, 15, kitchen.textOnLight)
                    Text("Garder en favori").textStyle(nt(13.5, 600, kitchen.textOnLight))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(kitchen.soft, in: Capsule())
                .tap(enabled: !busy, onFavorite)
            }
        }
        .padding(16)
        .background(Neutrals.card, in: RoundedRectangle(cornerRadius: 18))
    }
}

/// Liste filtrable du catalogue, plein écran.
struct ExercisePicker: View {
    let exercises: [CatalogExercise]
    let onPick: (CatalogExercise) -> Void
    let onClose: () -> Void
    var title = "Ajouter un exercice"

    @State private var query = ""

    var body: some View {
        let training = Domains.training
        let needle = query.trimmingCharacters(in: .whitespaces)
        let shown = exercises.filter { needle.isEmpty || $0.name.localizedCaseInsensitiveContains(needle) }
        VStack(spacing: 0) {
            HStack {
                Text(title).textStyle(nt(19, 600, tracking: -0.02)).frame(maxWidth: .infinity, alignment: .leading)
                CloseButton(action: onClose)
            }
            .padding(16)
            NutriField(
                text: $query,
                placeholder: "Chercher un exercice",
                focusColor: training.textOnLight,
                height: 46,
                leadingIcon: .search,
                leadingTint: training.textOnLight,
                textSize: 14
            )
            .padding(.horizontal, 16)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(shown.prefix(120)) { exercise in
                        HStack {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(exercise.name).textStyle(nt(14, 500))
                                if let group = exercise.muscleGroup { Text(group).textStyle(TextStyles.small) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            LucideIcon(.plus, 16, training.textOnLight)
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 10)
                        .frame(minHeight: 48)
                        .tap { onPick(exercise) }
                    }
                    if shown.isEmpty {
                        Text("Aucun exercice.").textStyle(nt(13, 400, Neutrals.muted)).padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Neutrals.screen.ignoresSafeArea())
    }
}
