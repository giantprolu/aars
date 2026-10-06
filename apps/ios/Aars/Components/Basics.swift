import SwiftUI
import UIKit

/// Les icônes Lucide de la maquette (Assets.xcassets/Lucide), en SVG.
enum Lucide: String {
    case activity, ban, bell, camera, check, clock, database, download, dumbbell, ellipsis, flag, flame, footprints, heart, history, info, lock
    case link, minus, moon, pause, pencil, play, plus, scale, search, settings, sparkles, star, sun, target, timer, users, utensils, x, zap
    case arrowRight = "arrow-right"
    case calendarDays = "calendar-days"
    case chevronDown = "chevron-down"
    case chevronLeft = "chevron-left"
    case chevronRight = "chevron-right"
    case cookingPot = "cooking-pot"
    case keyRound = "key-round"
    case listPlus = "list-plus"
    case logOut = "log-out"
    case messageCircle = "message-circle"
    case scanBarcode = "scan-barcode"
    case shoppingCart = "shopping-cart"
    case skipForward = "skip-forward"
    case slidersHorizontal = "sliders-horizontal"
    case smartphone
    case sunMoon = "sun-moon"
    case trendingDown = "trending-down"
    case trendingUp = "trending-up"
    case userPlus = "user-plus"
}

/// Une icône Lucide, teinte au choix.
struct LucideIcon: View {
    let icon: Lucide
    let size: CGFloat
    let color: Color

    init(_ icon: Lucide, _ size: CGFloat, _ color: Color) {
        self.icon = icon
        self.size = size
        self.color = color
    }

    var body: some View {
        Image("Lucide/\(icon.rawValue)")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(color)
            .accessibilityHidden(true)
    }
}

/// Un toucher qui éclaircit l'élément sous le doigt, sans autre effet : la
/// même réponse visuelle que sur Android.
private struct PressDim: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

extension View {
    func tap(enabled: Bool = true, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { self }
            .buttonStyle(PressDim())
            .disabled(!enabled)
    }

    /// La carte de base : fond crème, filet, rayon 18.
    func card(radius: CGFloat = Radius.card, background: Color = Neutrals.card, border: Color = Neutrals.cardBorder) -> some View {
        self
            .background(background, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(border, lineWidth: 1))
    }

    func tinted(_ color: Color, radius: CGFloat = Radius.card) -> some View {
        background(color, in: RoundedRectangle(cornerRadius: radius))
    }
}

@MainActor
enum Haptics {
    /// Retour léger : segmentés, cases à cocher, ajout d'un récent.
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// Appui long sur le +.
    static func longPress() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
}

/// Filet horizontal d'un point.
struct Hairline: View {
    var color: Color = Neutrals.divider

    var body: some View {
        color.frame(height: 1)
    }
}

/// Titre de section en MAJUSCULES.
struct SectionCaps: View {
    let text: String

    var body: some View {
        Text(text.uppercased(with: Locale(identifier: "fr_FR")))
            .textStyle(TextStyles.sectionCaps)
            .padding(.horizontal, 4)
    }
}

/// Pastille ronde à initiales.
struct Avatar: View {
    let initials: String
    var size: CGFloat = 36
    var background: Color = Domains.body.soft
    var foreground: Color = Domains.body.textOnLight
    var fontSize: CGFloat = 12.5
    var action: (() -> Void)?

    var body: some View {
        let disc = Text(initials)
            .textStyle(nt(fontSize, 600, foreground, line: 1))
            .frame(width: size, height: size)
            .background(background, in: Circle())
        if let action {
            disc.tap(action).accessibilityLabel("Moi")
        } else {
            disc
        }
    }
}

/// La pastille carrée d'un domaine, à gauche du titre.
struct DomainBadge {
    let icon: Lucide
    let colors: DomainColors
}

/// En-tête des écrans principaux : titre de 24, sous-titre, avatar qui ouvre Moi.
struct DomainHeader: View {
    let title: String
    let subtitle: AttributedString
    let initials: String
    let onAvatar: () -> Void
    var badge: DomainBadge?

