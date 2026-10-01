package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.Meal
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ActivitySummary
import fr.nutriperso.app.data.Entry
import fr.nutriperso.app.data.PlannedMeal
import fr.nutriperso.app.data.QuickSession
import fr.nutriperso.app.data.TodayResponse
import fr.nutriperso.app.data.WeightSummary
import fr.nutriperso.app.ui.components.DomainHeader
import fr.nutriperso.app.ui.components.ErrorBanner
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.LinkText
import fr.nutriperso.app.ui.components.MacroBar
import fr.nutriperso.app.ui.components.MacroSplit
import fr.nutriperso.app.ui.components.Ring
import fr.nutriperso.app.ui.components.SegmentDots
import fr.nutriperso.app.ui.components.Sparkline
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.formatInt
import fr.nutriperso.app.ui.components.formatKg
import fr.nutriperso.app.ui.components.formatSigned
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.components.valueWithUnit
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Macros
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt

/** Aujourd'hui (C1) : la semaine, la jauge du jour, quatre tuiles, les repas notés. */
@Composable
fun TodayScreen(
    model: AppModel,
    onMe: () -> Unit,
    onPick: (AddSheet) -> Unit,
    onOpenTab: (Tab) -> Unit,
) {
    val data = model.today
    ScreenColumn {
        DomainHeader(
            title = "Aujourd'hui",
            subtitle = buildAnnotatedString {
                if (data != null) append(formatLongDate(data.today))
                if (data?.target?.trainingDay == true) {
                    append(" · ")
                    withStyle(SpanStyle(color = Domains.training.textOnLight, fontWeight = FontWeight.W600)) {
                        append("jour d'entraînement")
                    }
                }
            },
            initials = initialsOf(data?.identity),
            onAvatar = onMe,
        )
        model.todayError?.let { ErrorBanner(it, onRetry = model::refreshToday) }
        if (data == null) {
            Skeletons()
            return@ScreenColumn
        }
        if (model.welcome) WelcomeCard(data)
        WeekStrip(data, onHistory = { model.toast("L'historique arrive dans une prochaine version") })
        CalorieCard(data, onEditTarget = { model.toast("La modification de l'objectif arrive bientôt") })
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SessionTile(data.session, Modifier.weight(1f).fillMaxHeight()) { onPick(AddSheet.Session) }
            PlannedTile(
                data.plannedMeal,
                Modifier.weight(1f).fillMaxHeight(),
                onEat = { meal -> model.eatPlanned(meal.planId, meal.name) },
                onPlan = { onOpenTab(Tab.Kitchen) },
            )
        }
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            WeightTile(data.weight, Modifier.weight(1f).fillMaxHeight()) { onPick(AddSheet.Weigh) }
            ActivityTile(data.activity, Modifier.weight(1f).fillMaxHeight())
        }
        if (data.entries.isEmpty()) EmptyJournal() else MealsCard(data.entries)
    }
}

@Composable
private fun WeekStrip(data: TodayResponse, onHistory: () -> Unit) {
    val nutrition = Domains.nutrition
    val reference = data.target?.targetKcal ?: (data.week.maxOfOrNull { it.kcal } ?: 1.0)
    Column(
        Modifier.fillMaxWidth().card().padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Txt("Semaine ${data.isoWeek}", nt(12f, color = Neutrals.muted))
            LinkText("Historique", nutrition.textOnLight, onHistory, size = 12f, chevron = true)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            data.week.forEach { day ->
                val isToday = day.day == data.today
                val isPast = day.day < data.today
                val ratio = (day.kcal / reference.coerceAtLeast(1.0)).toFloat().coerceIn(0f, 1f)
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.fillMaxWidth().height(30.dp), contentAlignment = Alignment.BottomCenter) {
                        val empty = !isToday && (!isPast || ratio == 0f)
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .then(if (empty || ratio == 0f) Modifier.height(3.dp) else Modifier.fillMaxHeight(ratio.coerceAtLeast(0.1f)))
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    when {
                                        isToday && ratio > 0f -> nutrition.fill
                                        isPast && ratio > 0f -> nutrition.light
                                        else -> Neutrals.emptyBar
                                    },
                                ),
                        )
                    }
                    Txt(
                        formatDayInitial(day.day),
                        when {
                            isToday -> nt(11f, 700, nutrition.textOnLight)
                            isPast -> nt(11f, color = Neutrals.muted)
                            else -> nt(11f, color = Neutrals.faint)
                        },
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun CalorieCard(data: TodayResponse, onEditTarget: () -> Unit) {
    val nutrition = Domains.nutrition
    val target = data.target
    val eaten = data.totals.kcal
    Column(
        Modifier.fillMaxWidth().card().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            val fraction = if (target == null) 0f else (eaten / target.targetKcal).toFloat()
            Ring(112.dp, 10.dp, nutrition.seg, listOf(fraction to nutrition.fill)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (target == null) {
                        Txt(formatInt(eaten), Type.ringValue)
                        Txt("mangées", nt(11f, color = Neutrals.muted))
                    } else {
                        val remaining = target.targetKcal - eaten
                        Txt(formatInt(kotlin.math.abs(remaining)), Type.ringValue)
                        Txt(if (remaining >= 0) "restantes" else "en trop", nt(11f, color = Neutrals.muted))
                    }
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                MacroBar("Protéines", data.totals.proteinG, target?.proteinG, Macros.protein)
                MacroBar("Glucides", data.totals.carbsG, target?.carbsG, Macros.carbs)
                MacroBar("Lipides", data.totals.fatG, target?.fatG, Macros.fat)
            }
        }
        Column {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(top = 12.dp)) {
                StatColumn(formatInt(eaten), "mangées", Modifier.weight(1f))
                Box(Modifier.width(1.dp).fillMaxHeight().background(Neutrals.divider))
                StatColumn(
                    target?.let { formatInt(it.targetKcal) } ?: "—",
                    "cible · modifier",
                    Modifier.weight(1f).tap(onClick = onEditTarget),
                    labelStyle = nt(11.5f, 500, nutrition.textOnLight),
                )
                Box(Modifier.width(1.dp).fillMaxHeight().background(Neutrals.divider))
                val cycle = target?.cycleKcal ?: 0.0
                StatColumn(
                    if (cycle == 0.0) "—" else formatSigned(cycle, 0),
                    "entraînement",
                    Modifier.weight(1f),
                    valueColor = Domains.training.textOnLight,
                )
            }
        }
    }
}

