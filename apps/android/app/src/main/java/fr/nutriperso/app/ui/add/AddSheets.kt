package fr.nutriperso.app.ui.add

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.Meal
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.valueOrNull
import fr.nutriperso.app.data.MacroValues
import fr.nutriperso.app.data.QuickFavorite
import fr.nutriperso.app.data.QuickSession
import fr.nutriperso.app.data.SearchHit
import fr.nutriperso.app.ui.components.CloseButton
import fr.nutriperso.app.ui.components.GhostButton
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.Labeled
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.NutriSheet
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.SectionCaps
import fr.nutriperso.app.ui.components.SegmentedPill
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.formatInt
import fr.nutriperso.app.ui.components.formatKg
import fr.nutriperso.app.ui.components.rememberSelectionClick
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Motion
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import java.time.LocalDate
import java.time.format.TextStyle as DateTextStyle
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val MealTrack = Color(0xFFF3F0ED)

private enum class MealMode { Home, Favorites, Manual }

/**
 * « Ajouter un repas » : le repas suivant l'heure, la recherche, les récents
 * (un toucher ajoute), et les quatre modes.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BoxScope.MealSheet(
    visible: Boolean,
    model: AppModel,
    preset: SearchHit?,
    onDismiss: () -> Unit,
    onScan: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val nutrition = Domains.nutrition
    val click = rememberSelectionClick()
    var meal by remember { mutableStateOf(Meal.forNow()) }
    var query by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<SearchHit>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var searchError by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<SearchHit?>(null) }
    var quantity by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(MealMode.Home) }
    var favorites by remember { mutableStateOf<List<QuickFavorite>?>(null) }
    val busy = model.writing

    LaunchedEffect(visible, preset) {
        if (visible) {
            meal = Meal.forNow()
            query = ""
            hits = emptyList()
            mode = MealMode.Home
            selected = preset
            quantity = preset?.let { formatGrams(it.servingSizeG ?: 100.0) } ?: ""
        }
    }

    LaunchedEffect(query) {
        searchError = null
        if (query.trim().length < 3) {
            hits = emptyList()
            return@LaunchedEffect
        }
        delay(300)
        searching = true
        when (val result = model.search(query.trim())) {
            is ApiResult.Ok -> hits = result.value.take(8)
            is ApiResult.Failed -> searchError = result.message
        }
        searching = false
    }

    val done: () -> Unit = { onDismiss() }

    NutriSheet(visible, "Ajouter un repas", onDismiss) {
        SegmentedPill(
            options = Meal.entries.map { it.short },
            selected = meal.ordinal,
            onSelect = { meal = Meal.entries[it] },
            track = MealTrack,
            selectedBackground = nutrition.fill,
            selectedTextColor = nutrition.textOnFill,
            textStyle = nt(13f, 600),
            itemPadding = 6.dp,
        )

        val pick = selected
        when {
            pick != null -> QuantityStep(
                hit = pick,
                quantity = quantity,
                onQuantity = { quantity = it.filter(Char::isDigit).take(4) },
                meal = meal,
                busy = busy,
                onAdd = {
                    val grams = quantity.toIntOrNull()
                    if (grams == null || grams <= 0) {
                        onMessage("Une quantité en grammes.")
                    } else {
                        model.addHit(pick, grams, meal) { done() }
                    }
                },
                onBack = { selected = null },
            )
            mode == MealMode.Manual -> ManualStep(meal, busy, onBack = { mode = MealMode.Home }) { label, macros ->
                model.addManual(label, macros, meal) { done() }
            }
            mode == MealMode.Favorites -> {
                LaunchedEffect(Unit) {
                    favorites = model.api.favorites().valueOrNull()?.favorites ?: emptyList()
                }
                FavoritesStep(favorites, onBack = { mode = MealMode.Home }) { favorite ->
                    click()
                    model.replayFavorite(favorite, meal) { done() }
                }
            }
            else -> {
                NutriField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Aliment, recette, favori…",
                    imeAction = ImeAction.Search,
                    height = 46.dp,
                    background = nutrition.soft,
                    border = null,
                    leadingIcon = R.drawable.lucide_search,
                    textSize = 14f,
                )
                if (query.trim().length >= 3) {
                    SearchResults(hits, searching, searchError) { hit ->
                        selected = hit
                        quantity = formatGrams(hit.servingSizeG ?: 100.0)
                    }
                } else {
                    val quick = model.quick
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SectionCaps("Récents")
                        val favoriteChips = quick?.favorites.orEmpty()
                        val recents = quick?.recents.orEmpty()
                        if (favoriteChips.isEmpty() && recents.isEmpty()) {
                            Txt(
                                if (quick == null) "Chargement…" else "Tes aliments récents apparaîtront ici.",
                                Type.secondary,
                                Modifier.padding(horizontal = 4.dp),
                            )
                        } else {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                favoriteChips.forEach { favorite ->
                                    QuickChip(favorite.name) {
                                        click()
                                        model.replayFavorite(favorite, meal) { done() }
                                    }
                                }
                                recents.forEach { recent ->
                                    QuickChip("${recent.label} ${formatGrams(recent.quantityG)} g") {
                                        click()
                                        model.addRecent(recent, meal) { done() }
                                    }
                                }
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ModeTile("Scanner", R.drawable.lucide_scan_barcode, Modifier.weight(1f), onScan)
                        ModeTile("Favoris", R.drawable.lucide_star, Modifier.weight(1f)) { mode = MealMode.Favorites }
                        ModeTile("À la main", R.drawable.lucide_pencil, Modifier.weight(1f)) { mode = MealMode.Manual }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickChip(label: String, onClick: () -> Unit) {
    val nutrition = Domains.nutrition
    Row(
        Modifier.clip(CircleShape).background(nutrition.soft).tap(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(R.drawable.lucide_plus, 12.dp, nutrition.textOnLight)
        Txt(label, nt(13f, 500, nutrition.textOnLight), maxLines = 1)
    }
}

@Composable
private fun ModeTile(label: String, @DrawableRes icon: Int, modifier: Modifier, onClick: () -> Unit) {
    val nutrition = Domains.nutrition
    Column(
        modifier.tinted(nutrition.soft, Radius.tile).tap(onClick = onClick).padding(horizontal = 8.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, 22.dp, nutrition.textOnLight)
        Txt(label, nt(12.5f, 600, nutrition.textOnLight), maxLines = 1)
    }
}

@Composable
private fun SearchResults(hits: List<SearchHit>, searching: Boolean, error: String?, onPick: (SearchHit) -> Unit) {
    Column(Modifier.fillMaxWidth().heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
        when {
            error != null -> Txt(error, Type.secondary, Modifier.padding(4.dp))
            hits.isEmpty() -> Txt(if (searching) "Recherche…" else "Aucun résultat.", Type.secondary, Modifier.padding(4.dp))
        }
        hits.forEachIndexed { index, hit ->
            Row(
                Modifier.fillMaxWidth().tap { onPick(hit) }.padding(horizontal = 4.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Txt(hit.name, Type.bodyStrong, maxLines = 2)
                    Txt(
                        "${formatInt(hit.per100g.kcal)} kcal / 100 g · ${if (hit.kind == "ciqual") "CIQUAL" else "Produit"}",
                        nt(12f, color = Neutrals.muted),
                    )
                }
                Icon(R.drawable.lucide_plus, 16.dp, Domains.nutrition.textOnLight)
            }
            if (index < hits.lastIndex) Box(Modifier.fillMaxWidth().padding(horizontal = 4.dp).heightIn(min = 1.dp, max = 1.dp).background(Neutrals.divider))
        }
    }
}

@Composable
private fun QuantityStep(
    hit: SearchHit,
    quantity: String,
    onQuantity: (String) -> Unit,
    meal: Meal,
    busy: Boolean,
    onAdd: () -> Unit,
    onBack: () -> Unit,
) {
    val grams = quantity.toIntOrNull() ?: 0
    val factor = grams / 100.0
    Column(
        Modifier.fillMaxWidth().tinted(Domains.nutrition.soft, Radius.tile).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Txt(hit.name, nt(15f, 600), maxLines = 2)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            NutriField(
                quantity,
                onQuantity,
                Modifier.width(120.dp),
                placeholder = "100",
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
                onDone = onAdd,
                trailing = { Txt("g", nt(14f, 500, Neutrals.muted)) },
            )
            Column {
                Txt("${formatInt(hit.per100g.kcal * factor)} kcal", nt(18f, 600))
                Txt(
                    "P ${formatInt(hit.per100g.proteinG * factor)} · G ${formatInt(hit.per100g.carbsG * factor)} · L ${formatInt(hit.per100g.fatG * factor)} g",
                    nt(12f, color = Neutrals.muted),
                )
            }
        }
    }
    PrimaryButton("Ajouter ${meal.inPhrase}", Domains.nutrition, onAdd, height = 52.dp, busy = busy, textSize = 15.5f, weight = 700)
    GhostButton("Retour", onBack)
}

@Composable
private fun ManualStep(meal: Meal, busy: Boolean, onBack: () -> Unit, onAdd: (String, MacroValues) -> Unit) {
    var label by remember { mutableStateOf("") }
    var kcal by remember { mutableStateOf("") }
    var protein by remember { mutableStateOf("") }
    var carbs by remember { mutableStateOf("") }
    var fat by remember { mutableStateOf("") }
    val number = { text: String -> text.replace(',', '.').toDoubleOrNull() }
    val submit: () -> Unit = {
        val kcalValue = number(kcal)
        if (label.isNotBlank() && kcalValue != null && kcalValue >= 0) {
            onAdd(label.trim(), MacroValues(kcalValue, number(protein) ?: 0.0, number(carbs) ?: 0.0, number(fat) ?: 0.0))
        }
    }
    Labeled("Ce que tu as mangé") { NutriField(label, { label = it.take(200) }, placeholder = "Part de quiche") }
    Labeled("Calories de la portion") {
        NutriField(kcal, { kcal = it.take(5) }, placeholder = "kcal", keyboardType = KeyboardType.Decimal)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        NutriField(protein, { protein = it.take(5) }, Modifier.weight(1f), placeholder = "Prot. g", keyboardType = KeyboardType.Decimal)
        NutriField(carbs, { carbs = it.take(5) }, Modifier.weight(1f), placeholder = "Gluc. g", keyboardType = KeyboardType.Decimal)
        NutriField(fat, { fat = it.take(5) }, Modifier.weight(1f), placeholder = "Lip. g", keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done, onDone = submit)
    }
    PrimaryButton(
        "Ajouter ${meal.inPhrase}",
        Domains.nutrition,
        submit,
        height = 52.dp,
        enabled = label.isNotBlank() && number(kcal) != null,
        busy = busy,
        textSize = 15.5f,
        weight = 700,
    )
    GhostButton("Retour", onBack)
}

@Composable
private fun FavoritesStep(favorites: List<QuickFavorite>?, onBack: () -> Unit, onPick: (QuickFavorite) -> Unit) {
    Column(Modifier.fillMaxWidth().heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
        when {
            favorites == null -> Txt("Chargement…", Type.secondary, Modifier.padding(4.dp))
            favorites.isEmpty() -> Txt("Aucun repas favori. Mets un repas en favori depuis le journal.", Type.secondary, Modifier.padding(4.dp))
            else -> favorites.forEach { favorite ->
                Row(
                    Modifier.fillMaxWidth().tap { onPick(favorite) }.padding(horizontal = 4.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(R.drawable.lucide_star, 16.dp, Domains.kitchen.textOnLight)
                    Spacer(Modifier.width(10.dp))
                    Txt(favorite.name, Type.bodyStrong, Modifier.weight(1f))
                    Icon(R.drawable.lucide_plus, 16.dp, Domains.nutrition.textOnLight)
                }
            }
        }
    }
    GhostButton("Retour", onBack)
}

/** « Une séance » : la séance prévue en tête, puis les autres façons de s'entraîner. */
@Composable
fun BoxScope.SessionSheet(
    visible: Boolean,
    model: AppModel,
    onDismiss: () -> Unit,
    onStart: (QuickSession?) -> Unit,
    onImport: () -> Unit,
    onCompose: () -> Unit,
) {
    val training = Domains.training
    val session = model.quick?.session ?: model.today?.session
    NutriSheet(visible, "Une séance", onDismiss, gap = 12) {
        Row(
            Modifier
                .fillMaxWidth()
                .tinted(training.fill)
                .tap { onStart(session) }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                Icon(R.drawable.lucide_play, 16.dp, training.fill)
            }
            Column(Modifier.weight(1f)) {
                Txt(
                    when {
                        session == null -> "Séance libre"
                        session.kind == "open" -> "Reprendre ${session.name}"
                        else -> "Commencer ${session.name}"
                    },
                    nt(15f, 600, Color.White),
                )
                val detail = when {
                    session == null -> "Aucun programme pour l'instant"
                    session.kind == "open" -> "En cours · ${session.setCount ?: 0} séries notées"
                    else -> "Prévue aujourd'hui · ${session.exerciseCount ?: 0} exercices"
                }
                Txt(detail, nt(12.5f, color = Color.White.copy(alpha = 0.8f)))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                Triple("Libre", R.drawable.lucide_zap, { onStart(null) }),
                Triple("Déjà faite", R.drawable.lucide_history, onImport),
                Triple("Composer", R.drawable.lucide_list_plus, onCompose),
            ).forEach { (label, icon, action) ->
                Column(
                    Modifier.weight(1f).tinted(training.soft, Radius.tile).tap(onClick = action).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(icon, 20.dp, training.textOnLight)
                    Txt(label, nt(12.5f, 600, training.textOnLight), maxLines = 1)
                }
            }
        }
    }
}

