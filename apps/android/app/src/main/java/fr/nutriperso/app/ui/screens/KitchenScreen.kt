package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.ui.components.DomainBadge
import fr.nutriperso.app.ui.components.DomainHeader
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.LinkText
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.ProgressTrack
import fr.nutriperso.app.ui.components.SegmentedPill
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.dashedBorder
import fr.nutriperso.app.ui.components.photoStripes
import fr.nutriperso.app.ui.components.rememberSelectionClick
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.components.valueWithUnit
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/** Cuisine (C3) : Plan, Recettes, Courses. Contenus d'exemple, voir [Demo]. */
@Composable
fun KitchenScreen(model: AppModel, onMe: () -> Unit) {
    val kitchen = Domains.kitchen
    var section by rememberSaveable { mutableStateOf(0) }
    val today = model.today?.today?.let(LocalDate::parse) ?: LocalDate.now()
    val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
    val shopping = remember { mutableStateListOf(*Demo.aisles.flatMap { it.second }.map { it.checked }.toTypedArray()) }

    ScreenColumn {
        DomainHeader(
            title = "Cuisine",
            subtitle = AnnotatedString("${shortDate(monday)} – ${shortDate(monday.plusDays(6))}"),
            initials = initialsOf(model.today?.identity),
            onAvatar = onMe,
            badge = DomainBadge(R.drawable.lucide_utensils, kitchen),
        )
        SegmentedPill(
            options = listOf("Plan", "Recettes", "Courses"),
            selected = section,
            onSelect = { section = it },
            track = kitchen.soft,
            textColor = kitchen.textOnLight,
            selectedTextColor = kitchen.textOnLight,
            badges = mapOf(2 to "${shopping.count { !it }}"),
        )
        when (section) {
            0 -> PlanSection(monday, today, shopping.count { it }, shopping.size, onChoose = { section = 1 })
            1 -> RecipesSection()
            else -> ShoppingSection(shopping)
        }
    }
}

private val shortFormat = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)

private fun shortDate(date: LocalDate): String = date.format(shortFormat)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanSection(monday: LocalDate, today: LocalDate, bought: Int, toBuy: Int, onChoose: () -> Unit) {
    val kitchen = Domains.kitchen
    val placed = Demo.week.sumOf { day -> listOf(day.lunch, day.dinner).count { it.label != null } }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StatTile("Plats choisis", "${Demo.dishes.size}", null, null, Modifier.weight(1f))
        StatTile("Repas placés", "$placed", " / 14", placed / 14f, Modifier.weight(1f))
        StatTile("Courses", "$bought", " / $toBuy", bought / toBuy.coerceAtLeast(1).toFloat(), Modifier.weight(1f))
    }
    Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Txt("À cuisiner", nt(13f, 600), Modifier.weight(1f))
            LinkText("Choisir des plats", kitchen.textOnLight, onChoose)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Demo.dishes.forEach { (name, count) ->
                Txt(
                    buildAnnotatedString {
                        append("$name ")
                        withStyle(SpanStyle(fontWeight = FontWeight.W700, color = kitchen.textOnLight)) { append(count) }
                    },
                    nt(12.5f),
                    Modifier.tinted(kitchen.soft, Radius.small).padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
    Column(Modifier.fillMaxWidth().card()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
            Spacer(Modifier.width(52.dp))
            Txt("Midi", nt(11.5f, color = Neutrals.muted), Modifier.weight(1f))
            Txt("Soir", nt(11.5f, color = Neutrals.muted), Modifier.weight(1f))
        }
        Demo.week.forEachIndexed { index, day ->
            val date = monday.plusDays(index.toLong())
            val isToday = date == today
            Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            Row(
                Modifier.fillMaxWidth().background(if (isToday) kitchen.soft else Color.Transparent).padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Txt(
                    dayLabel(date),
                    if (isToday) nt(12f, 700, kitchen.textOnLight) else nt(12f, color = Neutrals.muted),
                    Modifier.width(46.dp),
                )
                PlanCellView(day.lunch, Modifier.weight(1f))
                PlanCellView(day.dinner, Modifier.weight(1f))
            }
        }
    }
}

private val dayFormat = DateTimeFormatter.ofPattern("EEE d", Locale.FRENCH)

private fun dayLabel(date: LocalDate): String =
    date.format(dayFormat).replace(".", "").replaceFirstChar { it.titlecase(Locale.FRENCH) }

@Composable
private fun PlanCellView(cell: Demo.PlanCell, modifier: Modifier) {
    val kitchen = Domains.kitchen
    val shape = RoundedCornerShape(8.dp)
    val padded = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
    when (cell.state) {
        Demo.CellState.None -> Txt("—", nt(12f, color = Neutrals.faint), modifier)
        Demo.CellState.Empty -> Txt("+", nt(12f, color = kitchen.textOnLight), modifier.dashedBorder(kitchen.seg, 8.dp).then(padded))
        Demo.CellState.Planned -> Txt(cell.label.orEmpty(), nt(12f), modifier.clip(shape).background(kitchen.soft).then(padded), maxLines = 1)
        Demo.CellState.Today -> Txt(cell.label.orEmpty(), nt(12f, 600, kitchen.textOnFill), modifier.clip(shape).background(kitchen.fill).then(padded), maxLines = 1)
        Demo.CellState.Past -> Txt(
            cell.label.orEmpty(),
            nt(12f, color = Neutrals.faint).merge(androidx.compose.ui.text.TextStyle(textDecoration = TextDecoration.LineThrough)),
            modifier.clip(shape).background(Neutrals.chip).then(padded),
            maxLines = 1,
        )
    }
}

