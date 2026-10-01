package fr.nutriperso.app.ui.screens

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
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

/** Moi (C6) : identité, poids, records, régularité, réglages. */
@Composable
fun MeScreen(model: AppModel, onBack: () -> Unit, onProgress: () -> Unit, onWeigh: () -> Unit) {
    val body = Domains.body
    val training = Domains.training
    val data = model.today
    val identity = data?.identity
    val weight = data?.weight
    var appearance by rememberSaveable { mutableStateOf(0) }
    var lunchReminder by rememberSaveable { mutableStateOf(true) }
    val click = rememberSelectionClick()

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackRow("Retour", onBack) { Icon(R.drawable.lucide_settings, 20.dp, Neutrals.muted) }
            Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(initialsOf(identity), size = 48.dp, background = body.fill, foreground = Color.White, fontSize = 16f)
                Column {
                    Txt(identity?.displayName ?: identity?.handle ?: "Moi", nt(22f, 600, line = 1.2f, tracking = -0.03f))
                    val planned = data?.activity?.sessionsPlanned ?: 0
                    Txt(
                        listOfNotNull(identity?.handle?.let { "@$it" }, if (planned > 0) "$planned séances par semaine" else null)
                            .joinToString(" · "),
                        Type.secondary,
                    )
                }
            }

            Column(Modifier.fillMaxWidth().tinted(body.soft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Txt("Poids · dernière pesée", nt(11.5f, 600, body.textOnLight))
                        Txt(
                            valueWithUnit(
                                weight?.let { formatKg(it.latestKg) } ?: "—",
                                " kg",
                                unitSize = 13f,
                                extra = weight?.changeKg?.let { formatSigned(it) },
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
                val weeks = weight?.weeks.orEmpty()
                val known = weeks.filterNotNull()
                if (known.size >= 2) {
                    val min = known.min()
                    val span = (known.max() - min).takeIf { it > 0 } ?: 1.0
                    Bars(
                        ratios = weeks.map { value -> if (value == null) 0.04f else (0.5 + 0.35 * (value - min) / span).toFloat() },
                        colors = weeks.indices.map { if (it == weeks.lastIndex) body.fill else body.seg },
                        modifier = Modifier.fillMaxWidth().height(70.dp),
                    )
                } else {
                    Txt("Deux semaines de pesées, et la tendance s'affiche ici.", nt(12.5f, color = Neutrals.muted))
                }
            }

            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(Triple("Records ce mois", "3", "Squat 90 kg × 5"), Triple("Régularité", "11/12", "semaines actives")).forEach { (label, value, note) ->
                    Column(Modifier.weight(1f).fillMaxHeight().tinted(training.soft).padding(14.dp)) {
                        Txt(label, nt(11.5f, 600, training.textOnLight))
                        Txt(value, nt(22f, 600))
                        Txt(note, Type.small)
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
                    Switch(lunchReminder) {
                        click()
                        lunchReminder = it
                    }
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_activity, "Santé") {
                    Badge("Bientôt", training.soft, training.textOnLight)
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_key_round, "Compte et données") {
                    Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
                }
                SettingDivider()
                SettingRow(R.drawable.lucide_log_out, "Se déconnecter", onClick = model::signOut) {}
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

/** Interrupteur de 38 × 22, vert Nutrition quand il est actif. */
@Composable
private fun Switch(on: Boolean, onChange: (Boolean) -> Unit) {
    Box(
        Modifier.size(38.dp, 22.dp).clip(CircleShape).background(if (on) Domains.nutrition.fill else Neutrals.track).tap { onChange(!on) }.padding(3.dp),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(Modifier.size(16.dp).clip(CircleShape).background(Neutrals.card))
    }
}

/** Progression (C7) : tonnage et poids, puis le 1RM estimé par exercice. Exemple, voir [Demo]. */
@Composable
fun ProgressScreen(onBack: () -> Unit) {
    val training = Domains.training
    val body = Domains.body
    var period by rememberSaveable { mutableStateOf(1) }
    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackRow("Moi", onBack)
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                Txt("Progression", Type.screenTitle, Modifier.weight(1f))
                SegmentedPill(
                    options = listOf("4 sem.", "12 sem.", "1 an"),
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
                Box(Modifier.fillMaxWidth().height(130.dp)) {
                    Bars(
                        ratios = Demo.tonnage,
                        colors = Demo.tonnage.indices.map { if (it == Demo.tonnage.lastIndex) training.fill else training.seg },
                        modifier = Modifier.fillMaxSize(),
                        gap = 6.dp,
                    )
                    Canvas(Modifier.fillMaxSize()) {
                        val points = Demo.weightCurve
                        val step = size.width / points.size
                        val path = Path()
                        points.forEachIndexed { index, y ->
                            val point = Offset(step * index + step / 2, size.height * y / 130f)
                            if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
                        }
                        drawPath(path, body.fill, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
                Row(Modifier.fillMaxWidth()) {
                    listOf(Triple("31", "séances", training.fill), Triple("+9 %", "tonnage", training.fill), Triple("−1,8 kg", "poids", body.textOnLight))
                        .forEach { (value, label, color) ->
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                Txt(value, nt(16f, 600, color))
                                Txt(label, nt(11f, color = Neutrals.muted))
                            }
                        }
                }
            }
            Column(Modifier.fillMaxWidth().card()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp)) {
                    Txt("Exercice", nt(11.5f, color = Neutrals.muted), Modifier.weight(1f))
                    Txt("1RM est.", nt(11.5f, color = Neutrals.muted), Modifier.width(64.dp), align = TextAlign.End)
                    Txt("Écart", nt(11.5f, color = Neutrals.muted), Modifier.width(60.dp), align = TextAlign.End)
                }
                Demo.lifts.forEach { lift ->
                    SettingDivider()
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Txt(lift.name, Type.bodyStrong, Modifier.weight(1f))
                        Txt(lift.oneRm, nt(14f, 600), Modifier.width(64.dp), align = TextAlign.End)
                        Box(Modifier.width(60.dp), contentAlignment = Alignment.CenterEnd) {
                            if (lift.delta == null) {
                                Badge("=", Neutrals.chip, Neutrals.muted, size = 12f)
                            } else {
                                Badge(lift.delta, training.soft, training.textOnLight, size = 12f)
                            }
                        }
                    }
                }
            }
        }
    }
}