/** Pesée : − et + au dixième, initialisée sur la dernière pesée. */
@Composable
fun BoxScope.WeighSheet(visible: Boolean, model: AppModel, onDismiss: () -> Unit) {
    val body = Domains.body
    val last = model.quick?.lastWeighIn
    val fallback = model.today?.weight?.latestKg
    var draft by remember { mutableStateOf(70.0) }
    var touched by remember { mutableStateOf(false) }
    val click = rememberSelectionClick()

    LaunchedEffect(visible) {
        if (visible) touched = false
    }
    LaunchedEffect(visible, last, fallback) {
        if (visible && !touched) draft = last?.weightKg ?: fallback ?: 70.0
    }

    fun step(delta: Double) {
        click()
        touched = true
        draft = Math.round((draft + delta) * 10) / 10.0
    }

    NutriSheet(visible, "Pesée", onDismiss, gap = 16) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            StepButton(R.drawable.lucide_minus) { step(-0.1) }
            Column(Modifier.width(150.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Txt(formatKg(draft), Type.bigNumber, align = TextAlign.Center)
                Txt("kg · ce matin", nt(13f, color = Neutrals.muted))
            }
            StepButton(R.drawable.lucide_plus) { step(0.1) }
        }
        if (last != null) {
            val day = LocalDate.parse(last.day).dayOfWeek.getDisplayName(DateTextStyle.FULL, Locale.FRENCH)
            Txt("Dernière : ${formatKg(last.weightKg)} kg, $day", nt(13f, color = Neutrals.muted), Modifier.fillMaxWidth(), align = TextAlign.Center)
        }
        PrimaryButton(
            "Enregistrer",
            body,
            { model.weighIn(draft, onDismiss) },
            height = 52.dp,
            busy = model.writing,
            textSize = 15.5f,
            weight = 700,
        )
    }
}

