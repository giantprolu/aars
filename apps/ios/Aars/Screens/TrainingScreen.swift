import SwiftUI

/// « Mardi 30 · 52 min ».
private func sessionDetail(_ session: SessionRow) -> String {
    let day = parseDay(session.sessionDate).map { date in
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let text = date.formatted(Date.VerbatimFormatStyle(
            format: "\(weekday: .wide) \(day: .defaultDigits)", locale: Locale(identifier: "fr_FR"), timeZone: .gmt, calendar: calendar
        ))
        return text.prefix(1).uppercased(with: Locale(identifier: "fr_FR")) + text.dropFirst()
    } ?? session.sessionDate
    let minutes = session.durationSeconds.map { "\(Int((Double($0) / 60).rounded())) min" }
    return [day, minutes].compactMap { $0 }.joined(separator: " · ")
}

/// Sport (C4) : la semaine en trois tuiles, la séance du jour, le programme, les dernières séances.
struct TrainingScreen: View {
    let model: AppModel
    let onMe: () -> Void
    let onStart: () -> Void

    @State private var home = Loaded<TrainingHome>()
    @State private var reload = 0

    var body: some View {
        let training = Domains.training
        ScreenColumn {
            DomainHeader(
                title: "Sport",
                subtitle: AttributedString(home.value.map { "Semaine \($0.isoWeek)" } ?? ""),
                initials: initialsOf(model.today?.identity),
                onAvatar: onMe,
                badge: DomainBadge(icon: .dumbbell, colors: training)
            )
            LoadedGate(loaded: home, onRetry: { reload += 1 }) { data in
                tiles(data)
                SessionCard(data: data, action: onStart)
                if !data.templates.isEmpty { program(data.templates) }
                history(data.history)
            }
        }
        .task(id: "\(model.revision)-\(reload)") { home.take(await model.api.trainingHome()) }
    }

    private func tiles(_ data: TrainingHome) -> some View {
        let training = Domains.training
        let tonnage = formatTonnage(data.weekVolumeKg)
        return HStack(spacing: 8) {
            tile("Séances", "\(data.weekSessions)", " / \(data.sessionsPerWeek)") {
                SegmentDots(done: data.weekSessions, total: data.sessionsPerWeek, on: training.fill, off: training.seg, height: 4).padding(.top, 2)
            }
            tile("Volume", tonnage.value, tonnage.unit) {
                if let change = data.volumeChange {
                    Text("\(change > 0 ? "+" : change < 0 ? "−" : "")\(abs(change)) %").textStyle(nt(11, 600, training.textOnLight))
                }
            }
            tile("Records", "\(data.records.count)", nil) {
                Text(data.records.first ?? "cette semaine").textStyle(nt(11, 400, Neutrals.muted)).lineLimit(1)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func tile(_ label: String, _ value: String, _ unit: String?, @ViewBuilder footer: () -> some View) -> some View {
        let training = Domains.training
        return VStack(alignment: .leading, spacing: 0) {
            Text(label).textStyle(nt(11.5, 600, training.textOnLight)).lineLimit(1)
            Text(unit.map { valueWithUnit(value, $0) } ?? AttributedString(value)).textStyle(nt(20, 600))
            footer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .tinted(training.soft, radius: Radius.tile)
    }

    private func program(_ templates: [TemplateRow]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Programme").textStyle(nt(13, 600)).padding(.horizontal, 4)
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(templates) { template in
                        VStack(alignment: .leading, spacing: 6) {
                            LucideIcon(.star, 14, template.favorite ? Domains.kitchen.textOnLight : Neutrals.starOff)
                            Text(template.name).textStyle(nt(14, 600)).lineLimit(2)
                            Text("\(template.exerciseCount) exercices").textStyle(TextStyles.small)
                        }
                        .padding(12)
                        .frame(width: 150, alignment: .topLeading)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .card(radius: Radius.tile)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func history(_ sessions: [SessionRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Dernières séances").textStyle(nt(13, 600)).padding(.top, 10).padding(.bottom, 4)
            if sessions.isEmpty {
                Text("Aucune séance terminée pour l'instant.").textStyle(TextStyles.secondary).padding(.bottom, 10)
            }
            ForEach(Array(sessions.enumerated()), id: \.element.id) { index, session in
                let tonnage = formatTonnage(session.volumeKg)
                HStack(spacing: 10) {
                    Circle().fill(Domains.training.fill).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(session.name).textStyle(TextStyles.bodyStrong).lineLimit(1)
                        Text(sessionDetail(session)).textStyle(TextStyles.small)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if session.record { Badge(text: "record", background: Neutrals.recordBg, foreground: Neutrals.recordText) }
                    Text(tonnage.value + tonnage.unit).textStyle(nt(14, 600))
                }
                .padding(.vertical, 9)
                if index < sessions.count - 1 { Hairline() }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

/// La séance en cours ou la suivante du programme, en grand.
private struct SessionCard: View {
    let data: TrainingHome
    let action: () -> Void

    var body: some View {
        let training = Domains.training
        let open = data.openSession
        let next = data.next
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(kicker).textStyle(nt(11.5, 500, .white.opacity(0.85)))
                    Text(open?.name ?? next?.name ?? "Séance libre").textStyle(nt(20, 600, .white, tracking: -0.02))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                LucideIcon(.play, 18, training.fill)
                    .frame(width: 44, height: 44)
                    .background(.white, in: Circle())
            }
            if open == nil, let next, !next.exercises.isEmpty {
                VStack(spacing: 6) {
                    ForEach(Array(next.exercises.enumerated()), id: \.offset) { _, exercise in
                        HStack {
                            Text(exercise.name).textStyle(nt(13, 400, .white)).lineLimit(1)
                            Spacer()
                            Text(exercise.target).textStyle(nt(13, 400, .white.opacity(0.8)))
                        }
                    }
                }
            }
        }
        .padding(16)
        .tinted(training.fill, radius: Radius.sessionCard)
        .tap(action)
    }

    private var kicker: String {
        if let open = data.openSession { return "Séance en cours · \(open.setCount) séries" }
        if let next = data.next { return "Séance du jour · \(next.exercises.count) exercices" }
        return "Pas de programme"
    }
}
