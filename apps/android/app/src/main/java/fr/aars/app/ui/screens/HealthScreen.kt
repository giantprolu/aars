package fr.aars.app.ui.screens

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.LifecycleResumeEffect
import fr.aars.app.AppModel
import fr.aars.app.BuildConfig
import fr.aars.app.R
import fr.aars.app.data.HealthAvailability
import fr.aars.app.data.HealthBridge
import fr.aars.app.data.HealthSync
import fr.aars.app.ui.components.Badge
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.PrimaryButton
import fr.aars.app.ui.components.SectionCaps
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.formatInt
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.components.tinted
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Macros
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Santé : le pont Health Connect, ouvert depuis la ligne Santé de Moi.
 *
 * Les maquettes ne dessinent que la tuile Activité et la ligne de réglage ;
 * cet écran en reprend la couleur (Corps) et les briques. Les chiffres viennent
 * du serveur (`/api/me`, `healthBridge`) : c'est lui qui décide si la cible
 * suit la mesure, l'écran ne recalcule rien.
 */
@Composable
fun HealthScreen(model: AppModel, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val body = Domains.body

    var availability by remember { mutableStateOf(model.health.availability()) }
    var granted by remember { mutableStateOf<Set<String>?>(null) }
    var syncing by remember { mutableStateOf(false) }
    var checks by remember { mutableIntStateOf(0) }

    // Revenir de Health Connect ou du Play Store peut tout changer : on relit
    // la disponibilité et les permissions à chaque retour sur l'écran.
    LifecycleResumeEffect(Unit) {
        availability = model.health.availability()
        checks++
        onPauseOrDispose { }
    }
    LaunchedEffect(availability, checks) { granted = model.health.granted() }

    val me = rememberLoaded(model.revision) { model.api.me() }

    fun sync() {
        syncing = true
        scope.launch {
            val sent = model.syncHealthNow(force = true)
            syncing = false
            model.toast(
                when (sent) {
                    null -> "La synchronisation a échoué. Réessaie dans un instant."
                    0 -> "Aucune dépense trouvée dans Health Connect sur 30 jours"
                    else -> "$sent journée${if (sent > 1) "s" else ""} synchronisée${if (sent > 1) "s" else ""}"
                },
            )
        }
    }

    val request = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { result ->
        granted = result.intersect(HealthSync.PERMISSIONS)
        if (HealthSync.ACTIVE in result || HealthSync.TOTAL in result) sync()
    }

    // Debug : écrire des journées de test, puis synchroniser comme d'habitude.
    fun injectSamples() {
        scope.launch {
            if (model.health.writeSampleDays()) sync() else model.toast("Écriture refusée par Health Connect")
        }
    }
    val writeRequest = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { result ->
        if (HealthSync.WRITE_ACTIVE in result) injectSamples() else model.toast("Permission d'écriture refusée")
    }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackLink("Moi", onBack)
            Txt("Santé", Type.screenTitle, Modifier.padding(horizontal = 4.dp))
            Txt(
                "Ta dépense active du jour, lue dans Health Connect. Dès trois journées reçues, la cible suit ta " +
                    "dépense réelle, en médiane sur quatorze jours, au lieu du niveau d'activité déclaré.",
                Type.secondary,
                Modifier.padding(horizontal = 4.dp),
            )

            me.value?.healthBridge?.let { BridgeCard(it) }

            val canRead = granted?.let { HealthSync.ACTIVE in it || HealthSync.TOTAL in it } == true
            when {
                availability == HealthAvailability.Unsupported -> EmptyCard(
                    "Health Connect indisponible",
                    "Health Connect demande Android 9 ou plus récent. La cible reste calculée sur le niveau d'activité déclaré.",
                )
                availability == HealthAvailability.NeedsInstall -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    EmptyCard(
                        "Installer Health Connect",
                        "Sur ce téléphone, Health Connect est une app à installer ou à mettre à jour depuis le Play Store.",
                    )
                    PrimaryButton("Ouvrir le Play Store", body, { openHealthConnectStore(context) }, height = 48.dp, textSize = 15f)
                }
                granted == null -> Unit
                !canRead -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Txt("Ce que l'app lit", nt(14f, 600))
                        Txt(
                            "Calories actives, calories totales et métabolisme de base, sur les trente derniers jours. " +
                                "Elle n'en garde qu'un total par jour, n'écrit rien dans Health Connect et ne lit rien en arrière-plan.",
                            Type.secondary,
                        )
                    }
                    PrimaryButton("Autoriser l'accès", body, { request.launch(HealthSync.PERMISSIONS) }, height = 48.dp, textSize = 15f)
                }
                else -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    PrimaryButton("Synchroniser maintenant", body, ::sync, height = 48.dp, busy = syncing, textSize = 15f)
                    Txt(
                        "La synchronisation se fait seule à chaque ouverture de l'app, et rattrape les jours manqués.",
                        nt(12.5f, color = Neutrals.muted),
                        Modifier.padding(horizontal = 4.dp),
                    )
                }
            }

            if (availability == HealthAvailability.Available) {
                SectionCaps("Accès")
                Row(
                    Modifier.fillMaxWidth().card().tap { openHealthConnectSettings(context) }.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(R.drawable.lucide_sliders_horizontal, 17.dp, Neutrals.muted)
                    Txt("Gérer l'accès dans Health Connect", Type.bodyStrong, Modifier.weight(1f))
                    Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
                }
            }

            // Jamais en release : R8 retire la branche, et la permission
            // d'écriture n'existe que dans le manifeste de debug.
            if (BuildConfig.DEBUG && availability == HealthAvailability.Available) {
                SectionCaps("Debug")
                Row(
                    Modifier.fillMaxWidth().card().tap {
                        scope.launch {
                            if (model.health.canWriteSamples()) injectSamples() else writeRequest.launch(setOf(HealthSync.WRITE_ACTIVE))
                        }
                    }.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(R.drawable.lucide_database, 17.dp, Neutrals.muted)
                    Txt("Écrire 7 jours de test dans Health Connect", Type.bodyStrong, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun BridgeCard(bridge: HealthBridge) {
    val body = Domains.body
    val missing = (bridge.requiredDays - bridge.dayCount).coerceAtLeast(0)
    Column(Modifier.fillMaxWidth().tinted(body.soft, Radius.tile).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Txt("Activité (Santé)", nt(11.5f, 600, body.textOnLight), Modifier.weight(1f))
            if (missing == 0) {
                Badge("Actif", Domains.training.soft, Domains.training.textOnLight)
            } else if (bridge.lastDay != null) {
                Badge("En attente", Neutrals.chip, Neutrals.muted)
            }
        }
        BridgeLine(
            "Dernière journée reçue",
            bridge.lastDay?.let { day -> formatDay(day) + (bridge.lastKcal?.let { " · ${formatInt(it)} kcal" } ?: "") } ?: "—",
        )
        BridgeLine(
            "Dépense médiane",
            if (bridge.dayCount == 0) "—" else "${formatInt(bridge.typicalKcal)} kcal sur ${bridge.dayCount} j",
        )
        Box(Modifier.fillMaxWidth().height(1.dp).background(body.seg))
        Txt(
            if (missing == 0) {
                "La cible suit ta dépense mesurée."
            } else {
                "Encore $missing journée${if (missing > 1) "s" else ""} avant que la cible bascule sur la mesure."
            },
            nt(12.5f, color = body.textOnLight),
        )
    }
    // Même seuil que la page web : au-delà, c'est la source qui se trompe.
    if (bridge.peakKcal > 4000) {
        Column(Modifier.fillMaxWidth().tinted(Macros.protein.track, Radius.tile).padding(14.dp)) {
            Txt(
                "Une journée atteint ${formatInt(bridge.peakKcal)} kcal actives, ce qu'aucun corps ne dépense. " +
                    "La cible l'ignore : elle est calculée sur la médiane. Vérifie l'app qui écrit dans Health Connect.",
                nt(13f, 500, Macros.protein.text),
            )
        }
    }
}

@Composable
private fun BridgeLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Txt(label, nt(13f, color = Neutrals.muted), Modifier.weight(1f))
        Txt(value, nt(13.5f, 600))
    }
}

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRANCE)

private fun formatDay(iso: String): String {
    val day = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return iso
    val today = LocalDate.now(java.time.ZoneId.of("Europe/Paris"))
    return when (day) {
        today -> "Aujourd'hui"
        today.minusDays(1) -> "Hier"
        else -> day.format(DAY_FORMAT).replaceFirstChar { it.uppercase() }
    }
}

private fun openHealthConnectStore(context: Context) {
    val uri = Uri.parse("market://details?id=${HealthSync.PROVIDER}&url=healthconnect%3A%2F%2Fonboarding")
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage("com.android.vending"))
    } catch (e: ActivityNotFoundException) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=${HealthSync.PROVIDER}")))
    }
}

private fun openHealthConnectSettings(context: Context) {
    try {
        context.startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
    } catch (e: ActivityNotFoundException) {
        openHealthConnectStore(context)
    }
}