@Composable
private fun StatColumn(
    value: String,
    label: String,
    modifier: Modifier,
    valueColor: Color = Neutrals.ink,
    labelStyle: androidx.compose.ui.text.TextStyle = nt(11.5f, color = Neutrals.muted),
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Txt(value, nt(16f, 600, valueColor), align = TextAlign.Center)
        Txt(label, labelStyle, align = TextAlign.Center)
    }
}

@Composable
private fun TileHeader(label: String, icon: Int, color: Color, weight: Int = 600, alpha: Float = 1f) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Txt(label, nt(11.5f, weight, color), Modifier.weight(1f).graphicsLayer { this.alpha = alpha })
        Icon(icon, 16.dp, color)
    }
}

@Composable
private fun SessionTile(session: QuickSession?, modifier: Modifier, onStart: () -> Unit) {
    val training = Domains.training
    Column(
        modifier.heightIn(min = 128.dp).tinted(training.fill).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TileHeader(
            if (session?.kind == "open") "Séance en cours" else "Séance du jour",
            R.drawable.lucide_dumbbell,
            training.textOnFill,
            weight = 500,
            alpha = 0.85f,
        )
        Txt(session?.name ?: "Aucune séance prévue", nt(16f, 600, training.textOnFill, line = 1.2f), Modifier.weight(1f))
        PillButton(
            if (session?.kind == "open") "Reprendre" else "Commencer",
            background = Color.White,
            foreground = training.fill,
            icon = R.drawable.lucide_play,
            onClick = onStart,
        )
    }
}

@Composable
private fun PlannedTile(meal: PlannedMeal?, modifier: Modifier, onEat: (PlannedMeal) -> Unit, onPlan: () -> Unit) {
    val kitchen = Domains.kitchen
    Column(
        modifier.heightIn(min = 128.dp).tinted(kitchen.soft).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TileHeader(if (meal?.meal == "lunch") "Ce midi" else "Ce soir", R.drawable.lucide_cooking_pot, kitchen.textOnLight)
        Column(Modifier.weight(1f)) {
            Txt(meal?.name ?: "Rien de prévu", nt(15f, 600, line = 1.2f))
            if (meal != null) {
                val parts = if (meal.servings == 1.0) "1 part" else "${formatKg(meal.servings).removeSuffix(",0")} parts"
                Txt(listOfNotNull(meal.kcal?.let { "${formatInt(it)} kcal" }, parts).joinToString(" · "), Type.small)
            }
        }
        when {
            meal == null -> PillButton("Planifier", kitchen.fill, kitchen.textOnFill, onClick = onPlan)
            meal.eaten -> PillButton("Mangé", kitchen.seg, kitchen.textOnLight, onClick = {}, enabled = false)
            else -> PillButton("Manger", kitchen.fill, kitchen.textOnFill, onClick = { onEat(meal) })
        }
    }
}

