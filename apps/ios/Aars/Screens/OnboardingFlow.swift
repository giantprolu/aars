import SwiftUI

private enum Step {
    case welcome, measures, activity, target, identity, sessions, program

    /// Remplissage des trois segments du haut, en part de chaque étape.
    var fill: [Double] {
        switch self {
        case .welcome: [0, 0, 0]
        case .measures: [0.33, 0, 0]
        case .activity: [0.66, 0, 0]
        case .target: [1, 0, 0]
        case .identity: [1, 0.5, 0]
        case .sessions: [1, 1, 0.5]
        case .program: [1, 1, 1]
        }
    }
}

private let activities = [
    ("sedentary", "Sédentaire, pas de sport"),
    ("light", "Léger, 1 à 3 séances"),
    ("moderate", "Modéré, 3 à 5 séances"),
    ("active", "Actif, 6 à 7 séances"),
    ("veryActive", "Très actif, métier physique"),
]
private let goals = [("lose", "Perdre"), ("maintain", "Maintenir"), ("gain", "Prendre")]
private let focuses = [
    ("upper", "Haut", "Haut du corps, avec un minimum de bas."),
    ("lower", "Bas", "Bas du corps, avec un minimum de haut."),
    ("full", "Les deux", "Les deux à parts égales."),
]
private let equipments = [("free", "Poids libres"), ("machine", "Machines guidées"), ("any", "Indifférent")]
private let rhythms = [2, 3, 4, 5, 6]
private let maxLossRate = 1.0
private let maxGainRate = 0.5
private let manualTargetMax = 6000

/**
 Le parcours d'arrivée (O0 à O4), une seule fois après l'inscription :
 objectif, profil Communauté, séances. Chaque étape écrit sur le serveur avant
 de passer à la suivante : une reprise repart du serveur, pas du téléphone.

 En modification (`editGoal`), seule l'étape Objectif est rejouée, à partir
 du profil enregistré.
 */
struct OnboardingFlow: View {
    let model: AppModel
    var editGoal = false
    var onClose: () -> Void = {}

    @State private var step: Step
    @State private var error: String?
    @State private var busy = false

    // Objectif.
    @State private var sex = "female"
    @State private var height = ""
    @State private var weight = ""
    @State private var birth = ""
    @State private var bodyFat = ""
    @State private var activity = "moderate"
    @State private var goal = "lose"
    @State private var rate = 0.5
    @State private var target: EnergyTarget?
    @State private var manual: String?

    // Communauté.
    @State private var handle = ""
    @State private var displayName = ""

    // Séances.
    @State private var focus = "full"
    @State private var gyms: [Gym] = []
    @State private var gymId: Int?
    @State private var equipment = "any"
    @State private var perWeek = 3
    @State private var program: [WorkoutTemplate] = []

    init(model: AppModel, editGoal: Bool = false, onClose: @escaping () -> Void = {}) {
        self.model = model
        self.editGoal = editGoal
        self.onClose = onClose
        _step = State(initialValue: editGoal ? .measures : .welcome)
    }

    private var kicker: String {
        editGoal ? "Mon objectif" : "Étape 1 sur 3 · Objectif"
    }

    var body: some View {
        ZStack {
            Neutrals.screen.ignoresSafeArea()
            screen.id(step).transition(.opacity)
        }
        .animation(.easeInOut(duration: 0.2), value: step)
        .task { await loadSavedProfile() }
        .task(id: step) { await loadGyms() }
    }

