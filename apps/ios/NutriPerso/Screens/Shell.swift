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

/// Écrans poussés par-dessus la coquille, avec un retour.
enum Pushed: Hashable {
    case me, progress, account, health, history, people
    case day(String)
}

/// Les écrans plein écran de Cuisine.
enum KitchenFlow: Equatable {
    case scanCheck(week: String)
    case addItem(week: String)
    case newRecipe
}

/// Les écrans plein écran du Sport.
enum TrainingFlow {
    case compose, `import`
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
    @State private var stack: [Pushed] = []
    /// Un aliment trouvé au scanner, que la feuille Repas reprend.
    @State private var scanned: SearchHit?
    @State private var workoutId: Int?
    @State private var flow: TrainingFlow?
    @State private var kitchenFlow: KitchenFlow?
    @State private var moderation: ModerationTarget?
    @State private var planSlot: PlanSlot?
    @State private var planBasket: [BasketRow] = []
    /// La liste vue au moment d'ouvrir « Scanner pour cocher ».
    @State private var shoppingItems: [ShoppingItemRow] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            Neutrals.screen.ignoresSafeArea()
            screen
            NutriTabBar(current: tab) { tab = $0 }
            // Chaque écran glisse par-dessus le précédent, qui garde son état.
            ForEach(stack, id: \.self) { route in
                pushed(route)
                    .background(Neutrals.screen.ignoresSafeArea())
                    .gesture(backSwipe)
                    .transition(.move(edge: .trailing))
            }
            Scrim(visible: fabOpen || planSlot != nil || moderation != nil || (sheet != nil && sheet != .scan), onDismiss: closeAll)
            if stack.isEmpty {
                FabArc(open: fabOpen, onToggle: toggle, onLongPress: { pick(.scan) }, onPick: pick)
            }
            MealSheet(visible: sheet == .meal, model: model, preset: scanned, onDismiss: {
                closeAll()
                scanned = nil
            }, onScan: { pick(.scan) })
            SessionSheet(
                visible: sheet == .session,
                model: model,
                onDismiss: closeAll,
                onStart: startSession,
                onImport: { open(.import) },
                onCompose: { open(.compose) }
            )
            WeighSheet(visible: sheet == .weigh, model: model, onDismiss: closeAll)
            PlanSlotSheet(slot: planSlot, basket: planBasket, model: model, onDismiss: closeAll)
            ModerationSheet(target: moderation, model: model, onDismiss: closeAll)
            ScannerOverlay(visible: sheet == .scan, model: model, onDismiss: closeAll) { hit in
                scanned = hit
                pick(.meal)
            }
            if editingGoal {
                OnboardingFlow(model: model, editGoal: true) { editingGoal = false }
                    .transition(.opacity)
            }
            switch kitchenFlow {
            case .scanCheck(let week):
                ScanCheckScreen(model: model, weekStart: week, items: shoppingItems) { kitchenFlow = nil }
                    .transition(.move(edge: .bottom))
            case .addItem(let week):
                AddItemScreen(model: model, weekStart: week) { kitchenFlow = nil }
                    .transition(.move(edge: .bottom))
            case .newRecipe:
                RecipeEditorScreen(model: model) { kitchenFlow = nil }
                    .transition(.move(edge: .bottom))
            case nil:
                EmptyView()
            }
            switch flow {
            case .compose:
                ComposeScreen(model: model, onClose: { flow = nil }) { id in
                    flow = nil
                    workoutId = id
                }
                .transition(.move(edge: .bottom))
            case .import:
                ImportScreen(model: model) { flow = nil }
                    .transition(.move(edge: .bottom))
            case nil:
                EmptyView()
            }
            if let workoutId {
                WorkoutScreen(model: model, sessionId: workoutId) {
                    self.workoutId = nil
                    model.bump()
                    Task { await model.refreshToday() }
                }
                .transition(.move(edge: .bottom))
            }
            ToastHost(toasts: model.toasts)
        }
        .animation(.easeInOut(duration: 0.25), value: editingGoal)
        .animation(.easeOut(duration: 0.32), value: stack)
        .animation(Motion.sheet(Motion.sheetIn), value: flow)
        .animation(Motion.sheet(Motion.sheetIn), value: kitchenFlow)
        .animation(Motion.sheet(Motion.sheetIn), value: workoutId)
    }

    @ViewBuilder
    private var screen: some View {
        switch tab {
        case .today:
            TodayScreen(model: model, onMe: openMe, onPick: pick, onOpenTab: { tab = $0 }, onHistory: { stack = [.history] }, onEditGoal: { editingGoal = true })
        case .kitchen:
            KitchenScreen(
                model: model,
                onMe: openMe,
                onPlanSlot: { slot, basket in
                    planBasket = basket
                    planSlot = slot
                },
                onScanCheck: { week, items in
                    shoppingItems = items
                    kitchenFlow = .scanCheck(week: week)
                },
                onAddItem: { kitchenFlow = .addItem(week: $0) },
                onNewRecipe: { kitchenFlow = .newRecipe }
            )
        case .training:
            TrainingScreen(model: model, onMe: openMe) { pick(.session) }
        case .community:
            CommunityScreen(model: model, onMe: openMe, onPeople: { stack = [.people] }, onModerate: { moderation = $0 })
        }
    }

    @ViewBuilder
    private func pushed(_ route: Pushed) -> some View {
        switch route {
        case .me:
            MeScreen(
                model: model,
                onBack: back,
                onProgress: { stack.append(.progress) },
                onWeigh: { pick(.weigh) },
                onAccount: { stack.append(.account) },
                onHealth: { stack.append(.health) }
            )
        case .progress:
            ProgressScreen(model: model, onBack: back)
        case .health:
            HealthScreen(model: model, onBack: back)
        case .account:
            AccountScreen(model: model, onBack: back) { editingGoal = true }
        case .history:
            HistoryScreen(model: model, onBack: back) { stack.append(.day($0)) }
        case .day(let date):
            DayScreen(model: model, date: date, onBack: back)
        case .people:
            PeopleScreen(model: model, onBack: back) { moderation = $0 }
        }
    }

    private func openMe() {
        stack = [.me]
    }

    private func back() {
        if !stack.isEmpty { stack.removeLast() }
    }

    /// Un glissé depuis le bord gauche revient en arrière, comme partout sur iOS.
    private var backSwipe: some Gesture {
        DragGesture(minimumDistance: 20)
            .onEnded { drag in
                if drag.startLocation.x < 32, drag.translation.width > 80 { back() }
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
        planSlot = nil
        moderation = nil
    }

    private func pick(_ target: AddSheet) {
        fabOpen = false
        sheet = target
        if target != .scan { model.loadQuick() }
    }

    private func open(_ target: TrainingFlow) {
        closeAll()
        flow = target
    }

    /// Reprend la séance ouverte, lance la suivante du programme, ou une libre.
    private func startSession(_ session: QuickSession?) {
        closeAll()
        if session?.kind == "open", let id = session?.sessionId {
            workoutId = id
            return
        }
        Task {
            switch await model.api.startSession(templateId: session?.templateId) {
            case .success(let started):
                model.bump()
                workoutId = started.id
            case .failure(let failure):
                model.toast(failure.message)
            }
        }
    }

    private func comingSoon() {
        model.toast("Bientôt sur iOS.")
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