/** Petite tuile chiffrée, avec mini-barre facultative. */
@Composable
fun StatTile(
    label: String,
    value: String,
    unit: String?,
    progress: Float?,
    modifier: Modifier,
    background: Color? = null,
    labelColor: Color = Neutrals.muted,
    labelWeight: Int = 400,
    valueSize: Float = 18f,
    footer: (@Composable () -> Unit)? = null,
) {
    val kitchen = Domains.kitchen
    Column(
        modifier
            .then(if (background == null) Modifier.card(Radius.tile) else Modifier.tinted(background, Radius.tile))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Txt(label, nt(11.5f, labelWeight, labelColor), maxLines = 1)
        Txt(if (unit == null) AnnotatedString(value) else valueWithUnit(value, unit), nt(valueSize, 600))
        if (progress != null) ProgressTrack(progress, kitchen.soft, kitchen.fill, 4.dp, Modifier.padding(top = 4.dp))
        footer?.invoke()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecipesSection() {
    val kitchen = Domains.kitchen
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(0) }
    val filters = listOf("Tout", "Rapide", "Léger", "Favoris")
    NutriField(
        query,
        { query = it },
        placeholder = "Chercher une recette",
        height = 46.dp,
        background = kitchen.soft,
        border = null,
        leadingIcon = R.drawable.lucide_search,
        leadingTint = kitchen.textOnLight,
        focusColor = kitchen.textOnLight,
        textSize = 14f,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        filters.forEachIndexed { index, label ->
            val active = index == filter
            Txt(
                label,
                nt(13f, if (active) 600 else 500, if (active) kitchen.textOnFill else kitchen.textOnLight),
                Modifier.clip(CircleShape).background(if (active) kitchen.fill else kitchen.soft).tap { filter = index }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            )
        }
    }
    val shown = Demo.recipes.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
    shown.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            pair.forEach { recipe ->
                Column(Modifier.weight(1f).card(Radius.tile)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(1.3f).clip(RoundedCornerShape(topStart = Radius.tile, topEnd = Radius.tile)).photoStripes(kitchen.soft, kitchen.seg))
                    Column(Modifier.padding(10.dp)) {
                        Txt(recipe.name, nt(14f, 600, line = 1.25f), maxLines = 2)
                        Txt("${recipe.kcal} kcal · ${recipe.minutes} min", Type.small)
                    }
                }
            }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun ShoppingSection(checked: MutableList<Boolean>) {
    val kitchen = Domains.kitchen
    val click = rememberSelectionClick()
    val done = checked.count { it }
    Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Txt("Panier", nt(13f, 600), Modifier.weight(1f))
            Txt("$done / ${checked.size}", nt(13f, 600, kitchen.textOnLight))
        }
        ProgressTrack(done / checked.size.coerceAtLeast(1).toFloat(), kitchen.soft, kitchen.fill, 7.dp)
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("Scanner pour cocher" to R.drawable.lucide_scan_barcode, "Un article" to R.drawable.lucide_plus).forEach { (label, icon) ->
            Row(
                Modifier.weight(1f).tinted(kitchen.soft, Radius.tile).padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(icon, 18.dp, kitchen.textOnLight)
                Txt(label, nt(13f, 600, kitchen.textOnLight), maxLines = 1)
            }
        }
    }
    var offset = 0
    Demo.aisles.forEach { (aisle, items) ->
        val start = offset
        offset += items.size
        Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 4.dp)) {
            Txt(aisle.uppercase(), Type.sectionCaps, Modifier.padding(top = 10.dp, bottom = 4.dp))
            items.forEachIndexed { index, item ->
                val position = start + index
                val isChecked = checked[position]
                Row(
                    Modifier.fillMaxWidth().tap {
                        click()
                        checked[position] = !isChecked
                    }.padding(vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(
                        Modifier
                            .size(20.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isChecked) kitchen.fill else Color.Transparent)
                            .then(if (isChecked) Modifier else Modifier.border(1.5.dp, Neutrals.radioBorder, RoundedCornerShape(6.dp))),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (isChecked) Icon(R.drawable.lucide_check, 13.dp, kitchen.textOnFill)
                    }
                    Txt(
                        item.name,
                        if (isChecked) nt(14f, color = Neutrals.faint).merge(androidx.compose.ui.text.TextStyle(textDecoration = TextDecoration.LineThrough)) else nt(14f, 500),
                        Modifier.weight(1f),
                    )
                    Txt(item.quantity, nt(12.5f, color = Neutrals.muted))
                }
            }
        }
    }
}