    var body: some View {
        HStack(spacing: 0) {
            if let badge {
                LucideIcon(badge.icon, 18, badge.colors.textOnFill)
                    .frame(width: 34, height: 34)
                    .background(badge.colors.fill, in: RoundedRectangle(cornerRadius: Radius.domainBadge))
                    .padding(.trailing, 10)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(title).textStyle(badge == nil ? TextStyles.screenTitle : nt(24, 600, line: 1.1, tracking: -0.03))
                Text(subtitle).textStyle(TextStyles.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Avatar(initials: initials, action: onAvatar)
        }
        .padding(.horizontal, 4)
    }
}

/// Lien coloré en gras, avec chevron facultatif.
struct LinkText: View {
    let text: String
    let color: Color
    var size: CGFloat = 12.5
    var chevron = false
    let action: () -> Void

    var body: some View {
        HStack(spacing: 2) {
            Text(text).textStyle(nt(size, 700, color))
            if chevron { LucideIcon(.chevronRight, 12, color) }
        }
        .tap(action)
    }
}

/// Sélecteur segmenté en pilule : onglets de Cuisine, repas, périodes,
/// apparence, choix de l'onboarding.
struct SegmentedPill: View {
    let options: [String]
    let selected: Int
    let onSelect: (Int) -> Void
    var track: Color = Neutrals.chip
    var selectedBackground: Color = Neutrals.card
    var textColor: Color = Neutrals.muted
    var selectedTextColor: Color = Neutrals.ink
    var textStyle: NT = nt(13.5, 600)
    var selectedWeight: CGFloat?
    var outerRadius: CGFloat?
    var innerRadius: CGFloat?
    var padding: CGFloat = 3
    var itemPadding: CGFloat = 7
    var itemHorizontalPadding: CGFloat = 0
    var fill = true
    var badges: [Int: String] = [:]
    var badgeColors: DomainColors = Domains.kitchen

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, label in
                item(index: index, label: label)
            }
        }
        .padding(padding)
        .background(track, in: RoundedRectangle(cornerRadius: outerRadius ?? 999))
    }

    private func item(index: Int, label: String) -> some View {
        let isSelected = index == selected
        let style = isSelected ? textStyle.weight(selectedWeight ?? textStyle.weight) : textStyle
        return HStack(spacing: 6) {
            Text(label)
                .textStyle(style, color: isSelected ? selectedTextColor : textColor)
                .lineLimit(1)
                // Sans remplissage, chaque option garde son libellé entier.
                .fixedSize(horizontal: !fill, vertical: false)
            if let badge = badges[index] {
                Text(badge)
                    .textStyle(nt(11, 600, badgeColors.textOnFill))
                    .padding(.horizontal, 6)
                    .background(badgeColors.fill, in: Capsule())
            }
        }
        .padding(.vertical, itemPadding)
        .padding(.horizontal, itemHorizontalPadding)
        .frame(maxWidth: fill ? .infinity : nil)
        .background(isSelected ? selectedBackground : .clear, in: RoundedRectangle(cornerRadius: innerRadius ?? 999))
        .tap {
            if index != selected { Haptics.selection() }
            onSelect(index)
        }
    }
}

/// Bouton principal en pilule, à la couleur du domaine courant.
struct PrimaryButton: View {
    let text: String
    let colors: DomainColors
    var height: CGFloat = 54
    var enabled = true
    var busy = false
    var trailingIcon: Lucide?
    var textSize: CGFloat = 16
    var weight: CGFloat = 600
    let action: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(busy ? "Un instant…" : text).textStyle(nt(textSize, weight, colors.textOnFill))
            if let trailingIcon, !busy { LucideIcon(trailingIcon, 18, colors.textOnFill) }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(colors.fill, in: Capsule())
        .opacity(enabled && !busy ? 1 : 0.6)
        .tap(enabled: enabled && !busy, action)
    }
}

/// Action secondaire en texte gris.
struct GhostButton: View {
    let text: String
    let action: () -> Void

    var body: some View {
        Text(text)
            .textStyle(nt(14, 500, Neutrals.muted))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(6)
            .tap(action)
    }
}

/// Petit bouton en pilule des tuiles : « Commencer », « Manger ».
struct PillButton: View {
    let text: String
    let background: Color
    let foreground: Color
    var icon: Lucide?
    var height: CGFloat = 32
    var enabled = true
    let action: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            if let icon { LucideIcon(icon, 12, foreground) }
            Text(text).textStyle(nt(12.5, 700, foreground))
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(background, in: Capsule())
        .tap(enabled: enabled, action)
    }
}

/// Badge en pilule : « record », « Actif », écarts de 1RM.
struct Badge: View {
    let text: String
    let background: Color
    let foreground: Color
    var size: CGFloat = 11.5

    var body: some View {
        Text(text)
            .textStyle(nt(size, 700, foreground))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(background, in: Capsule())
    }
}

/// Un bandeau d'erreur sobre, en haut d'un écran.
struct ErrorBanner: View {
    let message: String
    var onRetry: (() -> Void)?

    var body: some View {
        HStack {
            Text(message).textStyle(nt(13, 500)).frame(maxWidth: .infinity, alignment: .leading)
            if let onRetry { LinkText(text: "Réessayer", color: Domains.nutrition.textOnLight, action: onRetry) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .tinted(Neutrals.chip, radius: Radius.tile)
    }
}

/// Une ligne cochée de la carte d'arrivée.
struct CheckLine: View {
    let fill: Color
    let tint: Color
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            LucideIcon(.check, 12, tint)
                .frame(width: 20, height: 20)
                .background(fill, in: Circle())
            Text(text).textStyle(nt(13.5))
        }
    }
}

/// Interrupteur de la maquette : 38 × 22, vert Nutrition quand il est actif.
struct NutriSwitch: View {
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        ZStack(alignment: isOn ? .trailing : .leading) {
            Capsule().fill(isOn ? Domains.nutrition.fill : Neutrals.stepTrack)
            Circle().fill(Neutrals.card).frame(width: 16, height: 16).padding(3)
        }
        .frame(width: 38, height: 22)
        .animation(.easeOut(duration: 0.2), value: isOn)
        .tap {
            Haptics.selection()
            action()
        }
        .accessibilityElement()
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(isOn ? "activé" : "désactivé")
    }
}
