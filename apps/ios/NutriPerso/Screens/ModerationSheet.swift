import SwiftUI

/// Ce qu'on signale ou bloque : une personne, et peut-être une de ses séances.
struct ModerationTarget: Equatable {
    let userId: Int
    let handle: String
    let displayName: String?
    var sessionId: Int?
    var sessionName: String?

    init(_ person: PublicPerson, sessionId: Int? = nil, sessionName: String? = nil) {
        userId = person.id
        handle = person.handle
        displayName = person.displayName
        self.sessionId = sessionId
        self.sessionName = sessionName
    }
}

/// Les motifs d'un signalement, comme `REPORT_REASONS` côté serveur.
private enum ReportReason: String, CaseIterable {
    case inappropriate, harassment, spam, other

    var label: String {
        switch self {
        case .inappropriate: "Contenu inapproprié"
        case .harassment: "Harcèlement"
        case .spam: "Spam ou faux compte"
        case .other: "Autre"
        }
    }
}

private enum ModerationStep {
    case menu, report, reported, block
}

/// Couleurs de l'action qui ne se rattrape pas : la rouge des protéines, en plein.
private let danger = DomainColors(
    fill: Macros.protein.fill, soft: Macros.protein.track, seg: Macros.protein.track,
    light: Macros.protein.track, textOnLight: Macros.protein.text, textOnFill: .white
)

/**
 Signaler ou bloquer (règle 1.2 de l'App Store). Ouverte depuis une séance du
 fil ou une personne de l'écran Personnes.

 Le signalement part à l'équipe qui modère ; le blocage coupe tout entre les
 deux comptes, sans que l'autre en soit averti. Les règles sont celles du
 serveur : l'écran ne fait que les demander.
 */
struct ModerationSheet: View {
    let target: ModerationTarget?
    let model: AppModel
    let onDismiss: () -> Void

    @State private var step = ModerationStep.menu
    @State private var reason: ReportReason?
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NutriSheet(visible: target != nil, title: title, onDismiss: onDismiss, gap: 12) {
            if let target {
                switch step {
                case .menu: menu(target)
                case .report: report(target)
                case .reported: reported(target)
                case .block: block(target)
                }
            }
        }
        .onChange(of: target) { _, _ in
            step = .menu
            reason = nil
            note = ""
            error = nil
        }
    }

    private var title: String {
        guard let target else { return "" }
        switch step {
        case .menu: return target.displayName ?? "@\(target.handle)"
        case .report: return target.sessionId == nil ? "Signaler @\(target.handle)" : "Signaler la séance"
        case .reported: return "Signalement envoyé"
        case .block: return "Bloquer @\(target.handle)"
        }
    }

    @ViewBuilder
    private func menu(_ target: ModerationTarget) -> some View {
        VStack(spacing: 0) {
            row(.flag, target.sessionId == nil ? "Signaler @\(target.handle)" : "Signaler cette séance", Neutrals.ink) {
                step = .report
            }
            Hairline()
            row(.ban, "Bloquer @\(target.handle)", Macros.protein.text) { step = .block }
        }
        .card()
    }

    @ViewBuilder
    private func report(_ target: ModerationTarget) -> some View {
        if let name = target.sessionName {
            Text("« \(name) », partagée par @\(target.handle).").textStyle(TextStyles.secondary).padding(.horizontal, 4)
        }
        VStack(spacing: 0) {
            ForEach(Array(ReportReason.allCases.enumerated()), id: \.element) { index, choice in
                let active = choice == reason
                HStack(spacing: 12) {
                    Circle()
                        .strokeBorder(active ? Domains.community.textOnLight : Neutrals.radioBorder, lineWidth: active ? 5 : 1.5)
                        .frame(width: 18, height: 18)
                    Text(choice.label).textStyle(nt(14, active ? 600 : 400)).frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(active ? Domains.community.soft : .clear)
                .tap {
                    Haptics.selection()
                    reason = choice
                }
                .accessibilityAddTraits(active ? .isSelected : [])
                if index < ReportReason.allCases.count - 1 { Hairline() }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.tile))
        .card(radius: Radius.tile, border: Neutrals.fieldBorder)
        NutriField(text: $note, placeholder: "Préciser, facultatif", submitLabel: .done, focusColor: Domains.community.textOnLight)
            .filtered($note, maxLength(500))
        if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
        PrimaryButton(text: "Envoyer le signalement", colors: Domains.community, height: 50, enabled: reason != nil, busy: busy, textSize: 15) {
            send(target)
        }
        GhostButton(text: "Retour") { step = .menu }
    }

    @ViewBuilder
    private func reported(_ target: ModerationTarget) -> some View {
        Text("Merci. L'équipe le regarde sous 24 heures, et retire ce qui enfreint les règles. "
            + "Tu peux aussi bloquer @\(target.handle) : vous ne vous verrez plus.")
            .textStyle(TextStyles.secondary)
            .padding(.horizontal, 4)
        PrimaryButton(text: "Bloquer @\(target.handle)", colors: danger, height: 50, textSize: 15) { step = .block }
        GhostButton(text: "Fermer", action: onDismiss)
    }

    @ViewBuilder
    private func block(_ target: ModerationTarget) -> some View {
        Text("Vous ne vous suivrez plus, et aucun de vous ne verra plus l'autre, ni dans la recherche ni dans le fil. "
            + "@\(target.handle) n'en est pas averti. Tu pourras le débloquer depuis Personnes.")
            .textStyle(TextStyles.secondary)
            .padding(.horizontal, 4)
        if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
        PrimaryButton(text: "Bloquer", colors: danger, height: 50, busy: busy, textSize: 15) { confirmBlock(target) }
        GhostButton(text: "Annuler") { step = .menu }
    }

    private func row(_ icon: Lucide, _ label: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        HStack(spacing: 12) {
            LucideIcon(icon, 17, color)
            Text(label).textStyle(nt(14, 500, color)).frame(maxWidth: .infinity, alignment: .leading)
            LucideIcon(.chevronRight, 16, Neutrals.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .tap(action)
    }

    private func send(_ target: ModerationTarget) {
        guard let reason, !busy else { return }
        busy = true
        error = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            let result = await model.api.report(
                userId: target.userId, sessionId: target.sessionId, reason: reason.rawValue, note: trimmed.isEmpty ? nil : trimmed
            )
            busy = false
            switch result {
            case .success: step = .reported
            case .failure(let failure): error = failure.message
            }
        }
    }

    private func confirmBlock(_ target: ModerationTarget) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            let result = await model.api.relation(action: "block", userId: target.userId)
            busy = false
            switch result {
            case .success:
                model.toast("@\(target.handle) bloqué")
                model.bump()
                onDismiss()
            case .failure(let failure):
                error = failure.message
            }
        }
    }
}