    @ViewBuilder
    private var screen: some View {
        switch step {
        case .welcome:
            StepScaffold(step: nil, onBack: nil) {
                WelcomeStep()
            } footer: {
                PrimaryButton(text: "Commencer", colors: Domains.nutrition, trailingIcon: .arrowRight) { go(.measures) }
            }
        case .measures:
            StepScaffold(step: step, onBack: { if editGoal { onClose() } else { go(.welcome) } }) {
                measures
            } footer: {
                PrimaryButton(text: "Continuer", colors: Domains.nutrition) { if checkMeasures() { go(.activity) } }
            }
        case .activity:
            StepScaffold(step: step, onBack: { go(.measures) }) {
                activityStep
            } footer: {
                PrimaryButton(text: "Calculer ma cible", colors: Domains.nutrition, busy: busy, action: computeTarget)
            }
        case .target:
            StepScaffold(step: step, onBack: { go(.activity) }) {
                targetStep
            } footer: {
                PrimaryButton(text: "Valider et continuer", colors: Domains.nutrition, busy: busy, action: confirmTarget)
                GhostButton(text: manual == nil ? "Saisir ma cible à la main" : "Garder la cible calculée") {
                    manual = manual == nil ? "" : nil
                    error = nil
                }
            }
        case .identity:
            StepScaffold(step: step, onBack: { go(.target) }) {
                identityStep
            } footer: {
                PrimaryButton(text: "Continuer", colors: Domains.community, busy: busy, action: confirmIdentity)
                GhostButton(text: "Plus tard") { go(.sessions) }
            }
        case .sessions:
            StepScaffold(step: step, onBack: { go(.identity) }) {
                sessionsStep
            } footer: {
                PrimaryButton(text: "Composer mon programme", colors: Domains.training, busy: busy, action: composeProgram)
            }
        case .program:
            StepScaffold(step: step, onBack: { go(.sessions) }) {
                programStep
            } footer: {
                PrimaryButton(text: "Terminer", colors: Domains.training, action: model.finishOnboarding)
                GhostButton(text: "Revoir mes réponses") { go(.sessions) }
            }
        }
    }

    // MARK: Étapes.

    @ViewBuilder
    private var measures: some View {
        StepTitle(kicker: kicker, colors: Domains.nutrition, title: "Tes mesures", subtitle: "Elles servent à estimer ta dépense du jour.")
        VStack(alignment: .leading, spacing: 16) {
            Labeled(label: "Sexe") {
                Choice(options: ["Homme", "Femme"], selected: sex == "male" ? 0 : 1, track: Domains.nutrition.soft) {
                    sex = $0 == 0 ? "male" : "female"
                }
            }
            HStack(alignment: .top, spacing: 12) {
                Labeled(label: "Taille (cm)") {
                    NutriField(text: $height, placeholder: "170", kind: .number).filtered($height, onlyDigits(3))
                }
                Labeled(label: "Poids (kg)") {
                    NutriField(text: $weight, placeholder: "70,0", kind: .decimal).filtered($weight, maxLength(5))
                }
            }
            Labeled(label: "Date de naissance") {
                NutriField(text: $birth, placeholder: "JJ/MM/AAAA", kind: .number).filtered($birth, formatBirth)
            }
            Labeled(label: "Masse grasse, si connue (%)") {
                NutriField(text: $bodyFat, placeholder: "Laisser vide", kind: .decimal, submitLabel: .done)
                    .filtered($bodyFat, maxLength(4))
            }
            Text("Ce poids devient ta première pesée, visible dans Moi › Corps.").textStyle(TextStyles.secondary)
        }
        ErrorText(error: error)
    }

