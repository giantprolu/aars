import SwiftUI

/// Les lavis des domaines, pour distinguer les avatars (`avatarTone`, lib/social.ts).
private let avatarTones = [Macros.protein.track, Domains.training.soft, Domains.kitchen.soft, Domains.body.soft, Domains.community.soft]

private func avatarTone(_ id: Int) -> Color {
    avatarTones[abs(id) % avatarTones.count]
}

private func labelOf(_ handle: String, _ displayName: String?) -> String {
    displayName ?? "@\(handle)"
}

private func plural(_ count: Int, _ word: String) -> String {
    "\(count) \(word)\(count > 1 ? "s" : "")"
}

/// « Hier, 18 h 40 », « Dimanche, 9 h 05 », à l'heure de Paris.
private func feedWhen(_ session: FeedSession) -> String {
    var paris = Calendar(identifier: .gregorian)
    paris.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
    let parts = paris.dateComponents([.year, .month, .day], from: Date())
    let today = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    let day: String
    if session.sessionDate == today {
        day = "Aujourd'hui"
    } else if session.sessionDate == addDays(today, -1) {
        day = "Hier"
    } else if let date = parseDay(session.sessionDate) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let name = date.formatted(Date.VerbatimFormatStyle(format: "\(weekday: .wide)", locale: Locale(identifier: "fr_FR"), timeZone: .gmt, calendar: calendar))
        day = name.prefix(1).uppercased(with: Locale(identifier: "fr_FR")) + name.dropFirst()
    } else {
        day = session.sessionDate
    }
    guard let started = parseInstant(session.startedAt) else { return day }
    let time = paris.dateComponents([.hour, .minute], from: started)
    return "\(day), \(time.hour ?? 0) h \(String(format: "%02d", time.minute ?? 0))"
}

/// Communauté (C5) : suivis, classement de la semaine, fil des séances partagées.
struct CommunityScreen: View {
    let model: AppModel
    let onMe: () -> Void
    let onPeople: () -> Void
    /// Signaler ou bloquer l'auteur d'une séance du fil.
    let onModerate: (ModerationTarget) -> Void

    @State private var home = Loaded<SocialHome>()
    @State private var feed = Loaded<FeedResponse>()
    @State private var reload = 0
    /// Bravos donnés ou retirés à l'instant, en attendant la relecture.
    @State private var kudos: [Int: Bool] = [:]

