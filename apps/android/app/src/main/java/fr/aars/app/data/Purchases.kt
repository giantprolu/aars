package fr.aars.app.data

import android.app.Activity
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * L'achat intégré (Google Play Billing) : l'abonnement mensuel, et Cuisine+
 * quand elle est en vente.
 *
 * Le téléphone ne décide de rien : chaque achat part au serveur, qui le relit
 * chez Google, le confirme (sans quoi Google le rembourse sous trois jours) et
 * dit ce qu'il ouvre. L'achat porte l'`accountRef` du compte, que le serveur
 * contrôle : il ne se rattache qu'à celui qui l'a payé. Un achat que le
 * serveur n'a pas pu rattacher (réseau coupé) reste non confirmé, et repasse
 * au démarrage suivant.
 */
class PurchaseStore(
    context: Context,
    private val api: Api,
    private val scope: CoroutineScope,
    private val onMessage: (String) -> Unit,
) : PurchasesUpdatedListener {
    var billing by mutableStateOf<BillingResponse?>(null)
        private set
    var subscription by mutableStateOf<ProductDetails?>(null)
        private set
    var kitchenPlus by mutableStateOf<ProductDetails?>(null)
        private set
    var busy by mutableStateOf(false)
        private set

    val premium: Boolean get() = billing?.premium == true

    /** Cuisine+ ne se montre que si le serveur la met en vente et que Google la connaît. */
    val kitchenPlusOffer: ProductDetails?
        get() = if (billing?.products?.kitchenPlusOnSale == true && billing?.kitchenPlus != true) kitchenPlus else null

    private val client = BillingClient.newBuilder(context.applicationContext)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    /** Ouvre la connexion au service de Google Play, ou rend faux s'il ne répond pas. */
    private suspend fun connect(): Boolean {
        if (client.isReady) return true
        return suspendCancellableCoroutine { continuation ->
            client.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (continuation.isActive) continuation.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
                }

                override fun onBillingServiceDisconnected() {
                    if (continuation.isActive) continuation.resume(false)
                }
            })
        }
    }

    /** Lit l'état du compte, puis les produits chez Google. */
    suspend fun load() {
        api.billing().valueOrNull()?.let { billing = it }
        val products = billing?.products ?: return
        if (!connect()) return
        products.subscription["google_play"]?.let { id ->
            subscription = details(id, BillingClient.ProductType.SUBS)
        }
        products.kitchenPlus?.let { id ->
            kitchenPlus = details(id, BillingClient.ProductType.INAPP)
        }
    }

    private suspend fun details(productId: String, type: String): ProductDetails? {
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(type).build()))
            .build()
        val result = client.queryProductDetails(params)
        if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) return null
        return result.productDetailsList?.firstOrNull()
    }

    /** Le prix mensuel affiché par Google, dans la devise du compte. */
    fun monthlyPrice(product: ProductDetails): String? =
        baseOffer(product)?.pricingPhases?.pricingPhaseList?.lastOrNull()?.formattedPrice

    /** L'offre de base de l'abonnement : celle sans offre promotionnelle, ou la première. */
    private fun baseOffer(product: ProductDetails): ProductDetails.SubscriptionOfferDetails? {
        val offers = product.subscriptionOfferDetails.orEmpty()
        return offers.firstOrNull { it.offerId == null } ?: offers.firstOrNull()
    }

    /** Lance l'écran d'achat de Google Play. L'issue arrive dans [onPurchasesUpdated]. */
    fun purchase(activity: Activity, product: ProductDetails) {
        if (busy) return
        val account = billing?.accountRef
        if (account == null) {
            onMessage("Achat indisponible pour l'instant. Réessaie dans un instant.")
            return
        }
        val params = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
        if (product.productType == BillingClient.ProductType.SUBS) {
            val offer = baseOffer(product)
            if (offer == null) {
                onMessage("Offre indisponible pour l'instant.")
                return
            }
            params.setOfferToken(offer.offerToken)
        } else {
            product.oneTimePurchaseOfferDetails?.offerToken?.let { params.setOfferToken(it) }
        }
        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(params.build()))
            .setObfuscatedAccountId(account)
            .build()
        busy = true
        val result = client.launchBillingFlow(activity, flow)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            busy = false
            onMessage("L'achat n'a pas pu s'ouvrir.")
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        scope.launch {
            when (result.responseCode) {
                BillingClient.BillingResponseCode.OK -> purchases.orEmpty().forEach { purchase ->
                    deliver(purchase)?.let(onMessage)
                }
                BillingClient.BillingResponseCode.USER_CANCELED -> Unit
                // Déjà acheté, sur cet appareil ou un autre : on le rattache.
                BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> onMessage(restoreQuietly())
                else -> onMessage("L'achat n'a pas abouti.")
            }
            busy = false
        }
    }

    /** Restaure les achats de ce compte Google, et les rattache au compte Aars. */
    suspend fun restore(): String {
        busy = true
        try {
            return restoreQuietly()
        } finally {
            busy = false
        }
    }

    private suspend fun restoreQuietly(): String {
        if (!connect()) return "Google Play ne répond pas pour l'instant."
        var restored = 0
        for (purchase in owned()) {
            if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED && deliver(purchase) == null) restored++
        }
        load()
        return if (restored == 0) "Aucun achat à restaurer." else "Achats restaurés."
    }

    /**
     * Au démarrage : rattache ce qui attend encore, achat approuvé plus tard,
     * payé en espèces, ou interrompu par une coupure avant d'atteindre le
     * serveur. Silencieux, sauf échec à dire.
     */
    fun syncPending() {
        scope.launch {
            if (!connect()) return@launch
            owned().filter { it.purchaseState == Purchase.PurchaseState.PURCHASED && !it.isAcknowledged }.forEach { purchase ->
                deliver(purchase)
            }
        }
    }

    private suspend fun owned(): List<Purchase> = listOf(BillingClient.ProductType.SUBS, BillingClient.ProductType.INAPP).flatMap { type ->
        val result = client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(type).build())
        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) result.purchasesList else emptyList()
    }

    /** Fait rattacher un achat par le serveur. Rend `null` si tout va bien, sinon le message à afficher. */
    private suspend fun deliver(purchase: Purchase): String? {
        if (purchase.purchaseState == Purchase.PurchaseState.PENDING) return "Achat en attente de paiement."
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return null
        val productId = purchase.products.firstOrNull()
        val oneTime = productId != null && productId == billing?.products?.kitchenPlus
        return when (val result = api.verifyGoogle(purchase.purchaseToken, if (oneTime) productId else null)) {
            is ApiResult.Ok -> {
                billing = billing?.copy(premium = result.value.premium, kitchenPlus = result.value.kitchenPlus, expiresAt = result.value.expiresAt)
                null
            }
            is ApiResult.Failed ->
                if (result.code == "purchase_invalid") "Cet achat n'a pas pu être rattaché à ton compte Aars." else result.message
        }
    }
}
