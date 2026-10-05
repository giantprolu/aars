import Observation
import SwiftUI

/// Le voile sous les feuilles et l'arc du +, en fondu de 250 ms.
struct Scrim: View {
    let visible: Bool
    let onDismiss: () -> Void

    var body: some View {
        Neutrals.scrim
            .ignoresSafeArea()
            .opacity(visible ? 1 : 0)
            .allowsHitTesting(visible)
            .onTapGesture(perform: onDismiss)
            .animation(.easeInOut(duration: Motion.scrim), value: visible)
    }
}

/**
 Feuille du bas : rayon 28 en haut, poignée, titre de 19, bouton ×. Monte en
 350 ms ; se ferme d'un glissé au-delà de 30 % de sa hauteur ou d'un geste vif.
 */
struct NutriSheet<Content: View>: View {
    let visible: Bool
    let title: String
    let onDismiss: () -> Void
    var gap: CGFloat = 14
    @ViewBuilder let content: Content

    @State private var drag: CGFloat = 0
    @State private var height: CGFloat = 1

    var body: some View {
        ZStack(alignment: .bottom) {
            if visible {
                sheet
                    .transition(.move(edge: .bottom))
                    .onAppear { drag = 0 }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(visible ? Motion.sheet(Motion.sheetIn) : Motion.sheet(0.26), value: visible)
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: gap) {
            Capsule()
                .fill(Neutrals.sheetHandle)
                .frame(width: 40, height: 4)
                .frame(maxWidth: .infinity)
            HStack {
                Text(title).textStyle(TextStyles.sheetTitle).frame(maxWidth: .infinity, alignment: .leading)
                CloseButton(action: onDismiss)
            }
            .padding(.horizontal, 4)
            content
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: Radius.sheet, topTrailingRadius: Radius.sheet)
                .fill(Neutrals.card)
                .ignoresSafeArea(edges: .bottom)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = max($0, 1) }
        .offset(y: drag)
        .gesture(
            DragGesture()
                .onChanged { drag = max(0, $0.translation.height) }
                .onEnded { value in
                    let flung = value.predictedEndTranslation.height - value.translation.height > 250
                    if drag > height * 0.3 || flung {
                        onDismiss()
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) { drag = 0 }
                    }
                }
        )
    }
}

struct CloseButton: View {
    var dark = false
    let action: () -> Void

    var body: some View {
        LucideIcon(.x, dark ? 16 : 15, dark ? .white : Neutrals.ink)
            .frame(width: dark ? 36 : 32, height: dark ? 36 : 32)
            .background(dark ? Color.white.opacity(0.14) : Neutrals.chip, in: Circle())
            .tap(action)
            .accessibilityLabel("Fermer")
    }
}

/// Le message du moment : une pilule sombre en haut, 2,2 s.
@MainActor
@Observable
final class ToastCenter {
    private(set) var message = ""
    private(set) var visible = false
    @ObservationIgnored private var serial = 0

    func show(_ text: String) {
        message = text
        visible = true
        serial += 1
        let shown = serial
        Task {
            try? await Task.sleep(for: Motion.toastHold)
            if serial == shown { visible = false }
        }
    }
}

struct ToastHost: View {
    let toasts: ToastCenter

    var body: some View {
        VStack {
            if toasts.visible {
                Text(toasts.message)
                    .textStyle(nt(13.5, 500, .white))
                    .lineLimit(1)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Neutrals.ink, in: Capsule())
                    .padding(.top, 6)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer()
        }
        .animation(Motion.spring(0.3), value: toasts.visible)
        .allowsHitTesting(false)
    }
}
