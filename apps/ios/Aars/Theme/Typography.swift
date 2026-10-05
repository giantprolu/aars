import CoreText
import SwiftUI
import UIKit

/// Instrument Sans, police variable embarquée (OFL, `licenses/`). Une seule
/// instance déclarée ; la graisse se règle sur l'axe `wght`, de 400 à 700.
enum InstrumentSans {
    private static let postScriptName = "InstrumentSans-Regular"
    /// L'axe `wght`, en entier comme le veut Core Text.
    private static let weightAxis = 0x7767_6874

    /// La police à une taille et une graisse données, chiffres tabulaires.
    static func uiFont(size: CGFloat, weight: CGFloat) -> UIFont {
        let tabular: [[UIFontDescriptor.FeatureKey: Int]] = [[
            .type: kNumberSpacingType,
            .selector: kMonospacedNumbersSelector,
        ]]
        let descriptor = UIFontDescriptor(fontAttributes: [
            .name: postScriptName,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: weight],
            .featureSettings: tabular,
        ])
        return UIFont(descriptor: descriptor, size: size)
    }

    /// Même police, taille suivant la taille de texte choisie dans Réglages.
    static func scaled(size: CGFloat, weight: CGFloat) -> Font {
        Font(uiFont(size: UIFontMetrics.default.scaledValue(for: size), weight: weight) as CTFont)
    }
}

/**
 Un style de texte de la maquette, comme `nt()` sur Android. Taille en pt,
 interligne en multiple de la taille (1.45 comme le corps de page des
 maquettes), approche en em.
 */
struct NT: Sendable {
    var size: CGFloat
    var weight: CGFloat
    var color: Color
    var line: CGFloat
    var tracking: CGFloat

    func color(_ color: Color) -> NT {
        var copy = self
        copy.color = color
        return copy
    }

    func weight(_ weight: CGFloat) -> NT {
        var copy = self
        copy.weight = weight
        return copy
    }
}

func nt(_ size: CGFloat, _ weight: CGFloat = 400, _ color: Color = Neutrals.ink, line: CGFloat = 1.45, tracking: CGFloat = 0) -> NT {
    NT(size: size, weight: weight, color: color, line: line, tracking: tracking)
}

enum TextStyles {
    static let screenTitle = nt(24, 600, line: 1.2, tracking: -0.03)
    static let onboardingTitle = nt(28, 600, line: 1.15, tracking: -0.03)
    static let ringValue = nt(26, 700, Domains.nutrition.textOnLight, line: 1, tracking: -0.03)
    static let bigNumber = nt(52, 700, Domains.body.textOnLight, line: 1, tracking: -0.04)
    static let cardTitle = nt(15, 600)
    static let body = nt(14)
    static let bodyStrong = nt(14, 500)
    static let secondary = nt(12.5, 400, Neutrals.muted)
    static let small = nt(12, 400, Neutrals.muted)
    static let tileLabel = nt(11.5, 600)
    static let sectionCaps = nt(11.5, 700, tracking: 0.06)
    static let sheetTitle = nt(19, 600, tracking: -0.02)
    static let tab = nt(10.5, 500, Neutrals.tabInactive)
    static let tabActive = nt(10.5, 700)
}

/// Applique un style : police, couleur, approche, et un interligne à la CSS
/// (l'espace en trop se répartit dessus et dessous).
private struct NTModifier: ViewModifier {
    let style: NT
    @ScaledMetric private var size: CGFloat

    init(_ style: NT) {
        self.style = style
        _size = ScaledMetric(wrappedValue: style.size, relativeTo: .body)
    }

    func body(content: Content) -> some View {
        let font = InstrumentSans.uiFont(size: size, weight: style.weight)
        let extra = max(0, size * style.line - font.lineHeight)
        content
            .font(Font(font as CTFont))
            .foregroundStyle(style.color)
            .tracking(style.tracking * size)
            .lineSpacing(extra)
            .padding(.vertical, extra / 2)
    }
}

extension View {
    func textStyle(_ style: NT) -> some View {
        modifier(NTModifier(style))
    }

    func textStyle(_ style: NT, color: Color) -> some View {
        modifier(NTModifier(style.color(color)))
    }
}

/// Un morceau de texte enrichi, à coller dans un `Text(AttributedString)`.
func styled(_ text: String, size: CGFloat, weight: CGFloat, color: Color? = nil) -> AttributedString {
    var run = AttributedString(text)
    run.font = InstrumentSans.scaled(size: size, weight: weight)
    if let color { run.foregroundColor = color }
    return run
}

/// « 78,4 kg −0,6 » : un chiffre, son unité en petit, puis un complément.
func valueWithUnit(
    _ value: String,
    _ unit: String,
    unitSize: CGFloat = 12,
    extra: String? = nil,
    extraColor: Color = Neutrals.ink
) -> AttributedString {
    var text = AttributedString(value)
    text += styled(unit, size: unitSize, weight: 500, color: Neutrals.muted)
    if let extra {
        text += AttributedString(" ")
        text += styled(extra, size: unitSize, weight: 700, color: extraColor)
    }
    return text
}