    var body: some View {
        let community = Domains.community
        ScreenColumn {
            DomainHeader(
                title: "Communauté",
                subtitle: subtitle,
                initials: initialsOf(model.today?.identity),
                onAvatar: onMe,
                badge: DomainBadge(icon: .users, colors: community)
            )
            LoadedGate(loaded: home, onRetry: { reload += 1 }) { data in
                if data.pendingRequests > 0 {
                    HStack {
                        Text("\(plural(data.pendingRequests, "demande")) à suivre").textStyle(nt(14, 600, community.textOnLight))
                        Spacer()
                        LucideIcon(.chevronRight, 16, community.textOnLight)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(community.soft, in: RoundedRectangle(cornerRadius: 16))
                    .tap(onPeople)
                }
                if data.identity.handle == nil {
                    IdentityCard(model: model)
                } else {
                    following(data.following)
                }
                if data.board.count > 1 { board(data.board) }
                feedCards
            }
        }
        .task(id: "\(model.revision)-\(reload)") {
            async let social = model.api.socialHome()
            async let sessions = model.api.feed()
            home.take(await social)
            feed.take(await sessions)
            kudos = [:]
        }
    }

    private var subtitle: AttributedString {
        guard let data = home.value else { return AttributedString("") }
        var text = AttributedString(plural(data.following.count, "suivi"))
        if data.pendingRequests > 0 {
            text += AttributedString(" · ")
            text += styled(plural(data.pendingRequests, "demande"), size: 12.5, weight: 600, color: Domains.community.textOnLight)
        }
        return text
    }

    private func following(_ people: [FollowedPerson]) -> some View {
        let community = Domains.community
        return ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 4) {
                    LucideIcon(.userPlus, 18, community.textOnLight)
                        .frame(width: 50, height: 50)
                        .dashedBorder(Domains.communityRing, radius: 25, width: 1.5)
                    Text("Inviter").textStyle(nt(11, 600, community.textOnLight))
                }
                .frame(width: 54)
                .tap(onPeople)
                ForEach(people) { person in
                    VStack(spacing: 4) {
                        Avatar(
                            initials: initialsOf(Identity(handle: person.handle, displayName: person.displayName)),
                            size: 46, background: avatarTone(person.id), foreground: Neutrals.ink, fontSize: 13
                        )
                        .padding(4)
                        .overlay {
                            if person.recent { Circle().strokeBorder(Domains.communityRing, lineWidth: 2) }
                        }
                        Text(firstWord(labelOf(person.handle, person.displayName)))
                            .textStyle(nt(11, 400, person.recent ? Neutrals.ink : Neutrals.muted))
                            .lineLimit(1)
                    }
                    .frame(width: 54)
                }
            }
            .padding(.horizontal, 4)
        }
        .scrollIndicators(.hidden)
    }

    private func firstWord(_ label: String) -> String {
        let trimmed = label.hasPrefix("@") ? String(label.dropFirst()) : label
        return String(trimmed.split(separator: " ").first ?? Substring(trimmed))
    }

    private func board(_ rows: [BoardRow]) -> some View {
        let community = Domains.community
        let best = max(rows.map(\.sessions).max() ?? 1, 1)
        return VStack(alignment: .leading, spacing: 10) {
            Text("Cette semaine").textStyle(nt(13, 600))
            VStack(spacing: 8) {
                ForEach(rows) { row in
                    let style = row.mine ? nt(13, 700, community.textOnLight) : nt(13)
                    HStack(spacing: 10) {
                        Text(row.mine ? "Toi" : firstWord(labelOf(row.handle, row.displayName)))
                            .textStyle(style)
                            .lineLimit(1)
                            .frame(width: 60, alignment: .leading)
                        ProgressTrack(fraction: Double(row.sessions) / Double(best), track: community.soft, fill: community.fill, height: 8)
                        Text("\(row.sessions)").textStyle(row.mine ? style : nt(13, 600)).frame(width: 40, alignment: .trailing)
                    }
                }
            }
            Text("Séances terminées depuis lundi, partagées par ceux que tu suis").textStyle(nt(11.5, 400, Neutrals.muted))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    @ViewBuilder
    private var feedCards: some View {
        let sessions = feed.value?.sessions ?? []
        if feed.value != nil && sessions.isEmpty {
            EmptyCard(title: "Le fil est vide", text: "Les séances partagées par toi et par ceux que tu suis apparaîtront ici.")
        }
        ForEach(sessions) { session in
            let given = kudos[session.id] ?? session.kudoedByMe
            let count = session.kudos + (given ? 1 : 0) - (session.kudoedByMe ? 1 : 0)
            FeedCard(
                session: session,
                given: given,
                count: count,
                onKudos: { toggleKudos(session, given: given) },
                onMore: session.mine ? nil : {
                    onModerate(ModerationTarget(session.author, sessionId: session.id, sessionName: session.name))
                }
            )
        }
    }

    private func toggleKudos(_ session: FeedSession, given: Bool) {
        guard !session.mine else { return }
        let next = !given
        kudos[session.id] = next
        Task {
            if case .failure = await model.api.kudos(sessionId: session.id, given: next) {
                kudos[session.id] = nil
                model.toast("Le bravo n'a pas pu être enregistré")
            }
        }
    }
}

private struct FeedCard: View {
    let session: FeedSession
    let given: Bool
    let count: Int
    let onKudos: () -> Void
    /// Absent sur mes propres séances.
    let onMore: (() -> Void)?

    var body: some View {
        let training = Domains.training
        let tonnage = formatTonnage(session.volumeKg)
        let figures: [(String, String)] = [
            session.exercises.isEmpty ? ("\(session.setCount)", "séries") : ("\(session.exercises.count)", "exercices"),
            (tonnage.value + tonnage.unit, "volume"),
            session.durationSeconds.map { ("\(Int((Double($0) / 60).rounded())) min", "durée") },
        ].compactMap { $0 }
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Avatar(
                    initials: initialsOf(Identity(handle: session.author.handle, displayName: session.author.displayName)),
                    size: 32, background: avatarTone(session.author.id), foreground: Neutrals.ink, fontSize: 11.5
                )
                VStack(alignment: .leading, spacing: 0) {
                    Text(AttributedString(session.mine ? "Toi · " : "\(labelOf(session.author.handle, session.author.displayName)) · ")
                        + styled(session.name, size: 14, weight: 600, color: training.textOnLight))
                        .textStyle(nt(14, 500))
                        .lineLimit(2)
                    Text(feedWhen(session)).textStyle(TextStyles.small)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let onMore {
                    MoreButton(action: onMore)
                }
            }
            HStack(spacing: 0) {
                ForEach(Array(figures.enumerated()), id: \.offset) { _, figure in
                    VStack(spacing: 0) {
                        Text(figure.0).textStyle(nt(15, 600))
                        Text(figure.1).textStyle(nt(11, 400, Neutrals.muted))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 8)
            .background(training.soft, in: RoundedRectangle(cornerRadius: 12))
            HStack {
                Spacer()
                let color = given ? Neutrals.heartActive : Domains.community.textOnLight
                HStack(spacing: 6) {
                    LucideIcon(.heart, 16, color)
                    Text("\(count)").textStyle(nt(13, 700, color))
                }
                .tap(enabled: !session.mine) {
                    Haptics.selection()
                    onKudos()
                }
                .accessibilityLabel(given ? "Retirer le bravo" : "Bravo")
            }
        }
        .padding(14)
        .card()
    }
}

/// Se présenter : l'identifiant et le nom affiché, comme l'étape 2 de l'onboarding.
private struct IdentityCard: View {
    let model: AppModel

    @State private var handle = ""
    @State private var name = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        let community = Domains.community
        VStack(alignment: .leading, spacing: 10) {
            Text("Présente-toi").textStyle(nt(15, 600))
            Text("Choisis un identifiant pour qu'on puisse te trouver et que tu puisses suivre d'autres personnes. "
                + "Tes séances restent privées tant que tu ne les partages pas.")
                .textStyle(TextStyles.secondary)
            NutriField(text: $handle, placeholder: "identifiant", focusColor: community.textOnLight, prefix: "@").filtered($handle, maxLength(21))
            NutriField(text: $name, placeholder: "Nom affiché, facultatif", focusColor: community.textOnLight).filtered($name, maxLength(40))
            if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
            PrimaryButton(text: "Continuer", colors: community, height: 48, busy: busy, textSize: 15, action: save)
        }
        .padding(16)
        .card()
    }

    private func save() {
        let normalized = handle.trimmingCharacters(in: .whitespaces).lowercased(with: Locale(identifier: "en_US_POSIX"))
        guard normalized.wholeMatch(of: /[a-z0-9_]{3,20}/) != nil else {
            error = "Un identifiant de 3 à 20 caractères : lettres, chiffres et _."
            return
        }
        let display = name.trimmingCharacters(in: .whitespaces)
        busy = true
        Task {
            switch await model.api.saveIdentity(handle: normalized, displayName: display.isEmpty ? nil : display) {
            case .success: model.bump()
            case .failure(let failure): error = failure.status == 409 ? "Cet identifiant est déjà pris." : failure.message
            }
            busy = false
        }
    }
}

/// Retour vers l'écran d'où l'on vient : chevron et libellé.
struct BackLink: View {
    let label: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            LucideIcon(.chevronLeft, 20, Neutrals.ink)
            Text(label).textStyle(nt(14, 500))
        }
        .offset(x: -6)
        .tap(action)
        .accessibilityLabel("Retour à \(label)")
    }
}

