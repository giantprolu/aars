import SwiftUI
import UniformTypeIdentifiers

private let page = 30

/// « Octobre 2026 ».
private func monthTitle(_ iso: String) -> String {
    guard let date = parseDay(iso) else { return iso }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    let text = date.formatted(Date.VerbatimFormatStyle(
        format: "\(month: .wide) \(year: .defaultDigits)", locale: Locale(identifier: "fr_FR"), timeZone: .gmt, calendar: calendar
    ))
    return text.prefix(1).uppercased(with: Locale(identifier: "fr_FR")) + text.dropFirst()
}

/// Historique : moyenne, jours notés, trente jours en barres avec la cible, puis la liste des jours.
struct HistoryScreen: View {
    let model: AppModel
    let onBack: () -> Void
    let onDay: (String) -> Void

    @State private var days: [DayTotals] = []
    @State private var loaded = false
    @State private var more = false
    @State private var error: String?

    var body: some View {
        ScreenColumn(withTabBar: false) {
            BackLink(label: "Aujourd'hui", action: onBack)
            VStack(alignment: .leading, spacing: 0) {
                Text("Historique").textStyle(TextStyles.screenTitle)
                if let first = days.first { Text(monthTitle(first.entryDate)).textStyle(TextStyles.secondary) }
            }
            .padding(.horizontal, 4)
            if let error {
                ErrorBanner(message: error) { Task { await load(offset: 0) } }
            }
            if loaded {
                if days.isEmpty {
                    EmptyCard(title: "Rien d'enregistré", text: "Les jours notés apparaîtront ici.")
                } else {
                    summary
                    Text("Par jour").textStyle(nt(12.5, 400, Neutrals.muted)).padding(.horizontal, 4)
                    list
                    if more {
                        Text("Voir plus")
                            .textStyle(nt(14, 600, Domains.nutrition.textOnLight))
                            .frame(maxWidth: .infinity)
                            .padding(10)
                            .tap { Task { await load(offset: days.count) } }
                    }
                }
            }
        }
        .task(id: model.revision) { await load(offset: 0) }
    }

    private func load(offset: Int) async {
        switch await model.api.history(offset: offset, limit: page) {
        case .success(let response):
            days = offset == 0 ? response.days : days + response.days
            more = response.days.count == page
            error = nil
        case .failure(let failure):
            error = failure.message
        }
        loaded = true
    }

    private var summary: some View {
        let nutrition = Domains.nutrition
        let target = model.today?.target?.targetKcal
        let recent = Array(days.prefix(page))
        let noted = recent.filter { $0.entryCount > 0 }
        let average = noted.isEmpty ? 0 : noted.reduce(0) { $0 + $1.macros.kcal } / Double(noted.count)
        // Trente jours, le plus ancien à gauche ; la cible en pointillé.
        let ordered = Array(recent.reversed())
        let top = max(max(target ?? 0, ordered.map(\.macros.kcal).max() ?? 0), 1)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Moyenne").textStyle(nt(11.5, 600, nutrition.textOnLight))
                    Text("\(formatInt(average)) kcal").textStyle(nt(22, 600, tracking: -0.02))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Jours notés").textStyle(nt(11.5, 600, nutrition.textOnLight))
                    Text("\(noted.count)").textStyle(nt(22, 600, tracking: -0.02))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            ZStack {
                Bars(
                    ratios: ordered.map { max($0.macros.kcal / top, 0.03) },
                    colors: ordered.indices.map { $0 == ordered.count - 1 ? nutrition.fill : nutrition.light },
                    gap: 3,
                    radius: 3
                )
                if let target {
                    GeometryReader { geometry in
                        let y = geometry.size.height * (1 - target / top)
                        Path { path in
                            path.move(to: CGPoint(x: 0, y: y))
                            path.addLine(to: CGPoint(x: geometry.size.width, y: y))
                        }
                        .stroke(Neutrals.muted, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    }
                }
            }
            .frame(height: 90)
            if let target {
                Text("Pointillé : ta cible, \(formatInt(target)) kcal").textStyle(nt(11.5, 400, Neutrals.muted))
            }
        }
        .padding(14)
        .card()
    }

