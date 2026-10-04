import SwiftUI

/*
 * Tokens de la refonte B v4, palette 2 (Annexe/mobile), mêmes valeurs que
 * l'app Android (ui/theme/Tokens.kt).
 *
 * Un domaine, une couleur, partout : Nutrition en vert, Cuisine en orange,
 * Sport en bleu nuit, Corps en violet, Communauté en cyan.
 */

extension Color {
    /// Une couleur écrite comme sur Android, `0xAARRGGBB`.
    init(argb: UInt32) {
        self.init(
            .sRGB,
            red: Double((argb >> 16) & 0xFF) / 255,
            green: Double((argb >> 8) & 0xFF) / 255,
            blue: Double(argb & 0xFF) / 255,
            opacity: Double((argb >> 24) & 0xFF) / 255
        )
    }
}

struct DomainColors: Sendable {
    /// Couleur pleine : boutons, anneaux, tuiles pleines.
    let fill: Color
    /// Fond de tuile ou de carte teintée.
    let soft: Color
    /// Piste de barre, fond de segmenté.
    let seg: Color
    /// Barres secondaires, graphiques.
    let light: Color
    /// Texte et icônes sur fond clair. Jamais `fill` sur clair pour Nutrition, Cuisine, Communauté.
    let textOnLight: Color
    /// Texte et icônes posés sur `fill`.
    let textOnFill: Color
}

enum Domains {
    static let nutrition = DomainColors(
        fill: Color(argb: 0xFF36B37E), soft: Color(argb: 0xFFDDF3E9), seg: Color(argb: 0xFFBDE7D3),
        light: Color(argb: 0xFF86D2AF), textOnLight: Color(argb: 0xFF1F7A52), textOnFill: Color(argb: 0xFF0B3B26)
    )
    static let kitchen = DomainColors(
        fill: Color(argb: 0xFFF7A007), soft: Color(argb: 0xFFFDEBCC), seg: Color(argb: 0xFFFBD89A),
        light: Color(argb: 0xFFF9C25E), textOnLight: Color(argb: 0xFF945B00), textOnFill: Color(argb: 0xFF3A2600)
    )
    static let training = DomainColors(
        fill: Color(argb: 0xFF262E57), soft: Color(argb: 0xFFDDE0EE), seg: Color(argb: 0xFFC2C7E0),
        light: Color(argb: 0xFF8E96C0), textOnLight: Color(argb: 0xFF262E57), textOnFill: Color(argb: 0xFFFFFFFF)
    )
    static let body = DomainColors(
        fill: Color(argb: 0xFF7C5CFC), soft: Color(argb: 0xFFEAE5FF), seg: Color(argb: 0xFFD6CCFE),
        light: Color(argb: 0xFFB3A2FD), textOnLight: Color(argb: 0xFF5A3BD6), textOnFill: Color(argb: 0xFFFFFFFF)
    )
    static let community = DomainColors(
        fill: Color(argb: 0xFFA5E9E8), soft: Color(argb: 0xFFE3F8F7), seg: Color(argb: 0xFFC8F1F0),
        light: Color(argb: 0xFFA5E9E8), textOnLight: Color(argb: 0xFF1C6968), textOnFill: Color(argb: 0xFF0E4D4C)
    )

    /// Contours, anneaux d'avatar, pointillés Communauté.
    static let communityRing = Color(argb: 0xFF4FBFBE)
}

struct MacroColors: Sendable {
    let fill: Color
    let track: Color
    let text: Color
}

enum Macros {
    static let protein = MacroColors(fill: Color(argb: 0xFFC32B42), track: Color(argb: 0xFFF8DDE1), text: Color(argb: 0xFF9E2236))
    static let carbs = MacroColors(fill: Color(argb: 0xFFF7A007), track: Color(argb: 0xFFFDEBCC), text: Color(argb: 0xFF945B00))
    static let fat = MacroColors(fill: Color(argb: 0xFF4FBFBE), track: Color(argb: 0xFFE3F8F7), text: Color(argb: 0xFF1C6968))
}

enum Neutrals {
    /// Texte seulement, jamais un fond plein.
    static let ink = Color(argb: 0xFF231F1A)
    static let muted = Color(argb: 0xFF736B62)
    static let faint = Color(argb: 0xFFA39A8F)
    static let tabInactive = Color(argb: 0xFF8A8279)
    static let screen = Color(argb: 0xFFF4F1EB)
    static let card = Color(argb: 0xFFFFFDF9)
    static let cardBorder = Color(argb: 0xFFE9E3D9)
    static let fieldBorder = Color(argb: 0xFFE6E0D6)
    static let divider = Color(argb: 0xFFEEE8DE)
    static let track = Color(argb: 0xFFEBE5DA)
    static let emptyBar = Color(argb: 0xFFE6E0D6)
    static let chip = Color(argb: 0xFFF1ECE4)
    static let periodTrack = Color(argb: 0xFFE8E2D8)
    static let sheetHandle = Color(argb: 0xFFE0D9CE)
    static let stepTrack = Color(argb: 0xFFE0D9CE)
    static let radioBorder = Color(argb: 0xFFB8AE9F)
    static let starOff = Color(argb: 0xFFD8D0C3)
    static let tabBarBorder = Color(argb: 0xFFE6E0D6)
    static let scrim = Color(argb: 0x801C1814)
    static let workoutDark = Color(argb: 0xFF1C1915)
    static let scanner = Color(argb: 0xFF15120F)
    static let recordBg = Color(argb: 0xFFFDEBCC)
    static let recordText = Color(argb: 0xFF945B00)
    static let heartActive = Color(argb: 0xFF9E2236)
}

enum Radius {
    static let sheet: CGFloat = 28
    static let sessionCard: CGFloat = 20
    static let card: CGFloat = 18
    static let tile: CGFloat = 16
    static let field: CGFloat = 14
    static let domainBadge: CGFloat = 11
    static let small: CGFloat = 10
}

enum Space {
    static let screenH: CGFloat = 16
    static let onboardingH: CGFloat = 22
    static let block: CGFloat = 12
    static let tabBarHeight: CGFloat = 58
}

enum Motion {
    /// Rebond des bulles du bouton +, toasts.
    static func spring(_ seconds: Double) -> Animation {
        .timingCurve(0.34, 1.56, 0.64, 1, duration: seconds)
    }

    /// Entrée des feuilles.
    static func sheet(_ seconds: Double) -> Animation {
        .timingCurve(0.2, 0.9, 0.3, 1, duration: seconds)
    }

    static let bubbles = 0.38
    static let bubbleStagger = 0.04
    static let sheetIn = 0.35
    static let scrim = 0.25
    static let fabRotate = 0.3
    static let longPress = 0.5
    static let toastHold: Duration = .milliseconds(2200)

    /// Positions des bulles par rapport au centre du +.
    static let seanceOffset = CGSize(width: -92, height: -78)
    static let repasOffset = CGSize(width: 0, height: -128)
    static let peseeOffset = CGSize(width: 92, height: -78)
    static let bubbleSize: CGFloat = 54
    static let bubbleSizeMain: CGFloat = 66
    static let fabSize: CGFloat = 50
}