/**
 Les personnes : chercher par identifiant, suivre, répondre aux demandes, gérer
 ses abonnés. Les règles (demande, acceptation) sont celles du serveur.
 */
struct PeopleScreen: View {
    let model: AppModel
    let onBack: () -> Void
    /// Signaler ou bloquer quelqu'un de la liste.
    let onModerate: (ModerationTarget) -> Void

    @State private var home = Loaded<SocialHome>()
    @State private var query = ""
    @State private var results: [FoundPerson] = []
    @State private var busy = false
    @State private var reload = 0

    var body: some View {
        let community = Domains.community
        let typed = query.trimmingCharacters(in: .whitespaces)
        ScreenColumn(withTabBar: false) {
            BackLink(label: "Communauté", action: onBack)
            Text("Personnes").textStyle(TextStyles.screenTitle).padding(.horizontal, 4)
            NutriField(
                text: $query,
                placeholder: "Chercher un identifiant",
                focusColor: community.textOnLight,
                prefix: "@",
                height: 46,
                background: community.soft,
                border: nil,
                textSize: 14
            )
            .filtered($query, maxLength(30))
            if !results.isEmpty {
                PeopleCard(people: results.map { (PublicPerson(id: $0.id, handle: $0.handle, displayName: $0.displayName), $0.state) }, onMore: more) { person, state in
                    switch state {
                    case "following": RelationAction(label: "Ne plus suivre", primary: false) { act("unfollow", person, "Tu ne suis plus @\(person.handle)") }
                    case "requested": RelationAction(label: "Demandé", primary: false) { act("unfollow", person, "Demande annulée") }
                    default: RelationAction(label: "Suivre", primary: true) { act("follow", person, "Demande envoyée à @\(person.handle)") }
                    }
                }
            } else if typed.count >= 2 {
                Text("Personne sous cet identifiant.").textStyle(TextStyles.secondary).padding(.horizontal, 4)
            }
            LoadedGate(loaded: home, onRetry: { reload += 1 }) { data in
                if !data.requests.isEmpty {
                    SectionCaps(text: "Demandes")
                    PeopleCard(people: data.requests.map { ($0, "request") }, onMore: more) { person, _ in
                        HStack(spacing: 6) {
                            RelationAction(label: "Refuser", primary: false) { act("decline", person, "Demande refusée") }
                            RelationAction(label: "Accepter", primary: true) { act("accept", person, "@\(person.handle) te suit") }
                        }
                    }
                }
                if !data.requested.isEmpty {
                    SectionCaps(text: "En attente")
                    PeopleCard(people: data.requested.map { ($0, "requested") }, onMore: more) { person, _ in
                        RelationAction(label: "Annuler", primary: false) { act("unfollow", person, "Demande annulée") }
                    }
                }
                SectionCaps(text: "Tu suis")
                if data.following.isEmpty {
                    Text("Personne pour l'instant. Cherche tes amis par leur identifiant.").textStyle(TextStyles.secondary).padding(.horizontal, 4)
                } else {
                    PeopleCard(people: data.following.map { (PublicPerson(id: $0.id, handle: $0.handle, displayName: $0.displayName), "following") }, onMore: more) { person, _ in
                        RelationAction(label: "Ne plus suivre", primary: false) { act("unfollow", person, "Tu ne suis plus @\(person.handle)") }
                    }
                }
                SectionCaps(text: "Te suivent")
                if data.followers.isEmpty {
                    Text("Personne ne te suit encore.").textStyle(TextStyles.secondary).padding(.horizontal, 4)
                } else {
                    PeopleCard(people: data.followers.map { ($0, "follower") }, onMore: more) { person, _ in
                        RelationAction(label: "Retirer", primary: false) { act("remove", person, "@\(person.handle) ne te suit plus") }
                    }
                }
                if !data.blocked.isEmpty {
                    SectionCaps(text: "Bloqués")
                    PeopleCard(people: data.blocked.map { ($0, "blocked") }, onMore: nil) { person, _ in
                        RelationAction(label: "Débloquer", primary: false) { act("unblock", person, "@\(person.handle) débloqué") }
                    }
                    Text("Vous ne vous voyez plus. Débloquer ne rétablit pas les abonnements.")
                        .textStyle(TextStyles.small)
                        .padding(.horizontal, 4)
                }
            }
        }
        .background(Neutrals.screen.ignoresSafeArea())
        .task(id: "\(model.revision)-\(reload)") { home.take(await model.api.socialHome()) }
        .task(id: "\(typed)-\(model.revision)") { await search(typed) }
    }