    private var list: some View {
        VStack(spacing: 0) {
            ForEach(Array(days.enumerated()), id: \.element.entryDate) { index, day in
                if index > 0 { Hairline() }
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(formatLongDate(day.entryDate)).textStyle(TextStyles.bodyStrong)
                        Text("\(day.entryCount) entrée\(day.entryCount > 1 ? "s" : "")").textStyle(TextStyles.small)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    MacroSplit(protein: day.macros.proteinG, carbs: day.macros.carbsG, fat: day.macros.fatG)
                    Text(formatInt(day.macros.kcal)).textStyle(nt(14, 600)).frame(width: 58, alignment: .trailing)
                    LucideIcon(.chevronRight, 16, Neutrals.faint).padding(.leading, 6)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .tap { onDay(day.entryDate) }
            }
        }
        .card()
    }
}

/// Un jour passé : totaux, macros, repas. En lecture seule, les valeurs sont figées.
struct DayScreen: View {
    let model: AppModel
    let date: String
    let onBack: () -> Void

    @State private var day = Loaded<JournalDay>()
    @State private var reload = 0

    var body: some View {
        ScreenColumn(withTabBar: false) {
            BackLink(label: "Historique", action: onBack)
            Text(formatLongDate(date)).textStyle(TextStyles.screenTitle).padding(.horizontal, 4)
            LoadedGate(loaded: day, onRetry: { reload += 1 }) { data in
                if data.entries.isEmpty {
                    EmptyCard(title: "Aucune entrée", text: "Rien n'a été noté ce jour-là.")
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(formatInt(data.totals.macros.kcal)) kcal").textStyle(nt(24, 700, Domains.nutrition.textOnLight, tracking: -0.03))
                        MacroBar(label: "Protéines", value: data.totals.macros.proteinG, target: nil, colors: Macros.protein)
                        MacroBar(label: "Glucides", value: data.totals.macros.carbsG, target: nil, colors: Macros.carbs)
                        MacroBar(label: "Lipides", value: data.totals.macros.fatG, target: nil, colors: Macros.fat)
                    }
                    .padding(16)
                    .card()
                    MealJournal(entries: data.entries, onDelete: nil, onFavorite: nil)
                    Text("Journée clôturée. Les valeurs sont figées à l'écriture.")
                        .textStyle(nt(12.5, 400, Neutrals.muted))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .task(id: reload) { day.take(await model.api.journal(date: date)) }
    }
}

/// L'export, tel que le serveur le rend, prêt à enregistrer dans Fichiers.
struct ExportDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]
    let json: String

    init(json: String) {
        self.json = json
    }

    init(configuration: ReadConfiguration) throws {
        json = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(json.utf8))
    }
}

/**
 Compte et données : objectif, code de secours, export, politique de
 confidentialité, déconnexion, suppression du compte (exigée par l'App Store
 pour une app qui crée des comptes).
 */
struct AccountScreen: View {
    let model: AppModel
    let onBack: () -> Void
    let onEditGoal: () -> Void