    @ViewBuilder
    private var activityStep: some View {
        StepTitle(kicker: kicker, colors: Domains.nutrition, title: "Ton activité, ton but", subtitle: nil)
        Labeled(label: "Activité") {
            ActivityList(selected: activity) { activity = $0 }
        }
        Labeled(label: "Objectif") {
            Choice(options: goals.map(\.1), selected: goals.firstIndex { $0.0 == goal } ?? 0, track: Domains.nutrition.soft) {
                goal = goals[$0].0
                rate = switch goal {
                case "lose": 0.5
                case "gain": 0.25
                default: 0
                }
            }
        }
        if goal != "maintain" {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Rythme visé, par semaine").textStyle(nt(13, 500))
                    Spacer()
                    Text("\(formatDecimal(rate)) %").textStyle(nt(13, 600))
                }
                RateSlider(value: $rate, min: 0.1, max: goal == "lose" ? maxLossRate : maxGainRate)
                if let kg = number(weight) {
                    Text("Soit environ \(formatDecimal((kg * rate / 10).rounded() / 10)) kg par semaine.")
                        .textStyle(TextStyles.secondary)
                }
            }
        }
        ErrorText(error: error)
    }

    @ViewBuilder
    private var targetStep: some View {
        StepTitle(kicker: kicker, colors: Domains.nutrition, title: "Ta cible quotidienne", subtitle: nil)
        if let target { TargetCard(target: target, goal: goal) }
        if manual != nil {
            Labeled(label: "Ma cible (kcal par jour)") {
                NutriField(text: manualText, placeholder: "2000", kind: .number, submitLabel: .done)
                    .filtered(manualText, onlyDigits(4))
            }
        }
        Text("La cible s'ajuste les jours d'entraînement. Tu la retrouves sur la jauge d'Aujourd'hui.")
            .textStyle(TextStyles.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        ErrorText(error: error)
    }

    private var manualText: Binding<String> {
        Binding(get: { manual ?? "" }, set: { manual = $0 })
    }

    @ViewBuilder
    private var identityStep: some View {
        let community = Domains.community
        let normalized = normalizedHandle
        let typedName = displayName.trimmingCharacters(in: .whitespaces)
        let shownName = typedName.isEmpty ? (normalized.isEmpty ? "Toi" : normalized) : typedName
        StepTitle(
            kicker: "Étape 2 sur 3 · Communauté", colors: community, title: "Comment te trouver",
            subtitle: "Tes amis te suivent par ton identifiant et voient tes séances."
        )
        HStack(spacing: 12) {
            Avatar(
                initials: String(shownName.prefix(2)).uppercased(with: Locale(identifier: "fr_FR")),
                size: 44, background: community.soft, foreground: community.textOnLight, fontSize: 15
            )
            VStack(alignment: .leading, spacing: 0) {
                Text(shownName).textStyle(nt(15, 600))
                Text(normalized.isEmpty ? "@identifiant" : "@\(normalized)").textStyle(nt(13, 400, Neutrals.muted))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("Aperçu").textStyle(nt(11.5, 400, Neutrals.muted))
        }
        .padding(14)
        .card(border: Neutrals.fieldBorder)
        VStack(alignment: .leading, spacing: 16) {
            Labeled(label: "Identifiant", hint: "Unique, 3 à 20 caractères : lettres, chiffres et _. C'est par lui qu'on te trouve.") {
                NutriField(
                    text: $handle,
                    focusColor: community.textOnLight,
                    prefix: "@",
                    trailingIcon: isValidHandle(normalized) ? .check : nil
                )
                .filtered($handle, maxLength(21))
            }
            Labeled(label: "Nom affiché", hint: "Facultatif, et pas forcément unique. Ton adresse n'est jamais montrée.") {
                NutriField(text: $displayName, submitLabel: .done, focusColor: community.textOnLight)
                    .filtered($displayName, maxLength(40))
            }
        }
        ErrorText(error: error)
    }

    @ViewBuilder
    private var sessionsStep: some View {
        let training = Domains.training
        StepTitle(kicker: "Étape 3 sur 3 · Séances", colors: training, title: "Tes séances", subtitle: "Quatre réponses, et le programme se compose.")
        Labeled(label: "Ce que je veux travailler", hint: focuses.first { $0.0 == focus }?.2) {
            Choice(options: focuses.map(\.1), selected: focuses.firstIndex { $0.0 == focus } ?? 2, track: training.seg) {
                focus = focuses[$0].0
            }
        }
        Labeled(label: "Ma salle", hint: "Les exercices sont limités à ce que cette enseigne propose.") {
            GymPicker(gyms: gyms, selected: gymId) { gymId = $0 }
        }
        Labeled(label: "Poids libre ou machine") {
            Choice(options: equipments.map(\.1), selected: equipments.firstIndex { $0.0 == equipment } ?? 2, track: training.seg, textSize: 13.5) {
                equipment = equipments[$0].0
            }
        }
        Labeled(label: "Séances par semaine") {
            Choice(options: rhythms.map(String.init), selected: rhythms.firstIndex(of: perWeek) ?? 1, track: training.seg, textSize: 15, weight: 600) {
                perWeek = rhythms[$0]
            }
        }
        ErrorText(error: error)
    }

    @ViewBuilder
    private var programStep: some View {
        let training = Domains.training
        StepTitle(kicker: "Étape 3 sur 3 · Séances", colors: training, title: "Ton programme", subtitle: programSummary)
        VStack(alignment: .leading, spacing: 10) {
            if program.isEmpty {
                Text("Le programme est prêt, retrouve-le dans Sport.").textStyle(TextStyles.secondary)
            }
            ForEach(program) { template in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(template.name).textStyle(nt(15, 600))
                        Spacer()
                        Text("\(template.exercises.count) exercices").textStyle(TextStyles.small)
                    }
                    Text(template.exercises.map(\.exercise.name).joined(separator: " · "))
                        .textStyle(nt(13, 400, Neutrals.muted, line: 1.55))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .tinted(training.soft)
            }
        }
        Text("Tu pourras tout modifier depuis Sport.").textStyle(TextStyles.secondary)
    }

    private var programSummary: String {
        let focusLabel = focus == "full" ? "Haut et bas" : focuses.first { $0.0 == focus }?.1
        let gym = gyms.first { $0.id == gymId }?.name
        let gear = equipments.first { $0.0 == equipment }?.1.lowercased(with: Locale(identifier: "fr_FR"))
        return [focusLabel, gym, gear, "\(perWeek) par semaine"].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: Logique.

    private func go(_ next: Step) {
        error = nil
        step = next
    }

    /// En modification, les mesures partent du profil enregistré.
    private func loadSavedProfile() async {
        guard editGoal, let saved = await model.api.profile().value?.profile else { return }
        sex = saved.sex
        height = String(saved.heightCm)
        weight = String(saved.weightKg).replacingOccurrences(of: ".", with: ",")
        let parts = saved.birthDate.split(separator: "-")
        if parts.count == 3 { birth = "\(parts[2])/\(parts[1])/\(parts[0])" }
        bodyFat = saved.bodyFatPercent.map { String($0).replacingOccurrences(of: ".", with: ",") } ?? ""
        activity = saved.activity
        goal = saved.goal
        rate = saved.ratePercentPerWeek
    }

    private func loadGyms() async {
        guard step == .sessions, gyms.isEmpty, let response = await model.api.preferences().value else { return }
        gyms = response.gyms
        if gymId == nil { gymId = response.preferences.gymId ?? response.gyms.first?.id }
    }

    /// Fin de l'étape Objectif : la suite de l'onboarding, ou retour en modification.
    private func afterTarget() {
        if editGoal {
            model.bump()
            Task { await model.refreshToday() }
            model.toast("Objectif enregistré")
            onClose()
        } else {
            go(.identity)
        }
    }

    private func number(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces))
    }

    /// `JJ/MM/AAAA` en `AAAA-MM-JJ`, ou rien si la date n'existe pas.
    private func isoBirth() -> String? {
        let digits = birth.filter(\.isNumber).map { Int(String($0)) ?? 0 }
        guard digits.count == 8 else { return nil }
        let day = digits[0] * 10 + digits[1]
        let month = digits[2] * 10 + digits[3]
        let year = digits[4] * 1000 + digits[5] * 100 + digits[6] * 10 + digits[7]
        let iso = String(format: "%04d-%02d-%02d", year, month, day)
        // Un 31/02 se recalerait au 3 mars : on refuse ce qui ne revient pas à l'identique.
        guard let date = parseDay(iso) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let back = calendar.dateComponents([.year, .month, .day], from: date)
        return back.year == year && back.month == month && back.day == day ? iso : nil
    }

    private func checkMeasures() -> Bool {
        let h = Int(height)
        let w = number(weight)
        let fat = bodyFat.trimmingCharacters(in: .whitespaces).isEmpty ? nil : number(bodyFat)
        if h == nil || h! < 100 || h! > 250 {
            error = "Une taille en centimètres, entre 100 et 250."
        } else if w == nil || w! < 30 || w! > 300 {
            error = "Un poids en kilos, entre 30 et 300."
        } else if isoBirth() == nil {
            error = "La date de naissance, au format JJ/MM/AAAA."
        } else if !bodyFat.trimmingCharacters(in: .whitespaces).isEmpty, fat == nil || fat! < 3 || fat! > 60 {
            error = "La masse grasse, entre 3 et 60 %, ou rien."
        } else {
            error = nil
        }
        return error == nil
    }

    private func profile(manualKcal: Int?) -> BodyProfile {
        BodyProfile(
            sex: sex,
            birthDate: isoBirth() ?? "",
            heightCm: Int(height) ?? 0,
            weightKg: number(weight) ?? 0,
            bodyFatPercent: bodyFat.trimmingCharacters(in: .whitespaces).isEmpty ? nil : number(bodyFat),
            activity: activity,
            goal: goal,
            ratePercentPerWeek: goal == "maintain" ? 0 : rate,
            manualTargetKcal: manualKcal
        )
    }

    private func computeTarget() {
        guard checkMeasures() else {
            go(.measures)
            return
        }
        busy = true
        Task {
            switch await model.api.saveProfile(profile(manualKcal: nil)) {
            case .success(let saved):
                // Le poids saisi devient la première pesée, visible dans Moi.
                if !editGoal { _ = await model.api.weighIn(number(weight) ?? 0) }
                target = saved.target
                manual = nil
                go(.target)
            case .failure(let failure):
                error = "Ces mesures n'ont pas pu être enregistrées. \(failure.message)"
            }
            busy = false
        }
    }

    private func confirmTarget() {
        guard let typed = manual else {
            afterTarget()
            return
        }
        guard let kcal = Int(typed), kcal >= 1000, kcal <= manualTargetMax else {
            error = "Une cible entre 1 000 et 6 000 kcal."
            return
        }
        busy = true
        Task {
            switch await model.api.saveProfile(profile(manualKcal: kcal)) {
            case .success(let saved):
                target = saved.target
                afterTarget()
            case .failure:
                error = "La cible n'a pas pu être enregistrée."
            }
            busy = false
        }
    }

    private var normalizedHandle: String {
        handle.trimmingCharacters(in: .whitespaces).lowercased(with: Locale(identifier: "en_US_POSIX"))
    }

    private func isValidHandle(_ value: String) -> Bool {
        value.wholeMatch(of: /[a-z0-9_]{3,20}/) != nil
    }

    private func confirmIdentity() {
        let normalized = normalizedHandle
        guard isValidHandle(normalized) else {
            error = "Un identifiant de 3 à 20 caractères : lettres, chiffres et _."
            return
        }
        let name = displayName.trimmingCharacters(in: .whitespaces)
        busy = true
        Task {
            switch await model.api.saveIdentity(handle: normalized, displayName: name.isEmpty ? nil : name) {
            case .success:
                go(.sessions)
            case .failure(let failure):
                error = failure.status == 409 ? "Cet identifiant est déjà pris." : "L'identifiant n'a pas pu être enregistré."
            }
            busy = false
        }
    }

    private func composeProgram() {
        busy = true
        error = nil
        Task {
            let preferences = TrainingPreferences(gymId: gymId, focus: focus, equipment: equipment, sessionsPerWeek: perWeek)
            var result = await model.api.savePreferences(preferences)
            if case .success = result { result = await model.api.generateProgram() }
            switch result {
            case .failure:
                error = "Le programme n'a pas pu être composé."
            case .success:
                program = (await model.api.templates().value?.templates ?? []).filter { $0.kind == "program" }
                go(.program)
            }
            busy = false
        }
    }
}

