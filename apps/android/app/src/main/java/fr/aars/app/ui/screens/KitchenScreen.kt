package fr.aars.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import fr.aars.app.AppModel
import fr.aars.app.Meal
import fr.aars.app.R
import fr.aars.app.data.ApiResult
import fr.aars.app.data.BasketRow
import fr.aars.app.data.CatalogMealRow
import fr.aars.app.data.PlannedRow
import fr.aars.app.data.RecipeRow
import fr.aars.app.data.ShoppingItemRow
import fr.aars.app.ui.components.Badge
import fr.aars.app.ui.components.DomainBadge
import fr.aars.app.ui.components.DomainHeader
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.LinkText
import fr.aars.app.ui.components.NutriField
import fr.aars.app.ui.components.NutriSheet
import fr.aars.app.ui.components.ProgressTrack
import fr.aars.app.ui.components.SegmentedPill
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.dashedBorder
import fr.aars.app.ui.components.formatInt
import fr.aars.app.ui.components.photoStripes
import fr.aars.app.ui.components.rememberSelectionClick
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.components.tinted
import fr.aars.app.ui.components.valueWithUnit
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import kotlinx.coroutines.launch

/** Deux repas par jour, sept jours : ce que le plan peut porter. */
/** Quatre repas par jour depuis le 05/10/2026 : petit-déj, déjeuner, dîner, collation. */
private val SLOTS_PER_WEEK = Meal.planOrder.size * 7

/** Une case vide du plan, en attente d'un plat. */
data class PlanSlot(val date: LocalDate, val meal: Meal)

