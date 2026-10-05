package fr.aars.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import fr.aars.app.AppModel
import fr.aars.app.Meal
import fr.aars.app.R
import fr.aars.app.data.ApiResult
import fr.aars.app.data.DayTotals
import fr.aars.app.data.Entry
import fr.aars.app.ui.components.Bars
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.MacroBar
import fr.aars.app.ui.components.MacroSplit
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.formatInt
import fr.aars.app.ui.components.rememberSelectionClick
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Macros
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

private const val PAGE = 30

@Composable
fun BackLink(label: String, onBack: () -> Unit) {
    Row(
        Modifier.offset(x = (-6).dp).tap(onClick = onBack),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(R.drawable.lucide_chevron_left, 20.dp, Neutrals.ink)
        Txt(label, nt(14f, 500))
    }
}

private val monthFormat = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH)

/** Historique : moyenne, jours notés, trente jours en barres avec la cible, puis la liste des jours. */
@Composable
fun HistoryScreen(model: AppModel, onBack: () -> Unit, onDay: (String) -> Unit) {
    val nutrition = Domains.nutrition
    val scope = rememberCoroutineScope()
    val days = remember { mutableStateListOf<DayTotals>() }
    var loaded by remember { mutableStateOf(false) }
    var more by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load(offset: Int) {
        when (val result = model.api.history(offset, PAGE)) {
            is ApiResult.Ok -> {
                if (offset == 0) days.clear()
                days.addAll(result.value.days)
                more = result.value.days.size == PAGE
                error = null
            }
            is ApiResult.Failed -> error = result.message
        }
        loaded = true
    }
    LaunchedEffect(model.revision) { load(0) }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackLink("Aujourd'hui", onBack)
            Column(Modifier.padding(horizontal = 4.dp)) {
                Txt("Historique", Type.screenTitle)
                days.firstOrNull()?.let {
                    Txt(LocalDate.parse(it.entryDate).format(monthFormat).replaceFirstChar { c -> c.titlecase(Locale.FRENCH) }, Type.secondary)
                }
            }
            error?.let { fr.aars.app.ui.components.ErrorBanner(it) { scope.launch { load(0) } } }
            if (!loaded) return@ScreenColumn
            if (days.isEmpty()) {
                EmptyCard("Rien d'enregistré", "Les jours notés apparaîtront ici.")
                return@ScreenColumn
            }

            val target = model.today?.target?.targetKcal
            val recent = days.take(PAGE)
            val noted = recent.filter { it.entryCount > 0 }
            val average = if (noted.isEmpty()) 0.0 else noted.sumOf { it.macros.kcal } / noted.size
            Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Txt("Moyenne", nt(11.5f, 600, nutrition.textOnLight))
                        Txt("${formatInt(average)} kcal", nt(22f, 600, tracking = -0.02f))
                    }
                    Column(Modifier.weight(1f)) {
                        Txt("Jours notés", nt(11.5f, 600, nutrition.textOnLight))
                        Txt("${noted.size}", nt(22f, 600, tracking = -0.02f))
                    }
                }
                // Trente jours, le plus ancien à gauche ; la cible en pointillé.
                val ordered = recent.reversed()
                val top = maxOf(target ?: 0.0, ordered.maxOf { it.macros.kcal }).coerceAtLeast(1.0)
                Box(Modifier.fillMaxWidth().height(90.dp)) {
                    Bars(
                        ratios = ordered.map { (it.macros.kcal / top).toFloat().coerceAtLeast(0.03f) },
                        colors = ordered.indices.map { if (it == ordered.lastIndex) nutrition.fill else nutrition.light },
                        modifier = Modifier.fillMaxSize(),
                        gap = 3.dp,
                        radius = 3.dp,
                    )
                    if (target != null) {
                        Canvas(Modifier.fillMaxSize()) {
                            val y = size.height * (1f - (target / top).toFloat())
                            drawLine(
                                Neutrals.muted, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.5.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())),
                            )
                        }
                    }
                }
                if (target != null) Txt("Pointillé : ta cible, ${formatInt(target)} kcal", nt(11.5f, color = Neutrals.muted))
            }

            Txt("Par jour", nt(12.5f, color = Neutrals.muted), Modifier.padding(horizontal = 4.dp))
            Column(Modifier.fillMaxWidth().card()) {
                days.forEachIndexed { index, day ->
                    if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
                    Row(
                        Modifier.fillMaxWidth().tap { onDay(day.entryDate) }.padding(horizontal = 14.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Txt(formatLongDate(day.entryDate), Type.bodyStrong)
                            Txt("${day.entryCount} entrée${if (day.entryCount > 1) "s" else ""}", Type.small)
                        }
                        MacroSplit(day.macros.proteinG, day.macros.carbsG, day.macros.fatG)
                        Txt(formatInt(day.macros.kcal), nt(14f, 600), Modifier.width(58.dp), align = TextAlign.End)
                        Spacer(Modifier.width(6.dp))
                        Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
                    }
                }
            }
            if (more) {
                Txt(
                    "Voir plus",
                    nt(14f, 600, nutrition.textOnLight),
                    Modifier.fillMaxWidth().tap { scope.launch { load(days.size) } }.padding(10.dp),
                    align = TextAlign.Center,
                )
            }
        }
    }
}

