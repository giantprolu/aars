import SwiftUI

@main
struct NutriPersoApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
        }
    }
}

/// Connexion, onboarding ou l'app, selon la session et le profil.
struct RootView: View {
    let model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    private enum Screen {
        case auth, onboarding, app, checking
    }

    private var screen: Screen {
        if !model.api.signedIn { return .auth }
        switch model.gate {
        case .onboarding: return .onboarding
        case .ready: return .app
        case .checking: return .checking
        }
    }

    var body: some View {
        ZStack {
            Neutrals.screen.ignoresSafeArea()
            switch screen {
            case .auth: AuthScreen(model: model).transition(.opacity)
            case .onboarding: OnboardingFlow(model: model).transition(.opacity)
            case .app: MainShell(model: model).transition(.opacity)
            case .checking: Color.clear
            }
        }
        .animation(.easeInOut(duration: 0.3), value: screen)
        .task(id: model.api.signedIn) { await model.sessionChanged() }
        // Les journées Santé se rattrapent à chaque retour dans l'app.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.syncHealth() }
        }
    }
}