@Composable
private fun WeightTile(weight: WeightSummary?, modifier: Modifier, onWeigh: () -> Unit) {
    val body = Domains.body
    Column(
        modifier.tinted(body.soft).tap(onClick = onWeigh).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TileHeader("Poids", R.drawable.lucide_scale, body.textOnLight)
        if (weight == null) {
            Txt("—", nt(20f, 600, tracking = -0.02f))
            Txt("Touche pour te peser", nt(11.5f, color = Neutrals.muted))
        } else {
            Txt(
                valueWithUnit(
                    formatKg(weight.latestKg),
                    " kg",
                    extra = weight.changeKg?.let { formatSigned(it) },
                    extraColor = body.textOnLight,
                ),
                nt(20f, 600, tracking = -0.02f),
            )
            Sparkline(weight.weeks, body.fill, Modifier.fillMaxWidth().height(22.dp))
        }
    }
}

@Composable
private fun ActivityTile(activity: ActivitySummary, modifier: Modifier) {
    val body = Domains.body
    val training = Domains.training
    Column(modifier.tinted(body.soft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        TileHeader("Activité (Santé)", R.drawable.lucide_flame, body.textOnLight)
        Txt(
            valueWithUnit(activity.activeKcal?.let { formatInt(it) } ?: "—", " kcal"),
            nt(20f, 600, tracking = -0.02f),
        )
        if (activity.sessionsPlanned > 0) {
            SegmentDots(activity.sessionsDone, activity.sessionsPlanned, training.fill, training.seg, 5.dp)
            Txt("${activity.sessionsDone} séance${if (activity.sessionsDone > 1) "s" else ""} sur ${activity.sessionsPlanned}", nt(11.5f, color = Neutrals.muted))
        }
    }
}

@Composable
fun PillButton(
    text: String,
    background: Color,
    foreground: Color,
    modifier: Modifier = Modifier,
    icon: Int? = null,
    height: androidx.compose.ui.unit.Dp = 32.dp,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier.fillMaxWidth().height(height).clip(CircleShape).background(background).tap(enabled = enabled, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, 12.dp, foreground)
            Spacer(Modifier.width(6.dp))
        }
        Txt(text, nt(12.5f, 700, foreground))
    }
}

@Composable
private fun MealsCard(entries: List<Entry>) {
    val byMeal = Meal.entries.mapNotNull { meal ->
        val items = entries.filter { Meal.fromApi(it.meal) == meal }
        if (items.isEmpty()) null else meal to items
    }
    Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 4.dp)) {
        byMeal.forEachIndexed { index, (meal, items) ->
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(meal.label, Type.bodyStrong)
                    Txt(items.joinToString(", ") { it.foodLabel }, nt(12f, color = Neutrals.muted), maxLines = 1)
                }
                Spacer(Modifier.width(10.dp))
                MacroSplit(items.sumOf { it.macros.proteinG }, items.sumOf { it.macros.carbsG }, items.sumOf { it.macros.fatG })
                Txt(formatInt(items.sumOf { it.macros.kcal }), nt(14f, 600), Modifier.width(54.dp), align = TextAlign.End)
            }
            if (index < byMeal.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
        }
    }
}

@Composable
private fun EmptyJournal() {
    Column(Modifier.fillMaxWidth().card().padding(16.dp)) {
        Txt("Rien de noté pour l'instant", nt(15f, 600))
        Txt("Touche + puis Repas : scanne un code-barres, cherche un nom, ou photographie l'assiette.", nt(13f, color = Neutrals.muted))
    }
}

/** La carte d'arrivée (O4), juste après l'onboarding. */
@Composable
private fun WelcomeCard(data: TodayResponse) {
    val name = data.identity.displayName ?: data.identity.handle
    Column(
        Modifier.fillMaxWidth().card(radius = Radius.sessionCard).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Txt(if (name != null) "C'est prêt, $name" else "C'est prêt", nt(15f, 600), Modifier.weight(1f))
            Txt("3 sur 3", Type.small)
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            data.target?.let { CheckLine(Domains.nutrition.fill, Domains.nutrition.textOnFill, "Cible : ${formatInt(it.targetKcal)} kcal par jour") }
            data.identity.handle?.let { CheckLine(Domains.community.fill, Domains.community.textOnFill, "Profil : @$it") }
            if (data.activity.sessionsPlanned > 0) {
                CheckLine(Domains.training.fill, Domains.training.textOnFill, "Programme : ${data.activity.sessionsPlanned} séances par semaine")
            }
        }
    }
}

@Composable
fun CheckLine(fill: Color, tint: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(fill), contentAlignment = Alignment.Center) {
            Icon(R.drawable.lucide_check, 12.dp, tint)
        }
        Txt(text, nt(13.5f))
    }
}

/** Squelettes aux dimensions des cartes, couleur piste. */
@Composable
private fun Skeletons() {
    listOf(70.dp, 190.dp, 128.dp, 96.dp).forEach { height ->
        Box(Modifier.fillMaxWidth().height(height).tinted(Neutrals.track))
    }
}