    @State private var code: String?
    @State private var export: ExportDocument?
    @State private var deleting = false
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        let danger = Macros.protein.text
        ScreenColumn(withTabBar: false) {
            BackLink(label: "Moi", action: onBack)
            Text("Compte et données").textStyle(TextStyles.screenTitle).padding(.horizontal, 4)
            VStack(spacing: 0) {
                AccountRow(icon: .target, label: "Mon objectif", action: onEditGoal)
                Hairline()
                AccountRow(icon: .keyRound, label: "Nouveau code de secours", action: newCode)
                Hairline()
                AccountRow(icon: .download, label: "Exporter mes données", action: exportData)
                Hairline()
                AccountRow(icon: .lock, label: "Politique de confidentialité") {
                    if let url = URL(string: model.api.baseURL + "/legal/privacy") { openURL(url) }
                }
                Hairline()
                AccountRow(icon: .logOut, label: "Se déconnecter", action: model.signOut)
            }
            .card()
            if let code { recoveryCode(code) }
            SectionCaps(text: "Zone sensible")
            if deleting {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Supprimer mon compte").textStyle(nt(15, 600, danger))
                    Text("Tout est effacé : journal, pesées, profil, recettes, séances, abonnements. "
                        + "C'est définitif. Pense à exporter tes données avant.")
                        .textStyle(TextStyles.secondary)
                    NutriField(text: $password, placeholder: "Ton mot de passe", kind: .password, submitLabel: .done, focusColor: danger)
                    if let error { Text(error).textStyle(nt(13, 500, danger)) }
                    PrimaryButton(
                        text: "Supprimer définitivement",
                        colors: DomainColors(
                            fill: Macros.protein.fill, soft: Macros.protein.track, seg: Macros.protein.track,
                            light: Macros.protein.track, textOnLight: danger, textOnFill: .white
                        ),
                        height: 48,
                        enabled: !password.isEmpty,
                        busy: busy,
                        textSize: 15,
                        action: deleteAccount
                    )
                    Text("Annuler").textStyle(nt(14, 500, Neutrals.muted)).padding(6).tap {
                        deleting = false
                        password = ""
                    }
                }
                .padding(14)
                .card()
            } else {
                HStack(spacing: 12) {
                    LucideIcon(.x, 17, danger)
                    Text("Supprimer mon compte").textStyle(nt(14, 600, danger)).frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .card()
                .tap { deleting = true }
            }
        }
        .fileExporter(
            isPresented: Binding(get: { export != nil }, set: { if !$0 { export = nil } }),
            document: export,
            contentType: .json,
            defaultFilename: "aars-\(localToday()).json"
        ) { result in
            switch result {
            case .success: model.toast("Données exportées")
            case .failure: model.toast("L'export n'a pas pu être écrit")
            }
        }
    }

    private func recoveryCode(_ value: String) -> some View {
        let kitchen = Domains.kitchen
        return VStack(alignment: .leading, spacing: 8) {
            Text("Ton code de secours").textStyle(nt(13, 600, kitchen.textOnLight))
            Text(value).textStyle(nt(22, 700, tracking: 0.04)).textSelection(.enabled)
            Text("Note-le maintenant : il ne sera plus affiché. Il remplace l'ancien et sert une seule fois, "
                + "à retrouver ton compte si tu oublies ton mot de passe.")
                .textStyle(TextStyles.secondary)
            Text("Copier").textStyle(nt(13.5, 700, kitchen.textOnLight)).padding(.vertical, 4).tap {
                UIPasteboard.general.string = value
                model.toast("Code copié")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tinted(kitchen.soft, radius: Radius.tile)
    }

    private func newCode() {
        guard !busy else { return }
        busy = true
        Task {
            switch await model.api.recoveryCode() {
            case .success(let response): code = response.code
            case .failure(let failure): model.toast(failure.message)
            }
            busy = false
        }
    }

    private func exportData() {
        guard !busy else { return }
        busy = true
        Task {
            switch await model.api.exportData() {
            case .success(let json): export = ExportDocument(json: json)
            case .failure(let failure): model.toast(failure.message)
            }
            busy = false
        }
    }

    private func deleteAccount() {
        busy = true
        error = nil
        Task {
            // Réussie, la session est fermée : l'app repasse sur la connexion.
            if case .failure(let failure) = await model.api.deleteAccount(password: password) { error = failure.message }
            busy = false
        }
    }
}

private struct AccountRow: View {
    let icon: Lucide
    let label: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            LucideIcon(icon, 17, Neutrals.muted)
            Text(label).textStyle(TextStyles.bodyStrong).frame(maxWidth: .infinity, alignment: .leading)
            LucideIcon(.chevronRight, 16, Neutrals.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .tap(action)
    }
}