/// L'écran d'une étape : chevron et barre de progression, contenu défilant, boutons en bas.
private struct StepScaffold<Content: View, Footer: View>: View {
    let step: Step?
    let onBack: (() -> Void)?
    @ViewBuilder let content: Content
    @ViewBuilder let footer: Footer

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let step, let onBack {
                        HStack(spacing: 12) {
                            LucideIcon(.chevronLeft, 22, Neutrals.ink)
                                .offset(x: -4)
                                .tap(onBack)
                                .accessibilityLabel("Retour")
                            StepProgress(step: step)
                        }
                        .padding(.top, 8)
                    }
                    content
                }
                .padding(.horizontal, Space.onboardingH)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            VStack(spacing: 10) {
                footer
            }
            .padding(.horizontal, Space.onboardingH)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
    }
}

/// Trois segments de 5, chacun à la couleur de son étape.
private struct StepProgress: View {
    let step: Step

    var body: some View {
        let colors = [Domains.nutrition.fill, Domains.community.fill, Domains.training.fill]
        HStack(spacing: 5) {
            ForEach(0 ..< 3, id: \.self) { index in
                ProgressTrack(fraction: step.fill[index], track: Neutrals.stepTrack, fill: colors[index], height: 5)
            }
        }
    }
}

private struct StepTitle: View {
    let kicker: String
    let colors: DomainColors
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(kicker).textStyle(nt(13, 600, colors.textOnLight))
            Text(title).textStyle(TextStyles.onboardingTitle)
            if let subtitle { Text(subtitle).textStyle(nt(14, 400, Neutrals.muted)) }
        }
    }
}

