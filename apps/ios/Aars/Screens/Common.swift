import SwiftUI

/// Hauteur réservée en bas des onglets, sous laquelle passe la barre.
let tabBarClearance: CGFloat = Space.tabBarHeight + 16

/**
 Le gabarit d'un écran : défilement, marges de 16, blocs espacés de 12, et la
 place de la barre d'onglets en bas quand il y en a une.
 */
struct ScreenColumn<Content: View>: View {
    var withTabBar = true
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.block) {
                content
            }
            .padding(.horizontal, Space.screenH)
            .padding(.top, 8)
            .padding(.bottom, withTabBar ? tabBarClearance : 16)
        }
        .scrollIndicators(.hidden)
    }
}

/// Carte d'état vide, sobre.
struct EmptyCard: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).textStyle(nt(15, 600))
            Text(text).textStyle(TextStyles.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .card()
    }
}

/// Squelettes aux dimensions des cartes, couleur piste.
struct Skeletons: View {
    let heights: [CGFloat]

    var body: some View {
        ForEach(Array(heights.enumerated()), id: \.offset) { _, height in
            Neutrals.track
                .frame(height: height)
                .clipShape(RoundedRectangle(cornerRadius: Radius.card))
        }
    }
}

/// « CL » pour Camille L., « CA » pour @camille_s.
func initialsOf(_ identity: Identity?) -> String {
    let display = identity?.displayName.flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
    guard let source = display ?? identity?.handle else { return "·" }
    let words = source.split(whereSeparator: { " _-.".contains($0) })
    let initials = words.count >= 2 ? "\(words[0].prefix(1))\(words[1].prefix(1))" : String(source.prefix(2))
    return initials.uppercased(with: Locale(identifier: "fr_FR"))
}

// MARK: Dates du serveur (`AAAA-MM-JJ`), lues sans fuseau.

private let french = Locale(identifier: "fr_FR")

private let isoCalendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    calendar.locale = french
    return calendar
}()

func parseDay(_ iso: String) -> Date? {
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return isoCalendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

/// « Mardi 30 septembre ».
func formatLongDate(_ iso: String) -> String {
    guard let date = parseDay(iso) else { return iso }
    let style = Date.VerbatimFormatStyle(
        format: "\(weekday: .wide) \(day: .defaultDigits) \(month: .wide)",
        locale: french,
        timeZone: .gmt,
        calendar: isoCalendar
    )
    let text = date.formatted(style)
    return text.prefix(1).uppercased(with: french) + text.dropFirst()
}

/// « L 29 » sous les barres de la semaine.
func formatDayInitial(_ iso: String) -> String {
    guard let date = parseDay(iso) else { return iso }
    // `weekday` vaut 1 le dimanche ; la semaine française commence le lundi.
    let index = (isoCalendar.component(.weekday, from: date) + 5) % 7
    let initial = Array("LMMJVSD")[index]
    return "\(initial) \(isoCalendar.component(.day, from: date))"
}

/// Le jour `AAAA-MM-JJ` d'une date, lu sans fuseau.
func isoDay(_ date: Date) -> String {
    let parts = isoCalendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

/// Aujourd'hui au calendrier du téléphone, en `AAAA-MM-JJ`.
func localToday() -> String {
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: Date())
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

/// Le jour décalé de `days` (négatif pour reculer).
func addDays(_ iso: String, _ days: Int) -> String {
    guard let date = parseDay(iso), let moved = isoCalendar.date(byAdding: .day, value: days, to: date) else { return iso }
    return isoDay(moved)
}

/// Le lundi de la semaine du jour.
func mondayOf(_ iso: String) -> String {
    guard let date = parseDay(iso) else { return iso }
    return addDays(iso, -((isoCalendar.component(.weekday, from: date) + 5) % 7))
}

/// « 29 sept. ».
func shortDate(_ iso: String) -> String {
    guard let date = parseDay(iso) else { return iso }
    return date.formatted(Date.VerbatimFormatStyle(
        format: "\(day: .defaultDigits) \(month: .abbreviated)", locale: french, timeZone: .gmt, calendar: isoCalendar
    ))
}

/// « Lun 29 ».
func dayLabel(_ iso: String) -> String {
    guard let date = parseDay(iso) else { return iso }
    let text = date.formatted(Date.VerbatimFormatStyle(
        format: "\(weekday: .abbreviated) \(day: .defaultDigits)", locale: french, timeZone: .gmt, calendar: isoCalendar
    )).replacingOccurrences(of: ".", with: "")
    return text.prefix(1).uppercased(with: french) + text.dropFirst()
}

// MARK: Lectures d'écran.

/// Une lecture d'écran : la dernière valeur reçue et l'erreur éventuelle. La
/// valeur précédente reste affichée pendant une relecture.
struct Loaded<T> {
    var value: T?
    var error: String?

    mutating func take(_ result: ApiResult<T>) {
        switch result {
        case .success(let fresh):
            value = fresh
            error = nil
        case .failure(let failure):
            error = failure.message
        }
    }
}

/// Erreur en bandeau, ou squelettes tant que rien n'est arrivé, puis le contenu.
struct LoadedGate<T, Content: View>: View {
    let loaded: Loaded<T>
    var skeletons: [CGFloat] = [80, 160, 120]
    var onRetry: (() -> Void)?
    @ViewBuilder let content: (T) -> Content

    var body: some View {
        if let error = loaded.error {
            ErrorBanner(message: error, onRetry: onRetry)
        }
        if let value = loaded.value {
            content(value)
        } else {
            Skeletons(heights: skeletons)
        }
    }
}