/** Un jour passé : totaux, macros, repas. En lecture seule, les valeurs sont figées. */
@Composable
fun DayScreen(model: AppModel, date: String, onBack: () -> Unit) {
    val day = rememberLoaded(date) { model.api.journal(date) }
    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackLink("Historique", onBack)
            Txt(formatLongDate(date), Type.screenTitle, Modifier.padding(horizontal = 4.dp))
            if (!LoadedGate(day)) return@ScreenColumn
            val data = day.value ?: return@ScreenColumn
            if (data.entries.isEmpty()) {
                EmptyCard("Aucune entrée", "Rien n'a été noté ce jour-là.")
                return@ScreenColumn
            }
            Column(Modifier.fillMaxWidth().card().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Txt("${formatInt(data.totals.macros.kcal)} kcal", nt(24f, 700, Domains.nutrition.textOnLight, tracking = -0.03f))
                MacroBar("Protéines", data.totals.macros.proteinG, null, Macros.protein)
                MacroBar("Glucides", data.totals.macros.carbsG, null, Macros.carbs)
                MacroBar("Lipides", data.totals.macros.fatG, null, Macros.fat)
            }
            MealJournal(data.entries, onDelete = null, onFavorite = null)
            Txt(
                "Journée clôturée. Les valeurs sont figées à l'écriture.",
                nt(12.5f, color = Neutrals.muted),
                Modifier.fillMaxWidth(),
                align = TextAlign.Center,
            )
        }
    }
}

/**
 * Les repas d'un jour, chacun dépliable sur ses aliments. Sur le jour même,
 * une entrée se supprime et un repas se garde en favori.
 */
@Composable
fun MealJournal(entries: List<Entry>, onDelete: ((Entry) -> Unit)?, onFavorite: ((Meal) -> Unit)?) {
    val click = rememberSelectionClick()
    var open by remember { mutableStateOf<Meal?>(null) }
    var confirm by remember { mutableStateOf<Long?>(null) }
    val byMeal = Meal.entries.mapNotNull { meal ->
        val items = entries.filter { Meal.fromApi(it.meal) == meal }
        if (items.isEmpty()) null else meal to items
    }
    Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 4.dp)) {
        byMeal.forEachIndexed { index, (meal, items) ->
            Row(
                Modifier.fillMaxWidth().tap {
                    click()
                    open = if (open == meal) null else meal
                }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Txt(meal.label, Type.bodyStrong)
                    if (open != meal) Txt(items.joinToString(", ") { it.foodLabel }, nt(12f, color = Neutrals.muted), maxLines = 1)
                }
                Spacer(Modifier.width(10.dp))
                MacroSplit(items.sumOf { it.macros.proteinG }, items.sumOf { it.macros.carbsG }, items.sumOf { it.macros.fatG })
                Txt(formatInt(items.sumOf { it.macros.kcal }), nt(14f, 600), Modifier.width(54.dp), align = TextAlign.End)
            }
            if (open == meal) {
                Column(Modifier.padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    items.forEach { entry ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Txt(entry.foodLabel, nt(13.5f, 500), maxLines = 2)
                                Txt("${formatInt(entry.quantityG)} g", nt(12f, color = Neutrals.muted))
                            }
                            Txt("${formatInt(entry.macros.kcal)} kcal", nt(13f, 600))
                            if (onDelete != null) {
                                Spacer(Modifier.width(10.dp))
                                val confirming = confirm == entry.id
                                Txt(
                                    if (confirming) "Supprimer ?" else "Retirer",
                                    nt(12.5f, 600, if (confirming) Macros.protein.text else Neutrals.muted),
                                    Modifier.tap {
                                        if (confirming) {
                                            confirm = null
                                            onDelete(entry)
                                        } else {
                                            confirm = entry.id
                                        }
                                    }.padding(4.dp),
                                )
                            }
                        }
                    }
                    if (onFavorite != null) {
                        Row(
                            Modifier.tap { onFavorite(meal) }.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(R.drawable.lucide_star, 15.dp, Domains.kitchen.textOnLight)
                            Txt("Garder ce repas en favori", nt(13f, 600, Domains.kitchen.textOnLight))
                        }
                    }
                }
            }
            if (index < byMeal.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
        }
    }
}
