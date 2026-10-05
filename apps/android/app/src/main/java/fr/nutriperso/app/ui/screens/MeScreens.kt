package fr.nutriperso.app.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.LunchReminder
import fr.nutriperso.app.ui.components.Avatar
import fr.nutriperso.app.ui.components.Badge
import fr.nutriperso.app.ui.components.Bars
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.SegmentedPill
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.formatKg
import fr.nutriperso.app.ui.components.formatSigned
import fr.nutriperso.app.ui.components.rememberSelectionClick
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.components.valueWithUnit
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt

@Composable
private fun BackRow(label: String, onBack: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.offset(x = (-6).dp).tap(onClick = onBack),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(R.drawable.lucide_chevron_left, 20.dp, Neutrals.ink)
            Txt(label, nt(14f, 500))
        }
        Box(Modifier.weight(1f))
        trailing?.invoke()
    }
}

/** Moi (C6) : identité, poids, records du mois, régularité, réglages. */
@Composable
fun MeScreen(
    model: AppModel,
    onBack: () -> Unit,
    onProgress: () -> Unit,
    onWeigh: () -> Unit,
    onAccount: () -> Unit,
    onHealth: () -> Unit,
    onPremium: () -> Unit,
) {
    val body = Domains.body
    val training = Domains.training
    val me = rememberLoaded(model.revision) { model.api.me() }
    val data = me.value
    var appearance by rememberSaveable { mutableStateOf(0) }
    val context = LocalContext.current
    var reminderOn by remember { mutableStateOf(LunchReminder.isEnabled(context)) }
    var notificationsAllowed by remember { mutableStateOf(LunchReminder.canNotify(context)) }

    // L'état de l'abonnement, pour le badge de la ligne Abonnement.
    LaunchedEffect(Unit) { if (model.purchases.billing == null) model.purchases.load() }

    // Revenir des réglages du téléphone peut avoir coupé les notifications.
    LifecycleResumeEffect(Unit) {
        notificationsAllowed = LunchReminder.canNotify(context)
        onPauseOrDispose { }
    }

    fun turnOn() {
        LunchReminder.enable(context)
        reminderOn = true
        notificationsAllowed = LunchReminder.canNotify(context)
        model.toast("Rappel à 14 h si rien n’est noté")
    }

    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) turnOn() else model.toast("Notifications refusées : autorise-les dans les réglages")
    }

    /** À 14 heures, si ni déjeuner ni dîner n'est noté. */
    fun toggleReminder() {
        when {
            reminderOn -> {
                LunchReminder.disable(context)
                reminderOn = false
                model.toast("Rappel du déjeuner coupé")
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED ->
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            else -> turnOn()
        }
    }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackRow("Retour", onBack) { Icon(R.drawable.lucide_settings, 20.dp, Neutrals.muted, Modifier.tap(onClick = onAccount)) }
            if (!LoadedGate(me) || data == null) return@ScreenColumn

            val identity = data.identity
            Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(initialsOf(identity), size = 48.dp, background = body.fill, foreground = Color.White, fontSize = 16f)
                Column {
                    Txt(
                        identity.displayName ?: identity.handle?.let { "@$it" } ?: "Moi",
                        nt(22f, 600, line = 1.2f, tracking = -0.03f),
                    )
                    Txt("${data.gym ?: "Salle non précisée"} · ${data.sessionsPerWeek} séances par semaine", Type.secondary, maxLines = 1)
                }
            }

            Column(Modifier.fillMaxWidth().tinted(body.soft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Txt("Poids · moyenne de la semaine", nt(11.5f, 600, body.textOnLight))
                        Txt(
                            valueWithUnit(
                                data.weekAverageKg?.let(::formatKg) ?: "—",
                                " kg",
                                unitSize = 13f,
                                extra = data.weightChangeKg?.takeIf { it != 0.0 }?.let { formatSigned(it) },
                                extraColor = body.textOnLight,
                            ),
                            nt(26f, 600, tracking = -0.03f),
                        )
                    }
                    Row(
                        Modifier.height(32.dp).clip(CircleShape).background(body.fill).tap(onClick = onWeigh).padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(R.drawable.lucide_plus, 12.dp, Color.White)
                        Txt("Pesée", nt(12.5f, 700, Color.White))
                    }
                }
                // Même règle que la page web : 45 à 90 % de la hauteur entre le
                // plus bas et le plus haut, 60 % à plat, 6 % sans pesée.
                val known = data.weights.filterNotNull()
                val low = known.minOrNull() ?: 0.0
                val high = known.maxOrNull() ?: 0.0
                Bars(
                    ratios = data.weights.map { value ->
                        when {
                            value == null -> 0.06f
                            known.size < 2 || high == low -> 0.6f
                            else -> (0.45 + (value - low) / (high - low) * 0.45).toFloat()
                        }
                    },
                    colors = data.weights.mapIndexed { index, value ->
                        when {
                            value == null -> body.seg.copy(alpha = 0.4f)
                            index == data.weights.lastIndex -> body.fill
                            else -> body.seg
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(70.dp),
                )
            }

            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(
                    Triple("Records ce mois", "${data.recordsThisMonth}", data.topRecord ?: "Aucun pour l'instant"),
                    Triple("Régularité", "${data.activeWeeks}/${data.weeks}", "semaines actives"),
                ).forEach { (label, value, note) ->
                    Column(Modifier.weight(1f).fillMaxHeight().tinted(training.soft).padding(14.dp)) {
                        Txt(label, nt(11.5f, 600, training.textOnLight))
                        Txt(value, nt(22f, 600))
                        Txt(note, Type.small, maxLines = 1)
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().card().tap(onClick = onProgress).padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(R.drawable.lucide_trending_up, 18.dp, training.fill)
                Txt("Progression détaillée", Type.bodyStrong, Modifier.weight(1f))
                Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
            }

            Column(Modifier.fillMaxWidth().card()) {
                SettingRow(R.drawable.lucide_sun_moon, "Apparence") {
                    SegmentedPill(
                        options = listOf("Clair", "Sombre", "Auto"),
                        selected = appearance,
                        onSelect = {
                            appearance = it
                            if (it != 0) model.toast("Seul le thème clair est dessiné pour l'instant")
                        },
                        track = Neutrals.chip,
                        textStyle = nt(12f, 500),
                        selectedWeight = 600,
                        padding = 2.dp,
                        itemPadding = 3.dp,
                        itemHorizontalPadding = 9.dp,
                        fill = false,
                    )
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_bell, "Rappel du déjeuner") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Activé mais coupé dans les réglages : rien ne sonnera, on le dit.
                        if (reminderOn && !notificationsAllowed) {
                            Badge(
                                "Refusé",
                                Neutrals.chip,
                                Neutrals.muted,
                                Modifier.tap {
                                    context.startActivity(
                                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                                    )
                                },
                            )
                        }
                        NutriSwitch(reminderOn, ::toggleReminder)
                    }
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_activity, "Santé", onClick = onHealth) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        when (data.health) {
                            "active" -> Badge("Actif", training.soft, training.textOnLight)
                            "pending" -> Badge("En attente", Neutrals.chip, Neutrals.muted)
                            else -> Badge("Inactif", Neutrals.chip, Neutrals.muted)
                        }
                        Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
                    }
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_star, "Abonnement", onClick = onPremium) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (model.purchases.premium) {
                            Badge("Premium", Domains.nutrition.fill, Domains.nutrition.textOnFill)
                        } else {
                            Badge("Gratuit", Neutrals.chip, Neutrals.muted)
                        }
                        Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
                    }
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_key_round, "Compte et données", onClick = onAccount) {
                    Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
                }
            }
        }
    }
}

