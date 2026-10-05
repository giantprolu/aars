import Foundation
import Observation
import StoreKit

/**
 L'achat intégré (StoreKit 2) : l'abonnement mensuel, et Cuisine+ quand elle
 est en vente.

 Le téléphone ne décide de rien : chaque transaction part au serveur, qui la
 relit chez Apple et dit ce qu'elle ouvre. Une transaction n'est terminée
 qu'une fois rattachée au compte ; si le serveur ne répond pas, elle reste en
 attente et repasse au prochain démarrage. L'achat porte l'`appAccountToken`
 du compte, que le serveur contrôle : il ne se rattache qu'à celui qui l'a
 payé.
 */
@MainActor
@Observable
final class PurchaseStore {
    private(set) var billing: BillingResponse?
    private(set) var subscription: Product?
    private(set) var kitchenPlus: Product?
    /// Faux tant que les produits n'ont pas pu être lus chez Apple.
    private(set) var productsLoaded = false
    private(set) var busy = false

    @ObservationIgnored private var listening = false

    var premium: Bool { billing?.premium ?? false }

    /// Cuisine+ ne se montre que si le serveur la met en vente et qu'Apple la connaît.
    var kitchenPlusOffer: Product? {
        billing?.products?.kitchenPlusOnSale == true && billing?.kitchenPlus != true ? kitchenPlus : nil
    }

    /// Lit l'état du compte, puis les produits chez Apple.
    func load(_ api: Api) async {
        if let fresh = await api.billing().value { billing = fresh }
        guard let products = billing?.products else { return }
        let ids = [products.subscription["app_store"], products.kitchenPlus].compactMap { $0 }
        guard let found = try? await Product.products(for: ids) else { return }
        subscription = found.first { $0.id == products.subscription["app_store"] }
        kitchenPlus = found.first { $0.id == products.kitchenPlus }
        productsLoaded = subscription != nil
    }

    /**
     Écoute les transactions qui arrivent hors de l'écran d'achat :
     renouvellements, achats faits sur un autre appareil, achats approuvés
     plus tard (« Demander à acheter »). Une seule écoute par lancement.
     */
    func listen(_ api: Api) {
        guard !listening else { return }
        listening = true
        Task {
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    _ = await deliver(transaction, api)
                }
            }
        }
        // Ce qui attendait d'être rattaché au lancement précédent.
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result {
                    _ = await deliver(transaction, api)
                }
            }
        }
    }

    /// Achète un produit. Rend le message à afficher, ou `nil` si rien n'est à dire.
    func purchase(_ product: Product, _ api: Api) async -> String? {
        guard !busy else { return nil }
        guard let raw = billing?.appAccountToken, let token = UUID(uuidString: raw) else {
            return "Achat indisponible pour l'instant. Réessaie dans un instant."
        }
        busy = true
        defer { busy = false }
        let result: Product.PurchaseResult
        do {
            result = try await product.purchase(options: [.appAccountToken(token)])
        } catch {
            return "L'achat n'a pas abouti."
        }
        switch result {
        case .success(.verified(let transaction)):
            return await deliver(transaction, api)
        case .success(.unverified):
            return "Apple n'a pas pu confirmer cet achat."
        case .pending:
            return "Achat en attente d'approbation."
        case .userCancelled:
            return nil
        @unknown default:
            return nil
        }
    }

    /// Restaure les achats de ce compte Apple, et les rattache au compte Aars.
    func restore(_ api: Api) async -> String {
        busy = true
        defer { busy = false }
        try? await AppStore.sync()
        var restored = 0
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, await deliver(transaction, api) == nil {
                restored += 1
            }
        }
        await load(api)
        return restored == 0 ? "Aucun achat à restaurer." : "Achats restaurés."
    }

    /**
     Fait rattacher une transaction par le serveur, puis la termine. Une
     transaction refusée (achetée par un autre compte Aars, ou achat de
     test local qu'Apple ne connaît pas) est terminée aussi : elle ne sera
     jamais rattachée ici. Si le serveur ne répond pas,
     elle reste ouverte et repassera. Rend `nil` si tout va bien.
     */
    private func deliver(_ transaction: Transaction, _ api: Api) async -> String? {
        switch await api.verifyApple(transactionId: String(transaction.id)) {
        case .success:
            await transaction.finish()
            if let fresh = await api.billing().value { billing = fresh }
            return nil
        case .failure(let failure) where failure.code == "purchase_invalid":
            await transaction.finish()
            return "Cet achat n'a pas pu être rattaché à ton compte Aars."
        case .failure(let failure):
            return failure.message
        }
    }
}
