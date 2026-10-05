import SwiftUI

/**
 Anneau plein façon `conic-gradient` : des parts posées bout à bout depuis
 midi, sur une piste. Épaisseur de 10 pour la jauge d'Aujourd'hui.
 */
struct Ring<Content: View>: View {
    let size: CGFloat
    let thickness: CGFloat
    let track: Color
    let parts: [(fraction: Double, color: Color)]
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Circle().inset(by: thickness / 2).stroke(track, lineWidth: thickness)
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                Circle()
                    .inset(by: thickness / 2)
                    .trim(from: segment.start, to: segment.end)
                    .stroke(segment.color, lineWidth: thickness)
                    .rotationEffect(.degrees(-90))
            }
            content
        }
        .frame(width: size, height: size)
    }

    private var segments: [(start: Double, end: Double, color: Color)] {
        var start = 0.0
        var result: [(start: Double, end: Double, color: Color)] = []
        for part in parts {
            let sweep = min(max(part.fraction, 0), 1)
            let end = min(start + sweep, 1)
            if end > start { result.append((start, end, part.color)) }
            start = end
        }
        return result
    }
}

/// Une macro : libellé coloré, `x / y g`, piste de 7.
struct MacroBar: View {
    let label: String
    let value: Double
    let target: Double?
    let colors: MacroColors

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Text(label).textStyle(nt(12.5, 500, colors.text))
                Spacer(minLength: 4)
                Text(amount).textStyle(nt(12.5))
            }
            ProgressTrack(
                fraction: target.map { $0 > 0 ? value / $0 : 0 } ?? 0,
                track: colors.track,
                fill: colors.fill,
                height: 7
            )
        }
    }

    private var amount: AttributedString {
        var text = styled(formatInt(value), size: 12.5, weight: 600)
        let rest = target.map { " / \(formatInt($0)) g" } ?? " g"
        text += styled(rest, size: 12.5, weight: 400, color: Neutrals.muted)
        return text
    }
}

/// Piste arrondie et sa part remplie.
struct ProgressTrack: View {
    let fraction: Double
    let track: Color
    let fill: Color
    let height: CGFloat

    var body: some View {
        GeometryReader { geometry in
            let filled = min(max(fraction, 0), 1)
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                if filled > 0 {
                    Capsule().fill(fill).frame(width: geometry.size.width * filled)
                }
            }
        }
        .frame(height: height)
    }
}

/// Barre de répartition des macros d'un repas, 64 × 7.
struct MacroSplit: View {
    let protein: Double
    let carbs: Double
    let fat: Double

    var body: some View {
        let parts = [(protein, Macros.protein.fill), (carbs, Macros.carbs.fill), (fat, Macros.fat.fill)].filter { $0.0 > 0 }
        let total = parts.reduce(0) { $0 + $1.0 }
        let gaps = CGFloat(max(parts.count - 1, 0))
        HStack(spacing: 1) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                part.1.frame(width: (64 - gaps) * part.0 / total)
            }
        }
        .frame(width: 64, height: 7, alignment: .leading)
        .background(Neutrals.track)
        .clipShape(Capsule())
    }
}

/// Segments de progression : « 2 séances sur 3 ».
struct SegmentDots: View {
    let done: Int
    let total: Int
    let on: Color
    let off: Color
    let height: CGFloat

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0 ..< max(total, 1), id: \.self) { index in
                Capsule().fill(index < done ? on : off).frame(height: height)
            }
        }
    }
}

/// Courbe simple, sans axes : la tuile Poids.
struct Sparkline: View {
    let values: [Double?]
    let color: Color
    var strokeWidth: CGFloat = 2.5

    var body: some View {
        Canvas { context, size in
            let known = values.compactMap { $0 }
            guard known.count >= 2, let low = known.min(), let high = known.max() else { return }
            let span = high > low ? high - low : 1
            let usable = size.height - strokeWidth
            let step = size.width / CGFloat(max(values.count - 1, 1))
            var path = Path()
            var started = false
            for (index, value) in values.enumerated() {
                guard let value else { continue }
                let point = CGPoint(x: CGFloat(index) * step, y: strokeWidth / 2 + CGFloat((high - value) / span) * usable)
                if started { path.addLine(to: point) } else { path.move(to: point) }
                started = true
            }
            context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round, lineJoin: .round))
        }
    }
}

/// Barres verticales arrondies en bas d'une zone, hauteurs de 0 à 1.
struct Bars: View {
    let ratios: [Double]
    let colors: [Color]
    var gap: CGFloat = 5
    var radius: CGFloat = 4

    var body: some View {
        GeometryReader { geometry in
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(ratios.enumerated()), id: \.offset) { index, ratio in
                    RoundedRectangle(cornerRadius: radius)
                        .fill(index < colors.count ? colors[index] : colors.last ?? Neutrals.emptyBar)
                        .frame(height: geometry.size.height * min(max(ratio, 0), 1))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
        }
    }
}

// MARK: Nombres à la française.

private let french = Locale(identifier: "fr_FR")

/// 1 420, avec une espace insécable comme séparateur de milliers.
func formatInt(_ value: Double) -> String {
    // Arrondi de `Math.round`, comme Android : la moitié monte toujours.
    let rounded = Int((value + 0.5).rounded(.down))
    return rounded.formatted(.number.locale(french).grouping(.automatic))
        .replacingOccurrences(of: "\u{202F}", with: "\u{00A0}")
}

/// 78,4.
func formatKg(_ value: Double) -> String {
    String(format: "%.1f", locale: french, value)
}

/// −0,6 avec le vrai signe moins.
func formatSigned(_ value: Double, decimals: Int = 1) -> String {
    let body = String(format: "%.\(decimals)f", locale: french, abs(value))
    if value > 0 { return "+" + body }
    if value < 0 { return "−" + body }
    return body
}
