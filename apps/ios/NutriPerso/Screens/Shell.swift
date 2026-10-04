import SwiftUI

enum Tab: CaseIterable {
    case today, kitchen, training, community

    var label: String {
        switch self {
        case .today: "Aujourd'hui"
        case .kitchen: "Cuisine"
        case .training: "Sport"
        case .community: "Communauté"
        }
    }

    var icon: Lucide {
        switch self {
        case .today: .sun
        case .kitchen: .utensils
        case .training: .dumbbell
        case .community: .users
        }
    }

    var active: Color {
        switch self {
        case .today: Domains.nutrition.textOnLight
        case .kitchen: Domains.kitchen.textOnLight
        case .training: Domains.training.textOnLight
        case .community: Domains.community.textOnLight
        }
    }
}

enum AddSheet {
    case meal, session, weigh, scan
}

/**
 La coquille : quatre onglets, le + central qui ouvre son arc, les feuilles
 d'ajout, les toasts.
 */
struct MainShell: View {
    let model: AppModel

    @State private var tab = Tab.today
    @State private var fabOpen = false
    @State private var sheet: AddSheet?
    @State private var editingGoal = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Neutrals.screen.ignoresSafeArea()
            screen
            NutriTabBar(current: tab) { tab = $0 }
            Scrim(visible: fabOpen || sheet == .meal || sheet == .weigh, onDismiss: closeAll)
            FabArc(open: fabOpen, onToggle: toggle, onLongPress: { pick(.scan) }, onPick: pick)
            MealSheet(visible: sheet == .meal, model: model, preset: nil, onDismiss: closeAll) { pick(.scan) }
            WeighSheet(visible: sheet == .weigh, model: model, onDismiss: closeAll)
            if editingGoal {
                OnboardingFlow(model: model, editGoal: true) { editingGoal = false }
                    .transition(.opacity)
            }
            ToastHost(toasts: model.toasts)
        }
        .animation(.easeInOut(duration: 0.25), value: editingGoal)
    }

    @ViewBuilder
    private var screen: some View {
        switch tab {
        case .today:
            TodayScreen(model: model, onMe: comingSoon, onPick: pick, onOpenTab: { tab = $0 }, onHistory: comingSoon, onEditGoal: { editingGoal = true })
        case .kitchen, .training, .community:
            ComingSoonScreen(tab: tab)
        }
    }

    private func toggle() {
        if sheet != nil {
            closeAll()
        } else {
            fabOpen.toggle()
        }
    }

    private func closeAll() {
        fabOpen = false
        sheet = nil
    }

    private func pick(_ target: AddSheet) {
        fabOpen = false
        switch target {
        case .meal, .weigh:
            sheet = target
            model.loadQuick()
        case .session, .scan:
            // Séance en cours et scanner : portés dans les prochains lots.
            sheet = nil
            comingSoon()
        }
    }

    private func comingSoon() {
        model.toast("Bientôt sur iOS.")
    }
}

/// Un onglet pas encore porté depuis Android.
private struct ComingSoonScreen: View {
    let tab: Tab

    var body: some View {
        ScreenColumn {
            Text(tab.label).textStyle(TextStyles.screenTitle).padding(.horizontal, 4)
            EmptyCard(title: "Bientôt sur iOS", text: "Cet onglet arrive dans un prochain lot. Il est déjà sur Android et sur le web.")
        }
    }
}