/** Cuisine (C3) : Plan, Recettes, Courses, sur la semaine en cours. */
@Composable
fun KitchenScreen(
    model: AppModel,
    onMe: () -> Unit,
    onPlanSlot: (PlanSlot, List<BasketRow>) -> Unit,
    onScanCheck: (String, List<ShoppingItemRow>) -> Unit,
    onAddItem: (String) -> Unit,
    onNewRecipe: () -> Unit,
    onImportRecipe: () -> Unit,
    onCatalogMeal: (CatalogMealRow, String) -> Unit,
) {
    val kitchen = Domains.kitchen
    val scope = rememberCoroutineScope()
    var section by rememberSaveable { mutableStateOf(0) }
    var filling by remember { mutableStateOf(false) }
    // Pour dire, avant le toucher, si Cuisine+ est ouverte sur ce compte.
    LaunchedEffect(Unit) { if (model.purchases.billing == null) model.purchases.load() }
    val locked = model.purchases.billing?.kitchenPlus == false
    val today = model.today?.today?.let(LocalDate::parse) ?: LocalDate.now()
    val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
    val week = monday.toString()

    val plan = rememberLoaded(week, model.revision) { model.api.plan(week) }
    val basket = rememberLoaded(week, model.revision) { model.api.basket(week) }
    val shopping = rememberLoaded(week, model.revision) { model.api.shopping(week) }
    // Cochés à l'instant : la case suit le doigt, le serveur suit (comme la PWA).
    val checking = remember { mutableStateMapOf<Long, Boolean>() }

    val items = shopping.value?.list?.items.orEmpty()
    fun isChecked(item: ShoppingItemRow) = checking[item.id] ?: (item.checkedAt != null)
    val bought = items.count(::isChecked)

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
            badges = if (shopping.value?.list == null || items.size == bought) emptyMap() else mapOf(2 to "${items.size - bought}"),
        )
        when (section) {
            0 -> if (LoadedGate(plan) && LoadedGate(basket, emptyList())) {
                val planned = plan.value?.planned.orEmpty()
                val chosen = basket.value?.basket.orEmpty()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatTile("Plats choisis", "${chosen.size}", null, null, Modifier.weight(1f))
                    StatTile("Repas placés", "${planned.size}", " / $SLOTS_PER_WEEK", planned.size / SLOTS_PER_WEEK.toFloat(), Modifier.weight(1f))
                    StatTile("Courses", "$bought", " / ${items.size}", if (items.isEmpty()) 0f else bought / items.size.toFloat(), Modifier.weight(1f))
                }
                BasketCard(chosen, onChoose = { section = 1 })
                val open = (0L until 7L).map { monday.plusDays(it) }.filter { it >= today }.sumOf { date ->
                    Meal.planOrder.count { meal ->
                        planned.none { it.planDate == date.toString() && Meal.fromApi(it.meal) == meal }
                    }
                }
                if (open > 0) {
                    CuisinePlusAction(
                        R.drawable.lucide_sparkles,
                        "Remplir la semaine",
                        "$open repas ${if (open > 1) "libres" else "libre"} : tes plats d'abord, puis le catalogue",
                        locked = locked,
                        busy = filling,
                    ) {
                        if (locked) {
                            model.requestPaywall()
                        } else if (!filling) {
                            filling = true
                            scope.launch {
                                when (val result = model.api.fillWeek(week, Meal.planOrder)) {
                                    is ApiResult.Ok -> {
                                        val done = result.value
                                        val placed = "${done.placed} repas ${if (done.placed > 1) "placés" else "placé"}"
                                        val added = done.added.size
                                        model.toast(
                                            when {
                                                done.placed == 0 && done.empty > 0 -> "Pas assez de plats pour remplir la semaine"
                                                done.placed == 0 -> "La semaine est déjà pleine"
                                                added == 0 -> placed
                                                else -> "$placed, $added ${if (added > 1) "plats ajoutés" else "plat ajouté"} aux courses"
                                            },
                                        )
                                        model.bump()
                                    }
                                    is ApiResult.Failed ->
                                        if (result.code == "premium_required") model.requestPaywall() else model.toast(result.message)
                                }
                                filling = false
                            }
                        }
                    }
                }
                PlanGrid(
                    monday, today, planned,
                    onEat = { row -> model.eatPlanned(row.id, row.recipeName) },
                    onEmpty = { slot ->
                        if (chosen.isEmpty()) {
                            model.toast("Choisis d'abord des plats dans Recettes")
                        } else {
                            onPlanSlot(slot, chosen)
                        }
                    },
                )
            }
            1 -> RecipesSection(
                model, week, onNewRecipe,
                onImport = { if (locked) model.requestPaywall() else onImportRecipe() },
                onCatalogMeal = { meal -> onCatalogMeal(meal, week) },
                locked = locked,
            )
            else -> if (LoadedGate(shopping)) {
                if (shopping.value?.list == null) {
                    EmptyCard("Pas encore de liste", "Elle se compose à partir des plats choisis pour la semaine.")
                    fr.aars.app.ui.components.PrimaryButton("Composer la liste de courses", kitchen, {
                        scope.launch {
                            when (val result = model.api.generateShopping(week)) {
                                is ApiResult.Ok -> model.bump()
                                is ApiResult.Failed -> model.toast(result.message)
                            }
                        }
                    }, height = 48.dp, textSize = 15f)
                } else {
                    ShoppingSection(
                        items, ::isChecked,
                        onScan = { onScanCheck(week, items) },
                        onAddItem = { onAddItem(week) },
                        onRegenerate = {
                            scope.launch {
                                when (val result = model.api.generateShopping(week)) {
                                    is ApiResult.Ok -> {
                                        model.toast("Liste recomposée depuis les plats de la semaine")
                                        model.bump()
                                    }
                                    is ApiResult.Failed -> model.toast(result.message)
                                }
                            }
                        },
                    ) { item, checked ->
                        checking[item.id] = checked
                        scope.launch {
                            if (model.api.checkItem(item, checked) is ApiResult.Failed) {
                                checking.remove(item.id)
                                model.toast("La case n'a pas pu être enregistrée")
                            }
                        }
                    }
                }
            }
        }
    }
}

private val shortFormat = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)

