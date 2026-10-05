import SwiftUI

extension View {
    /// Contour en pointillé : case vide du plan, bouton Inviter.
    func dashedBorder(_ color: Color, radius: CGFloat, width: CGFloat = 1) -> some View {
        overlay(
            RoundedRectangle(cornerRadius: radius)
                .strokeBorder(color, style: StrokeStyle(lineWidth: width, dash: [4, 3]))
        )
    }
}

/// Rayures diagonales : l'emplacement d'une photo qui viendra de l'API.
struct PhotoStripes: View {
    let background: Color
    let stripe: Color

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(background))
            var x = -size.height
            while x < size.width {
                var line = Path()
                line.move(to: CGPoint(x: x, y: size.height))
                line.addLine(to: CGPoint(x: x + size.height, y: 0))
                context.stroke(line, with: .color(stripe), lineWidth: 4)
                x += 10
            }
        }
    }
}