/// La barre d'onglets : 58 de haut, fond crème à 96 %, filet en haut, place
/// vide au centre pour le +.
struct NutriTabBar: View {
    let current: Tab
    let onSelect: (Tab) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Hairline(color: Neutrals.tabBarBorder)
            HStack(spacing: 0) {
                ForEach(Array(Tab.allCases.enumerated()), id: \.offset) { index, tab in
                    if index == 2 { Color.clear.frame(maxWidth: .infinity) }
                    item(tab)
                }
            }
            .padding(.horizontal, 4)
            .frame(height: Space.tabBarHeight)
        }
        .background(Neutrals.card.opacity(0.96).ignoresSafeArea(edges: .bottom))
    }

    private func item(_ tab: Tab) -> some View {
        let active = tab == current
        let color = active ? tab.active : Neutrals.tabInactive
        return VStack(spacing: 3) {
            LucideIcon(tab.icon, 22, color)
            Text(tab.label).textStyle(active ? TextStyles.tabActive : TextStyles.tab, color: color).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .tap { onSelect(tab) }
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

/**
 Le bouton + et son arc (maquette « Bouton + interactif »).

 Toucher : le + devient un × crème, trois bulles sortent en rebond, décalées
 de 40 ms. Appui long de 500 ms : le scanner, directement.
 */
struct FabArc: View {
    let open: Bool
    let onToggle: () -> Void
    let onLongPress: () -> Void
    let onPick: (AddSheet) -> Void

    var body: some View {
        let nutrition = Domains.nutrition
        ZStack {
            Bubble(open: open, index: 0, offset: Motion.seanceOffset, size: Motion.bubbleSize, color: Domains.training.fill,
                   tint: .white, icon: .dumbbell, iconSize: 22, label: "Séance") { onPick(.session) }
            Bubble(open: open, index: 1, offset: Motion.repasOffset, size: Motion.bubbleSizeMain, color: nutrition.fill,
                   tint: nutrition.textOnFill, icon: .utensils, iconSize: 26, label: "Repas") { onPick(.meal) }
            Bubble(open: open, index: 2, offset: Motion.peseeOffset, size: Motion.bubbleSize, color: Domains.body.fill,
                   tint: .white, icon: .scale, iconSize: 22, label: "Pesée") { onPick(.weigh) }

            LucideIcon(.plus, 24, open ? Neutrals.ink : nutrition.textOnFill)
                .rotationEffect(.degrees(open ? 135 : 0))
                .frame(width: Motion.fabSize, height: Motion.fabSize)
                .background(open ? Neutrals.card : nutrition.fill, in: Circle())
                .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
                .scaleEffect(open ? 0.92 : 1)
                .animation(Motion.spring(Motion.fabRotate), value: open)
                .contentShape(Circle())
                .onTapGesture(perform: onToggle)
                .onLongPressGesture(minimumDuration: Motion.longPress) {
                    Haptics.longPress()
                    onLongPress()
                }
                .accessibilityLabel(open ? "Fermer" : "Ajouter")
                .accessibilityAddTraits(.isButton)
        }
        // Le centre du + : au milieu de la barre d'onglets.
        .frame(width: Motion.fabSize, height: Motion.fabSize)
        .padding(.bottom, (Space.tabBarHeight - Motion.fabSize) / 2 + 1)
    }
}

private struct Bubble: View {
    let open: Bool
    let index: Int
    let offset: CGSize
    let size: CGFloat
    let color: Color
    let tint: Color
    let icon: Lucide
    let iconSize: CGFloat
    let label: String
    let action: () -> Void

    var body: some View {
        LucideIcon(icon, iconSize, tint)
            .frame(width: size, height: size)
            .background(color, in: Circle())
            .shadow(color: color.opacity(0.6), radius: 14, y: 6)
            // Le libellé, 6 pt sous la bulle, hors de sa zone de toucher.
            .overlay(alignment: .top) {
                Text(label)
                    .textStyle(nt(12.5, 700, .white))
                    .fixedSize()
                    .offset(y: size + 6)
                    .allowsHitTesting(false)
            }
            .tap(enabled: open, action)
            .accessibilityLabel(label)
            .scaleEffect(open ? 1 : 0.2)
            .offset(open ? offset : .zero)
            .opacity(open ? 1 : 0)
            .animation(Motion.spring(Motion.bubbles).delay(open ? Double(index) * Motion.bubbleStagger : 0), value: open)
            .allowsHitTesting(open)
            .accessibilityHidden(!open)
    }
}