private struct ErrorText: View {
    let error: String?

    var body: some View {
        if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
    }
}

private struct WelcomeStep: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Compte créé").textStyle(nt(14, 600, Domains.nutrition.textOnLight))
                Text("Trois réglages, et l'app est à toi.").textStyle(nt(34, 600, line: 1.1, tracking: -0.035))
                Text("Deux minutes environ. Tout se modifie ensuite.").textStyle(nt(15, 400, Neutrals.muted))
            }
            VStack(spacing: 10) {
                WelcomeLine(number: 1, title: "Mon objectif", subtitle: "Mesures, activité, cible calorique", colors: Domains.nutrition, icon: .target)
                WelcomeLine(number: 2, title: "Mon profil Communauté", subtitle: "L'identifiant par lequel on te trouve", colors: Domains.community, icon: .users)
                WelcomeLine(number: 3, title: "Mes séances", subtitle: "Ta salle, ton matériel, ton rythme", colors: Domains.training, icon: .dumbbell)
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 4)
    }
}

private struct WelcomeLine: View {
    let number: Int
    let title: String
    let subtitle: String
    let colors: DomainColors
    let icon: Lucide

    var body: some View {
        HStack(spacing: 14) {
            Text("\(number)")
                .textStyle(nt(14, 600, colors.textOnFill, line: 1))
                .frame(width: 32, height: 32)
                .background(colors.fill, in: Circle())
            VStack(alignment: .leading, spacing: 0) {
                Text(title).textStyle(nt(15, 600))
                Text(subtitle).textStyle(TextStyles.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            LucideIcon(icon, 18, colors.textOnLight)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .tinted(colors.soft)
    }
}

/// Segmenté de l'onboarding : rayon 14, sélection crème de rayon 11.
private struct Choice: View {
    let options: [String]
    let selected: Int
    let track: Color
    var textSize: CGFloat = 14
    var weight: CGFloat = 500
    let onSelect: (Int) -> Void

    var body: some View {
        SegmentedPill(
            options: options,
            selected: selected,
            onSelect: onSelect,
            track: track,
            textStyle: nt(textSize, weight),
            outerRadius: Radius.field,
            innerRadius: 11,
            itemPadding: 10
        )
    }
}

private struct ActivityList: View {
    let selected: String
    let onSelect: (String) -> Void

    var body: some View {
        let nutrition = Domains.nutrition
        VStack(spacing: 0) {
            ForEach(Array(activities.enumerated()), id: \.offset) { index, item in
                let active = item.0 == selected
                HStack(spacing: 12) {
                    Circle()
                        .strokeBorder(active ? nutrition.textOnLight : Neutrals.radioBorder, lineWidth: active ? 5 : 1.5)
                        .frame(width: 18, height: 18)
                    Text(item.1).textStyle(nt(14, active ? 600 : 400))
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(active ? nutrition.soft : .clear)
                .tap {
                    Haptics.selection()
                    onSelect(item.0)
                }
                .accessibilityAddTraits(active ? .isSelected : [])
                if index < activities.count - 1 { Hairline() }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.tile))
        .card(radius: Radius.tile, border: Neutrals.fieldBorder)
    }
}

/// Curseur du rythme : piste de 5, pastille crème de 22. Pas de 0,05 %.
private struct RateSlider: View {
    @Binding var value: Double
    let min: Double
    let max: Double

    var body: some View {
        GeometryReader { geometry in
            let width = Swift.max(geometry.size.width, 1)
            let fraction = Swift.min(Swift.max((value - min) / (max - min), 0), 1)
            ZStack(alignment: .leading) {
                ProgressTrack(fraction: fraction, track: Neutrals.stepTrack, fill: Domains.nutrition.fill, height: 5)
                Circle()
                    .fill(Neutrals.card)
                    .frame(width: 22, height: 22)
                    .shadow(color: .black.opacity(0.2), radius: 1.5, y: 1)
                    .offset(x: width * fraction - 11)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onChanged { drag in
                    let raw = min + Swift.min(Swift.max(drag.location.x / width, 0), 1) * (max - min)
                    let stepped = ((raw / 0.05).rounded() * 0.05 * 100).rounded() / 100
                    if stepped != value { value = stepped }
                }
            )
        }
        .frame(height: 22)
        .accessibilityElement()
        .accessibilityLabel("Rythme visé")
        .accessibilityValue("\(formatDecimal(value)) % par semaine")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: value = Swift.min(((value + 0.05) * 100).rounded() / 100, max)
            case .decrement: value = Swift.max(((value - 0.05) * 100).rounded() / 100, min)
            @unknown default: break
            }
        }
    }
}

private struct GymPicker: View {
    let gyms: [Gym]
    let selected: Int?
    let onSelect: (Int) -> Void

    @State private var open = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(gyms.first { $0.id == selected }?.name ?? (gyms.isEmpty ? "Chargement…" : "Choisir"))
                    .textStyle(nt(16, 500))
                    .frame(maxWidth: .infinity, alignment: .leading)
                LucideIcon(.chevronDown, 18, Neutrals.muted)
            }
            .padding(.horizontal, 14)
            .frame(height: 50)
            .tap { open.toggle() }
            if open {
                ForEach(gyms) { gym in
                    Hairline()
                    HStack {
                        Text(gym.name).textStyle(nt(15, gym.id == selected ? 600 : 400)).frame(maxWidth: .infinity, alignment: .leading)
                        if gym.id == selected { LucideIcon(.check, 16, Domains.training.fill) }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .tap {
                        onSelect(gym.id)
                        open = false
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.field))
        .card(radius: Radius.field, border: Neutrals.fieldBorder)
    }
}

/// La cible calculée : anneau de 150 en trois parts, puis le détail du calcul.
private struct TargetCard: View {
    let target: EnergyTarget
    let goal: String

    var body: some View {
        let proteinKcal = target.proteinG * 4
        let carbsKcal = target.carbsG * 4
        let fatKcal = target.fatG * 9
        let sum = proteinKcal + carbsKcal + fatKcal
        let total = sum > 0 ? sum : 1
        VStack(spacing: 18) {
            Ring(
                size: 150, thickness: 14, track: Neutrals.track,
                parts: [
                    (proteinKcal / total, Macros.protein.fill),
                    (carbsKcal / total, Macros.carbs.fill),
                    (fatKcal / total, Macros.fat.fill),
                ]
            ) {
                VStack(spacing: 0) {
                    Text(formatInt(target.targetKcal)).textStyle(nt(34, 700, Domains.nutrition.textOnLight, line: 1, tracking: -0.035))
                    Text("kcal par jour").textStyle(TextStyles.small)
                }
            }
            HStack(spacing: 0) {
                macro(target.proteinG, "Protéines", Macros.protein.fill)
                macro(target.carbsG, "Glucides", Macros.carbs.fill)
                macro(target.fatG, "Lipides", Macros.fat.fill)
            }
            VStack(alignment: .leading, spacing: 6) {
                Hairline().padding(.bottom, 6)
                DetailRow(label: "Métabolisme de base", value: "\(formatInt(target.bmrKcal)) kcal")
                DetailRow(label: "Dépense estimée", value: "\(formatInt(target.maintenanceKcal)) kcal")
                DetailRow(label: adjustmentLabel, value: "\(formatSigned(target.adjustmentKcal, decimals: 0)) kcal")
                if target.floored {
                    Text("Le rythme visé descendrait sous le plancher : la cible a été relevée.").textStyle(TextStyles.small)
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity)
        .card(radius: 22, border: Neutrals.fieldBorder)
    }

    private var adjustmentLabel: String {
        switch goal {
        case "lose": "Déficit pour « Perdre »"
        case "gain": "Surplus pour « Prendre »"
        default: "Écart"
        }
    }

    private func macro(_ grams: Double, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 0) {
            Text("\(formatInt(grams)) g").textStyle(nt(17, 600))
            HStack(spacing: 4) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(label).textStyle(TextStyles.small)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).textStyle(nt(13, 400, Neutrals.muted))
            Spacer()
            Text(value).textStyle(nt(13, 500))
        }
    }
}

/// 14031994 → 14/03/1994, au fil de la frappe.
private func formatBirth(_ input: String) -> String {
    var text = ""
    for (index, character) in input.filter(\.isNumber).prefix(8).enumerated() {
        if index == 2 || index == 4 { text.append("/") }
        text.append(character)
    }
    return text
}

/// 0,5 ; 0,25 ; 1 : deux décimales au plus, sans zéro inutile.
private func formatDecimal(_ value: Double) -> String {
    var text = String(format: "%.2f", locale: Locale(identifier: "fr_FR"), value)
    while text.hasSuffix("0") { text.removeLast() }
    if text.hasSuffix(",") { text.removeLast() }
    return text
}
