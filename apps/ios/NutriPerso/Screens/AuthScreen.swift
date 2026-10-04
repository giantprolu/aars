import SwiftUI

/// Longueur minimale du mot de passe, comme `MIN_PASSWORD_LENGTH` côté serveur.
private let minPasswordLength = 10

/**
 Connexion, inscription et récupération par code de secours, sur un seul
 écran. L'inscription est libre et enchaîne sur l'onboarding.
 */
struct AuthScreen: View {
    let model: AppModel

    @State private var creating = false
    @State private var recovering = false
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        let nutrition = Domains.nutrition
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("NutriPerso").textStyle(nt(14, 600, nutrition.textOnLight))
                    Text(title).textStyle(nt(34, 600, line: 1.1, tracking: -0.035))
                    Text(subtitle).textStyle(nt(15, 400, Neutrals.muted))
                }
                VStack(alignment: .leading, spacing: 16) {
                    Labeled(label: "Adresse") {
                        NutriField(text: $email, placeholder: "toi@exemple.fr", kind: .email)
                    }
                    if recovering {
                        Labeled(label: "Code de secours") {
                            NutriField(text: $code, placeholder: "XXXX-XXXX-XXXX")
                                .filtered($code, maxLength(40))
                        }
                    }
                    Labeled(
                        label: recovering ? "Nouveau mot de passe" : "Mot de passe",
                        hint: creating || recovering ? "Au moins \(minPasswordLength) caractères." : nil
                    ) {
                        NutriField(
                            text: $password,
                            kind: creating || recovering ? .newPassword : .password,
                            submitLabel: .go,
                            onSubmit: submit
                        )
                    }
                    if let error {
                        Text(error).textStyle(nt(13, 500, Macros.protein.text))
                    }
                }
                PrimaryButton(text: action, colors: nutrition, enabled: canSubmit, busy: busy, action: submit)
                GhostButton(text: creating || recovering ? "J'ai déjà un compte" : "Créer un compte") {
                    creating = !(creating || recovering)
                    recovering = false
                    error = nil
                }
                if !creating && !recovering {
                    GhostButton(text: "Mot de passe oublié") {
                        recovering = true
                        error = nil
                    }
                }
            }
            .padding(.horizontal, Space.onboardingH)
            .padding(.top, 80)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: email) { _, value in
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            if trimmed != value { email = trimmed }
        }
    }

    private var title: String {
        if recovering { return "Retrouve ton compte." }
        return creating ? "Crée ton compte." : "Content de te revoir."
    }

    private var subtitle: String {
        if recovering { return "Ton adresse, ton code de secours, et un nouveau mot de passe." }
        return creating ? "Une adresse et un mot de passe. Le reste se règle juste après." : "Ton journal t'attend."
    }

    private var action: String {
        if recovering { return "Changer le mot de passe" }
        return creating ? "Créer mon compte" : "Se connecter"
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
            && (!recovering || !code.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    private func submit() {
        guard !busy, canSubmit else { return }
        if (creating || recovering) && password.count < minPasswordLength {
            error = "Un mot de passe d'au moins \(minPasswordLength) caractères."
            return
        }
        busy = true
        error = nil
        Task {
            let result: ApiResult<Void>
            if recovering {
                result = await model.api.recover(email: email, code: code, password: password)
            } else if creating {
                result = await model.api.register(email: email, password: password)
            } else {
                result = await model.api.login(email: email, password: password)
            }
            busy = false
            if case .failure(let failure) = result { error = failure.message }
        }
    }
}