private fun shortDate(date: LocalDate): String = date.format(shortFormat)

private val dayFormat = DateTimeFormatter.ofPattern("EEE d", Locale.FRENCH)

private fun dayLabel(date: LocalDate): String =
    date.format(dayFormat).replace(".", "").replaceFirstChar { it.titlecase(Locale.FRENCH) }

private fun formatServings(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else String.format(Locale.FRANCE, "%.1f", value)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BasketCard(basket: List<BasketRow>, onChoose: () -> Unit) {
    val kitchen = Domains.kitchen
    Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Txt("À cuisiner", nt(13f, 600), Modifier.weight(1f))
            LinkText("Choisir des plats", kitchen.textOnLight, onChoose)
        }
        if (basket.isEmpty()) {
            Txt("Aucun plat choisi pour cette semaine.", Type.secondary)
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                basket.forEach { item ->
                    Txt(
                        buildAnnotatedString {
                            append("${item.recipeName} ")
                            withStyle(SpanStyle(fontWeight = FontWeight.W700, color = kitchen.textOnLight)) {
                                append("${formatServings(item.plannedServings)}/${formatServings(item.servings)}")
                            }
                        },
                        nt(12.5f),
                        Modifier.tinted(kitchen.soft, Radius.small).padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

/** Lignes jour × midi / soir. Le passé est barré, le jour même est surligné. */
@Composable
private fun PlanGrid(
    monday: LocalDate,
    today: LocalDate,
    planned: List<PlannedRow>,
    onEat: (PlannedRow) -> Unit,
    onEmpty: (PlanSlot) -> Unit,
) {
    val kitchen = Domains.kitchen
    Column(Modifier.fillMaxWidth().card()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Spacer(Modifier.width(36.dp))
            Meal.planOrder.forEach { meal ->
                Txt(meal.short, nt(11f, color = Neutrals.muted), Modifier.weight(1f), maxLines = 1)
            }
        }
        (0L until 7L).forEach { offset ->
            val date = monday.plusDays(offset)
            val isToday = date == today
            Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            Row(
                Modifier.fillMaxWidth().background(if (isToday) kitchen.soft else Color.Transparent).padding(horizontal = 8.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Txt(dayLabel(date), if (isToday) nt(11.5f, 700, kitchen.textOnLight) else nt(11.5f, color = Neutrals.muted), Modifier.width(36.dp))
                Meal.planOrder.forEach { meal ->
                    val row = planned.firstOrNull { it.planDate == date.toString() && Meal.fromApi(it.meal) == meal }
                    PlanCell(row, date, today, Modifier.weight(1f), onEat = onEat, onEmpty = { onEmpty(PlanSlot(date, meal)) })
                }
            }
        }
    }
}

@Composable
private fun PlanCell(
    row: PlannedRow?,
    date: LocalDate,
    today: LocalDate,
    modifier: Modifier,
    onEat: (PlannedRow) -> Unit,
    onEmpty: () -> Unit,
) {
    val kitchen = Domains.kitchen
    val shape = RoundedCornerShape(8.dp)
    // Quatre colonnes : le nom tient sur deux lignes plutôt qu'une coupée court.
    val padded = Modifier.padding(horizontal = 5.dp, vertical = 5.dp)
    val struck = TextStyle(textDecoration = TextDecoration.LineThrough)
    when {
        row == null && date < today -> Txt("—", nt(11f, color = Neutrals.faint), modifier)
        row == null -> Txt("+", nt(12f, color = kitchen.textOnLight), modifier.dashedBorder(kitchen.seg, 8.dp).tap(onClick = onEmpty).then(padded))
        row.journaledAt != null || date < today -> Txt(
            row.recipeName, nt(10.5f, color = Neutrals.faint, line = 1.2f).merge(struck),
            modifier.clip(shape).background(Neutrals.chip).then(padded), maxLines = 2,
        )
        date == today -> Txt(
            row.recipeName, nt(10.5f, 600, kitchen.textOnFill, line = 1.2f),
            modifier.clip(shape).background(kitchen.fill).tap { onEat(row) }.then(padded), maxLines = 2,
        )
        else -> Txt(row.recipeName, nt(10.5f, line = 1.2f), modifier.clip(shape).background(kitchen.soft).then(padded), maxLines = 2)
    }
}

/** Une action de Cuisine+, avec le badge tant qu'elle n'est pas ouverte sur ce compte. */
@Composable
private fun CuisinePlusAction(
    icon: Int,
    title: String,
    detail: String,
    locked: Boolean,
    busy: Boolean,
    onClick: () -> Unit,
) {
    val kitchen = Domains.kitchen
    Row(
        Modifier.fillMaxWidth().tinted(kitchen.soft, Radius.tile).tap(enabled = !busy, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(kitchen.fill), contentAlignment = Alignment.Center) {
            Icon(icon, 18.dp, kitchen.textOnFill)
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Txt(title, nt(14.5f, 600))
                if (locked) Badge("Cuisine+", kitchen.fill, kitchen.textOnFill, size = 10f)
            }
            Txt(if (busy) "Un instant…" else detail, Type.small, maxLines = 2)
        }
        Icon(R.drawable.lucide_chevron_right, 16.dp, kitchen.textOnLight)
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

/** Les recettes de l'utilisateur ; un toucher ajoute deux parts au panier de la semaine. */
@Composable
private fun RecipesSection(
    model: AppModel,
    week: String,
    onNewRecipe: () -> Unit,
    onImport: () -> Unit,
    onCatalogMeal: (CatalogMealRow) -> Unit,
    locked: Boolean,
) {
    val kitchen = Domains.kitchen
    val scope = rememberCoroutineScope()
    val recipes = rememberLoaded(model.revision) { model.api.recipes() }
    val catalog = rememberLoaded(model.revision) { model.api.catalog() }
    var query by remember { mutableStateOf("") }
    // 0 : tout ; ensuite les moments, dans l'ordre du plan.
    var moment by rememberSaveable { mutableStateOf(0) }
    val wanted = if (moment == 0) null else Meal.planOrder[moment - 1]
    fun matches(name: String, meal: String?) =
        (query.isBlank() || name.contains(query.trim(), ignoreCase = true)) && (wanted == null || Meal.orNull(meal) == wanted)

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
    SegmentedPill(
        options = listOf("Tout") + Meal.planOrder.map { it.short },
        selected = moment,
        onSelect = { moment = it },
        track = kitchen.soft,
        textColor = kitchen.textOnLight,
        selectedTextColor = kitchen.textOnLight,
        textStyle = nt(12.5f, 600),
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.weight(1f).tinted(kitchen.soft, Radius.tile).tap(onClick = onNewRecipe).padding(12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(R.drawable.lucide_plus, 16.dp, kitchen.textOnLight)
            Spacer(Modifier.width(6.dp))
            Txt("Nouvelle recette", nt(14f, 600, kitchen.textOnLight), maxLines = 1)
        }
        Row(
            Modifier.weight(1f).tinted(kitchen.soft, Radius.tile).tap(onClick = onImport).padding(12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(R.drawable.lucide_link, 16.dp, kitchen.textOnLight)
            Spacer(Modifier.width(6.dp))
            Txt("Importer", nt(14f, 600, kitchen.textOnLight), maxLines = 1)
            if (locked) {
                Spacer(Modifier.width(6.dp))
                Badge("Cuisine+", kitchen.fill, kitchen.textOnFill, size = 10f)
            }
        }
    }
    if (!LoadedGate(recipes)) return
    val shown = recipes.value?.recipes.orEmpty().filter { matches(it.name, it.meal) }
    Txt("Mes recettes", nt(15f, 600), Modifier.padding(horizontal = 4.dp))
    if (shown.isEmpty()) {
        EmptyCard(
            if (query.isBlank() && wanted == null) "Aucune recette" else "Aucun résultat",
            if (query.isBlank() && wanted == null) "Crée ta première recette, ou prends-en une dans le catalogue ci-dessous." else "Essaie un autre mot ou un autre moment.",
        )
    } else {
        Txt("Touche une recette pour l'ajouter aux plats de la semaine.", Type.secondary, Modifier.padding(horizontal = 4.dp))
        shown.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                pair.forEach { recipe ->
                    RecipeCard(recipe, Modifier.weight(1f)) {
                        scope.launch {
                            val servings = recipe.servings.coerceAtLeast(1.0)
                            when (val result = model.api.addToBasket(week, recipe.id, servings)) {
                                is ApiResult.Ok -> {
                                    model.toast("${recipe.name} ajouté aux plats de la semaine")
                                    model.bump()
                                }
                                is ApiResult.Failed -> model.toast(result.message)
                            }
                        }
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }

    // Le catalogue : les plats de l'objectif que le compte n'a pas encore.
    if (!LoadedGate(catalog)) return
    val dishes = catalog.value?.meals.orEmpty().filter { it.recipeId == null && matches(it.name, it.slot) }
    if (dishes.isEmpty()) return
    Txt("Catalogue", nt(15f, 600), Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
    Txt("Des plats prêts pour ton objectif. Touche-en un pour le voir.", Type.secondary, Modifier.padding(horizontal = 4.dp))
    dishes.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            pair.forEach { meal ->
                DishCard(meal.name, meal.imageUrl, catalogLine(meal), Modifier.weight(1f)) { onCatalogMeal(meal) }
            }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

/** Ce qu'une carte du catalogue dit sous le nom : moment, calories par part, durée. */
private fun catalogLine(meal: CatalogMealRow): String = listOfNotNull(
    Meal.orNull(meal.slot)?.short,
    if (meal.kcal > 0) "${formatInt(meal.kcal.toDouble())} kcal" else null,
    meal.prepMinutes?.let { "$it min" },
).joinToString(" · ")

@Composable
private fun RecipeCard(recipe: RecipeRow, modifier: Modifier, onClick: () -> Unit) {
    val line = listOfNotNull(
        if (recipe.kcalPerServing > 0) "${formatInt(recipe.kcalPerServing)} kcal" else null,
        recipe.prepMinutes?.let { "$it min" },
    ).joinToString(" · ").ifEmpty { "${formatServings(recipe.servings)} parts" }
    DishCard(recipe.name, recipe.imageUrl, line, modifier, onClick)
}

/** Une carte de plat : photo (ou motif), nom sur deux lignes, une ligne de détail. */
@Composable
private fun DishCard(name: String, imageUrl: String?, line: String, modifier: Modifier, onClick: () -> Unit) {
    val kitchen = Domains.kitchen
    Column(modifier.card(Radius.tile).tap(onClick = onClick)) {
        // Le motif reste dessous : il tient lieu de photo pendant le chargement,
        // et pour toute recette qui n'en a pas.
        Box(Modifier.fillMaxWidth().aspectRatio(1.3f).clip(RoundedCornerShape(topStart = Radius.tile, topEnd = Radius.tile)).photoStripes(kitchen.soft, kitchen.seg)) {
            imageUrl?.let { url ->
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
            }
        }
        Column(Modifier.padding(10.dp)) {
            Txt(name, nt(14f, 600, line = 1.25f), maxLines = 2)
            Txt(line, Type.small)
        }
    }
}

/** La liste par rayon, dans l'ordre du serveur ; cocher suit le doigt. */
@Composable
private fun ShoppingSection(
    items: List<ShoppingItemRow>,
    isChecked: (ShoppingItemRow) -> Boolean,
    onScan: () -> Unit,
    onAddItem: () -> Unit,
    onRegenerate: () -> Unit,
    onToggle: (ShoppingItemRow, Boolean) -> Unit,
) {
    val kitchen = Domains.kitchen
    val click = rememberSelectionClick()
    val done = items.count(isChecked)
    Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Txt("Panier", nt(13f, 600), Modifier.weight(1f))
            Txt("$done / ${items.size}", nt(13f, 600, kitchen.textOnLight))
        }
        ProgressTrack(done / items.size.coerceAtLeast(1).toFloat(), kitchen.soft, kitchen.fill, 7.dp)
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            Triple("Scanner pour cocher", R.drawable.lucide_scan_barcode, onScan),
            Triple("Un article", R.drawable.lucide_plus, onAddItem),
        ).forEach { (label, icon, action) ->
            Row(
                Modifier.weight(1f).tinted(kitchen.soft, Radius.tile).tap(onClick = action).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(icon, 18.dp, kitchen.textOnLight)
                Txt(label, nt(13f, 600, kitchen.textOnLight), maxLines = 1)
            }
        }
    }
    items.groupBy { it.aisleLabel }.forEach { (aisle, rows) ->
        Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 4.dp)) {
            Txt(aisle.uppercase(Locale.FRENCH), Type.sectionCaps, Modifier.padding(top = 10.dp, bottom = 4.dp))
            rows.forEach { item ->
                val checked = isChecked(item)
                Row(
                    Modifier.fillMaxWidth().tap {
                        click()
                        onToggle(item, !checked)
                    }.padding(vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(
                        Modifier
                            .size(20.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (checked) kitchen.fill else Color.Transparent)
                            .then(if (checked) Modifier else Modifier.border(1.5.dp, Neutrals.radioBorder, RoundedCornerShape(6.dp))),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (checked) Icon(R.drawable.lucide_check, 13.dp, kitchen.textOnFill)
                    }
                    Txt(
                        item.label,
                        if (checked) nt(14f, color = Neutrals.faint).merge(TextStyle(textDecoration = TextDecoration.LineThrough)) else nt(14f, 500),
                        Modifier.weight(1f),
                    )
                    Txt(item.quantityLabel, nt(12.5f, color = Neutrals.muted))
                }
            }
        }
    }
    Txt(
        "Recomposer depuis les plats de la semaine",
        nt(13f, 600, kitchen.textOnLight),
        Modifier.fillMaxWidth().tap(onClick = onRegenerate).padding(10.dp),
        align = androidx.compose.ui.text.style.TextAlign.Center,
    )
}

/** Placer un plat choisi sur une case vide : la feuille. */
@Composable
fun BoxScope.PlanSlotSheet(
    slot: PlanSlot?,
    basket: List<BasketRow>,
    model: AppModel,
    onDismiss: () -> Unit,
) {
    val kitchen = Domains.kitchen
    val scope = rememberCoroutineScope()
    val title = slot?.let { "${dayLabel(it.date)} · ${it.meal.label.lowercase()}" } ?: ""
    // Les plats de ce moment d'abord, puis ceux sans moment, puis les autres.
    val ordered = basket.sortedBy { item ->
        when (Meal.orNull(item.meal)) {
            slot?.meal -> 0
            null -> 1
            else -> 2
        }
    }
    NutriSheet(slot != null, title, onDismiss, gap = 10) {
        ordered.forEach { item ->
            Row(
                Modifier.fillMaxWidth().tinted(kitchen.soft, Radius.tile).tap {
                    val target = slot ?: return@tap
                    scope.launch {
                        when (val result = model.api.planMeal(target.date.toString(), target.meal.api, item.recipeId, 1.0)) {
                            is ApiResult.Ok -> {
                                model.toast("${item.recipeName} placé")
                                model.bump()
                                onDismiss()
                            }
                            is ApiResult.Failed -> model.toast(result.message)
                        }
                    }
                }.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Txt(item.recipeName, nt(14f, 600), Modifier.weight(1f))
                Txt("${formatServings(item.plannedServings)}/${formatServings(item.servings)} parts", nt(12.5f, 600, kitchen.textOnLight))
            }
        }
    }
}