@Composable
private fun StepButton(@DrawableRes icon: Int, onClick: () -> Unit) {
    Box(
        Modifier.size(52.dp).clip(CircleShape).background(Domains.body.soft).tap(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, 20.dp, Domains.body.textOnLight)
    }
}

/**
 * Le scanner, ouvert par un appui long sur le + ou la tuile Scanner.
 *
 * La lecture caméra n'est pas encore branchée : le code se saisit à la main
 * et se cherche dans la base de produits du serveur.
 */
@Composable
fun BoxScope.ScannerOverlay(visible: Boolean, model: AppModel, onDismiss: () -> Unit, onFound: (SearchHit) -> Unit) {
    var code by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(visible) {
        if (visible) {
            code = ""
            message = null
        }
    }
    val lookup: () -> Unit = {
        if (code.length in setOf(8, 12, 13)) {
            busy = true
            scope.launch {
                val hit = model.lookupBarcode(code)
                busy = false
                if (hit == null) message = "Produit inconnu de la base. Cherche-le par son nom." else onFound(hit)
            }
        } else {
            message = "Un code-barres a 8, 12 ou 13 chiffres."
        }
    }

    AnimatedVisibility(
        visible,
        enter = fadeIn(tween(250)) + slideInVertically(tween(Motion.SHEET_IN_MS, easing = Motion.sheet)) { it / 12 },
        exit = fadeOut(tween(200)) + slideOutVertically(tween(250)) { it / 12 },
    ) {
        Column(
            Modifier.fillMaxSize().background(Neutrals.scanner).pointerInput(Unit) { detectTapGestures { } }.statusBarsPadding().navigationBarsPadding().imePadding(),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt("Scanner un code-barres", nt(17f, 600, Color.White), Modifier.weight(1f))
                CloseButton(onDismiss, dark = true)
            }
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(260.dp, 160.dp)
                        .border(3.dp, Domains.nutrition.fill, RoundedCornerShape(22.dp))
                        .padding(10.dp),
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    Txt("caméra bientôt disponible", nt(11f, color = Neutrals.faint))
                }
            }
            Column(Modifier.padding(horizontal = 24.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                NutriField(
                    code,
                    { code = it.filter(Char::isDigit).take(13) },
                    placeholder = "Saisir le code",
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Search,
                    onDone = lookup,
                    focusColor = Domains.nutrition.fill,
                )
                PrimaryButton("Chercher le produit", Domains.nutrition, lookup, height = 52.dp, busy = busy, textSize = 15.5f)
                Txt(
                    message ?: "Ouvert par un appui long sur le +",
                    nt(13.5f, color = Color(0xFFCFC8BF)),
                    Modifier.fillMaxWidth(),
                    align = TextAlign.Center,
                )
            }
        }
    }
}

private fun formatGrams(value: Double): String = Math.round(value).toString()
