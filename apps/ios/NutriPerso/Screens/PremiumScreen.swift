import StoreKit
import SwiftUI

/// Les conditions d'utilisation standard d'Apple pour les achats intégrés.
private let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")

/**
 NutriPerso Premium : l'abonnement mensuel, et Cuisine+ quand elle est en
 vente. Ouvert depuis Moi, ou dès qu'une action bute sur une limite gratuite.

 Les prix viennent d'Apple, dans la devise du compte ; les droits, du
 serveur. Les mentions qu'Apple exige pour un abonnement renouvelable
 (durée, prix, renouvellement, résiliation, conditions, confidentialité,
 restauration) sont toutes sur l'écran.
 */
struct PremiumScreen: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var managing = false
    @Environment(\.openURL) private var openURL

    private var store: PurchaseStore { model.purchases }

    var body: some View {
        let nutrition = Domains.nutrition
        ScreenColumn(withTabBar: false) {
            BackLink(label: "Retour", action: onBack)
            VStack(alignment: .leading, spacing: 6) {
                Text("NutriPerso Premium").textStyle(TextStyles.screenTitle)
                Text("Le journal, l'export et la suppression du compte restent gratuits, pour toujours.")
                    .textStyle(TextStyles.secondary)
            }
            .padding(.horizontal, 4)
            if store.premium {
                subscribed
            } else {
                benefits
                subscriptionOffer
            }
            if let offer = store.kitchenPlusOffer { kitchenPlusCard(offer) }
            if !store.premium || store.billing?.kitchenPlus != true {
                GhostButton(text: "Restaurer mes achats") { act { await store.restore(model.api) } }
            }
            legal(nutrition)
        }
        .task { await store.load(model.api) }
        .manageSubscriptionsSheet(isPresented: $managing)
    }

    private var benefits: some View {
        let usage = store.billing
        return VStack(alignment: .leading, spacing: 10) {
            benefit("Recettes écrites sans limite", "10 en version gratuite")
            benefit("Favoris sans limite", "10 en version gratuite")
            benefit("Les prochaines fonctions payantes", "dès leur sortie, sans supplément")
            if usage == nil {
                Text("Lecture de ton compte…").textStyle(TextStyles.small)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func benefit(_ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            LucideIcon(.check, 12, Domains.nutrition.textOnFill)
                .frame(width: 20, height: 20)
                .background(Domains.nutrition.fill, in: Circle())
            VStack(alignment: .leading, spacing: 0) {
                Text(title).textStyle(nt(14, 600))
                Text(detail).textStyle(TextStyles.small)
            }
        }
    }

    @ViewBuilder
    private var subscriptionOffer: some View {
        let nutrition = Domains.nutrition
        if let product = store.subscription {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Abonnement mensuel").textStyle(nt(15, 600))
                    Spacer()
                    Text(valueWithUnit(product.displayPrice, " / mois")).textStyle(nt(20, 700, nutrition.textOnLight))
                }
                PrimaryButton(text: "S'abonner", colors: nutrition, height: 52, busy: store.busy, textSize: 15.5, weight: 700) {
                    act { await store.purchase(product, model.api) }
                }
                Text("Renouvelé chaque mois au même prix, jusqu'à résiliation au moins 24 heures avant l'échéance, "
                    + "dans Réglages › ton nom › Abonnements. Le paiement est débité sur ton compte Apple.")
                    .textStyle(TextStyles.small)
            }
            .padding(16)
            .tinted(nutrition.soft, radius: Radius.sessionCard)
        } else {
            EmptyCard(
                title: store.billing == nil ? "Chargement des offres…" : "Offres indisponibles",
                text: store.billing == nil ? "Un instant." : "L'App Store ne répond pas pour l'instant. Réessaie dans un moment."
            )
        }
    }

    private var subscribed: some View {
        let nutrition = Domains.nutrition
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Tu es abonné").textStyle(nt(15, 600))
                Spacer()
                Badge(text: "Premium", background: nutrition.fill, foreground: nutrition.textOnFill)
            }
            if let expires = store.billing?.expiresAt.flatMap(parseInstant) {
                Text("Accès payé jusqu'au \(expires.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "fr_FR")))).")
                    .textStyle(TextStyles.secondary)
            }
            PillButton(text: "Gérer l'abonnement", background: nutrition.fill, foreground: nutrition.textOnFill, height: 40) {
                managing = true
            }
        }
        .padding(16)
        .tinted(nutrition.soft, radius: Radius.sessionCard)
    }

    private func kitchenPlusCard(_ product: Product) -> some View {
        let kitchen = Domains.kitchen
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Cuisine+").textStyle(nt(15, 600))
                Spacer()
                Text(product.displayPrice).textStyle(nt(20, 700, kitchen.textOnLight))
            }
            Text("Achat unique, à vie : le plan automatique de la semaine et l'import de recette. Compris dans l'abonnement.")
                .textStyle(TextStyles.secondary)
            PrimaryButton(text: "Acheter Cuisine+", colors: kitchen, height: 50, busy: store.busy, textSize: 15) {
                act { await store.purchase(product, model.api) }
            }
        }
        .padding(16)
        .tinted(kitchen.soft, radius: Radius.sessionCard)
    }

    private func legal(_ nutrition: DomainColors) -> some View {
        HStack(spacing: 16) {
            LinkText(text: "Conditions d'utilisation", color: Neutrals.muted, size: 12) {
                if let termsURL { openURL(termsURL) }
            }
            LinkText(text: "Confidentialité", color: Neutrals.muted, size: 12) {
                if let url = URL(string: model.api.baseURL + "/legal/privacy") { openURL(url) }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    /// Lance une action d'achat et affiche son message.
    private func act(_ work: @escaping () async -> String?) {
        Task {
            if let message = await work() { model.toast(message) }
            model.bump()
        }
    }
}