    private func more(_ person: PublicPerson) {
        onModerate(ModerationTarget(person))
    }

    private func search(_ typed: String) async {
        guard typed.count >= 2 else {
            results = []
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        results = await model.api.people(query: typed).value?.people ?? []
    }

    private func act(_ action: String, _ person: PublicPerson, _ done: String) {
        guard !busy else { return }
        busy = true
        Task {
            switch await model.api.relation(action: action, userId: person.id) {
            case .success:
                model.toast(done)
                model.bump()
            case .failure(let failure):
                model.toast(failure.message)
            }
            busy = false
        }
    }
}

private struct PeopleCard<Trailing: View>: View {
    let people: [(PublicPerson, String)]
    /// Signaler ou bloquer ; absent dans la liste des bloqués.
    let onMore: ((PublicPerson) -> Void)?
    @ViewBuilder let trailing: (PublicPerson, String) -> Trailing

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(people.enumerated()), id: \.element.0.id) { index, entry in
                let person = entry.0
                if index > 0 { Hairline() }
                HStack(spacing: 10) {
                    Avatar(
                        initials: initialsOf(Identity(handle: person.handle, displayName: person.displayName)),
                        background: Domains.community.soft, foreground: Domains.community.textOnLight
                    )
                    VStack(alignment: .leading, spacing: 0) {
                        Text(person.displayName ?? "@\(person.handle)").textStyle(TextStyles.bodyStrong).lineLimit(1)
                        if person.displayName != nil { Text("@\(person.handle)").textStyle(TextStyles.small).lineLimit(1) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    trailing(person, entry.1)
                    if let onMore {
                        MoreButton { onMore(person) }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
        }
        .card()
    }
}

private struct RelationAction: View {
    let label: String
    let primary: Bool
    let action: () -> Void

    var body: some View {
        let community = Domains.community
        // L'action garde sa taille : c'est le nom, à côté, qui se tronque.
        Text(label)
            .textStyle(nt(12.5, 700, primary ? community.textOnFill : community.textOnLight))
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(primary ? community.fill : .clear, in: Capsule())
            .tap(action)
    }
}

/// « … » : signaler ou bloquer.
private struct MoreButton: View {
    let action: () -> Void

    var body: some View {
        LucideIcon(.ellipsis, 18, Neutrals.muted)
            .frame(width: 30, height: 30)
            .tap(action)
            .accessibilityLabel("Signaler ou bloquer")
    }
}
