package fr.nutriperso.app.ui.screens

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.android.billingclient.api.ProductDetails
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.ui.components.Badge
import fr.nutriperso.app.ui.components.GhostButton
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.LinkText
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.components.valueWithUnit
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

private val expiryFormat = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH)

/** L'activité qui porte l'écran : Google Play ouvre son écran d'achat par-dessus. */
private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

/**
 * NutriPerso Premium : l'abonnement mensuel, et Cuisine+ quand elle est en
 * vente. Ouvert depuis Moi, ou dès qu'une action bute sur une limite gratuite.
 *
 * Les prix viennent de Google, dans la devise du compte ; les droits, du
 * serveur. Durée, prix, renouvellement et résiliation sont dits sur l'écran.
 */
@Composable
fun PremiumScreen(model: AppModel, onBack: () -> Unit) {
    val store = model.purchases
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val nutrition = Domains.nutrition
    LaunchedEffect(Unit) { store.load() }

    fun buy(product: ProductDetails) {
        val activity = context.activity()
        if (activity == null) model.toast("Achat indisponible pour l'instant.") else store.purchase(activity, product)
    }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackLink("Retour", onBack)
            Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Txt("NutriPerso Premium", Type.screenTitle)
                Txt("Le journal, l'export et la suppression du compte restent gratuits, pour toujours.", Type.secondary)
            }
            if (store.premium) {
                Subscribed(model, context)
            } else {
                Benefits(loading = store.billing == null)
                val product = store.subscription
                val price = product?.let(store::monthlyPrice)
                if (product != null && price != null) {
                    Column(
                        Modifier.fillMaxWidth().tinted(nutrition.soft, Radius.sessionCard).padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Txt("Abonnement mensuel", nt(15f, 600), Modifier.weight(1f))
                            Txt(valueWithUnit(price, " / mois"), nt(20f, 700, nutrition.textOnLight))
                        }
                        PrimaryButton("S'abonner", nutrition, { buy(product) }, height = 52.dp, busy = store.busy, textSize = 15.5f, weight = 700)
                        Txt(
                            "Renouvelé chaque mois au même prix, jusqu'à résiliation dans Google Play › Paiements et abonnements. " +
                                "Le paiement est débité sur ton compte Google.",
                            Type.small,
                        )
                    }
                } else {
                    EmptyCard(
                        if (store.billing == null) "Chargement des offres…" else "Offres indisponibles",
                        if (store.billing == null) "Un instant." else "Google Play ne répond pas pour l'instant. Réessaie dans un moment.",
                    )
                }
            }
            store.kitchenPlusOffer?.let { offer ->
                val kitchen = Domains.kitchen
                Column(
                    Modifier.fillMaxWidth().tinted(kitchen.soft, Radius.sessionCard).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Txt("Cuisine+", nt(15f, 600), Modifier.weight(1f))
                        Txt(offer.oneTimePurchaseOfferDetails?.formattedPrice ?: "", nt(20f, 700, kitchen.textOnLight))
                    }
                    Txt(
                        "Achat unique, à vie : le plan automatique de la semaine et l'import de recette. Compris dans l'abonnement.",
                        Type.secondary,
                    )
                    PrimaryButton("Acheter Cuisine+", kitchen, { buy(offer) }, height = 50.dp, busy = store.busy, textSize = 15f)
                }
            }
            if (!store.premium || store.billing?.kitchenPlus != true) {
                GhostButton("Restaurer mes achats", { scope.launch { model.toast(store.restore()) } })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                LinkText("Confidentialité", Neutrals.muted, {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL)))
                }, size = 12f)
            }
        }
    }
}

@Composable
private fun Benefits(loading: Boolean) {
    Column(Modifier.fillMaxWidth().card().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Benefit("Recettes écrites sans limite", "10 en version gratuite")
        Benefit("Favoris sans limite", "10 en version gratuite")
        Benefit("Le plan automatique et l'import de recette", "Cuisine+, compris dans l'abonnement")
        Benefit("Les prochaines fonctions payantes", "dès leur sortie, sans supplément")
        if (loading) Txt("Lecture de ton compte…", Type.small)
    }
}

@Composable
private fun Benefit(title: String, detail: String) {
    val nutrition = Domains.nutrition
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(20.dp).background(nutrition.fill, CircleShape), contentAlignment = Alignment.Center) {
            Icon(R.drawable.lucide_check, 12.dp, nutrition.textOnFill)
        }
        Column {
            Txt(title, nt(14f, 600))
            Txt(detail, Type.small)
        }
    }
}

@Composable
private fun Subscribed(model: AppModel, context: Context) {
    val nutrition = Domains.nutrition
    val store = model.purchases
    Column(
        Modifier.fillMaxWidth().tinted(nutrition.soft, Radius.sessionCard).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Txt("Tu es abonné", nt(15f, 600), Modifier.weight(1f))
            Badge("Premium", nutrition.fill, nutrition.textOnFill)
        }
        store.billing?.expiresAt?.let { raw ->
            runCatching { Instant.parse(raw).atZone(ZoneId.systemDefault()).format(expiryFormat) }.getOrNull()?.let { date ->
                Txt("Accès payé jusqu'au $date.", Type.secondary)
            }
        }
        PillButton("Gérer l'abonnement", nutrition.fill, nutrition.textOnFill, height = 40.dp) {
            val product = store.billing?.products?.subscription?.get("google_play")
            val url = "https://play.google.com/store/account/subscriptions" +
                (product?.let { "?sku=$it&package=${context.packageName}" } ?: "")
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }
}