@Composable
private fun SettingRow(@DrawableRes icon: Int, label: String, onClick: (() -> Unit)? = null, trailing: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().then(if (onClick != null) Modifier.tap(onClick = onClick) else Modifier).padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, 17.dp, Neutrals.muted)
        Txt(label, Type.bodyStrong, Modifier.weight(1f))
        trailing()
    }
}

@Composable
private fun SettingDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
}

private val PERIODS = listOf(4 to "4 sem.", 12 to "12 sem.", 52 to "1 an")

/** Progression (C7) : tonnage et poids par semaine, puis le 1RM estimé par exercice. */
@Composable
fun ProgressScreen(model: AppModel, onBack: () -> Unit) {
    val training = Domains.training
    val body = Domains.body
    var period by rememberSaveable { mutableStateOf(1) }
    val progress = rememberLoaded(period, model.revision) { model.api.progress(PERIODS[period].first) }
    val data = progress.value
    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackRow("Moi", onBack)
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                Txt("Progression", Type.screenTitle, Modifier.weight(1f))
                SegmentedPill(
                    options = PERIODS.map { it.second },
                    selected = period,
                    onSelect = { period = it },
                    track = Neutrals.periodTrack,
                    textStyle = nt(12f, 500),
                    selectedWeight = 600,
                    padding = 2.dp,
                    itemPadding = 4.dp,
                    itemHorizontalPadding = 10.dp,
                    fill = false,
                )
            }
            if (!LoadedGate(progress) || data == null) return@ScreenColumn

            Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Txt("Tonnage et poids", nt(13f, 600), Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(training.fill))
                            Txt("tonnage", nt(11.5f, color = Neutrals.muted))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(10.dp, 3.dp).clip(RoundedCornerShape(2.dp)).background(body.fill))
                            Txt("poids", nt(11.5f, color = Neutrals.muted))
                        }
                    }
                }
                val maxVolume = data.weeks.maxOfOrNull { it.volumeKg }?.coerceAtLeast(1.0) ?: 1.0
                Box(Modifier.fillMaxWidth().height(130.dp)) {
                    Bars(
                        ratios = data.weeks.map { (it.volumeKg / maxVolume).toFloat().coerceAtLeast(0.02f) },
                        colors = data.weeks.indices.map { if (it == data.weeks.lastIndex) training.fill else training.seg },
                        modifier = Modifier.fillMaxSize(),
                        gap = if (data.period == 52) 2.dp else 6.dp,
                    )
                    val weighed = data.weights.mapIndexedNotNull { index, value -> value?.let { index to it } }
                    if (weighed.size > 1) {
                        Canvas(Modifier.fillMaxSize()) {
                            val low = weighed.minOf { it.second }
                            val high = weighed.maxOf { it.second }
                            val span = (high - low).takeIf { it > 0 } ?: 1.0
                            val column = size.width / data.weights.size.coerceAtLeast(1)
                            val path = Path()
                            weighed.forEachIndexed { i, (index, value) ->
                                // Même tracé que la page web : 20 à 90 sur une hauteur de 130.
                                val point = Offset(
                                    index * column + column / 2,
                                    size.height * (20f + ((high - value) / span).toFloat() * 70f) / 130f,
                                )
                                if (i == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
                            }
                            drawPath(path, body.fill, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
                Row(Modifier.fillMaxWidth()) {
                    val volume = data.volumeChange?.let { "${if (it > 0) "+" else if (it < 0) "−" else ""}${kotlin.math.abs(it)} %" } ?: "—"
                    val weight = data.weightChangeKg?.let { "${formatSigned(it)} kg" } ?: "—"
                    listOf(
                        Triple("${data.sessions}", "séances", training.fill),
                        Triple(volume, "tonnage", training.fill),
                        Triple(weight, "poids", body.textOnLight),
                    ).forEach { (value, label, color) ->
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            Txt(value, nt(16f, 600, color))
                            Txt(label, nt(11f, color = Neutrals.muted))
                        }
                    }
                }
            }
            if (data.exercises.isEmpty()) {
                EmptyCard("Rien sur cette période", "Aucune série enregistrée sur cette période.")
            } else {
                Column(Modifier.fillMaxWidth().card()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp)) {
                        Txt("Exercice", nt(11.5f, color = Neutrals.muted), Modifier.weight(1f))
                        Txt("1RM est.", nt(11.5f, color = Neutrals.muted), Modifier.width(72.dp), align = TextAlign.End)
                        Txt("Écart", nt(11.5f, color = Neutrals.muted), Modifier.width(72.dp), align = TextAlign.End)
                    }
                    data.exercises.forEach { exercise ->
                        SettingDivider()
                        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Txt(exercise.name, Type.bodyStrong, Modifier.weight(1f), maxLines = 1)
                            Txt(exercise.value, nt(14f, 600), Modifier.width(72.dp), align = TextAlign.End)
                            Box(Modifier.width(72.dp), contentAlignment = Alignment.CenterEnd) {
                                if (exercise.progressed) {
                                    Badge(exercise.change.orEmpty(), training.soft, training.textOnLight, size = 12f)
                                } else {
                                    Badge(exercise.change ?: "1 séance", Neutrals.chip, Neutrals.muted, size = 12f)
                                }
                            }
                        }
                    }
                }
            }
            Txt(
                "L'écart compare la dernière séance à la première de la période, sur le 1RM estimé quand l'exercice se charge.",
                nt(12f, color = Neutrals.muted),
                Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

/** Interrupteur de la maquette : 38 × 22, vert Nutrition quand il est actif. */
@Composable
private fun NutriSwitch(checked: Boolean, onToggle: () -> Unit) {
    val click = rememberSelectionClick()
    Box(
        Modifier
            .size(38.dp, 22.dp)
            .clip(CircleShape)
            .background(if (checked) Domains.nutrition.fill else Neutrals.stepTrack)
            .tap {
                click()
                onToggle()
            }
            .padding(3.dp),
        contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(Modifier.size(16.dp).clip(CircleShape).background(Neutrals.card))
    }
}
