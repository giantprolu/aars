package fr.aars.app.ui.kitchen

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil3.compose.AsyncImage
import fr.aars.app.AppModel
import fr.aars.app.Meal
import fr.aars.app.R
import fr.aars.app.data.ApiResult
import fr.aars.app.data.CatalogMealRow
import fr.aars.app.data.DraftIngredient
import fr.aars.app.data.IngredientBody
import fr.aars.app.data.RecipeCreateBody
import fr.aars.app.data.RecipeDraft
import fr.aars.app.data.ScanMatch
import fr.aars.app.data.SearchHit
import fr.aars.app.data.ShoppingItemRow
import fr.aars.app.ui.add.CameraPreview
import fr.aars.app.ui.components.CloseButton
import fr.aars.app.ui.components.GhostButton
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.Labeled
import fr.aars.app.ui.components.NutriField
import fr.aars.app.ui.components.PrimaryButton
import fr.aars.app.ui.components.SegmentedPill
import fr.aars.app.ui.components.photoStripes
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.formatInt
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.components.tinted
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Macros
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.Space
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
private fun Screen(
    title: String,
    onClose: () -> Unit,
    footer: @Composable ColumnScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler(onBack = onClose)
    Column(Modifier.fillMaxSize().background(Neutrals.screen).statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Txt(title, Type.screenTitle, Modifier.weight(1f))
            CloseButton(onClose)
        }
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Space.screenH),
            verticalArrangement = Arrangement.spacedBy(Space.block),
            content = content,
        )
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = footer)
    }
}

/** Recherche d'un aliment ou d'un produit, résultats en liste ; un toucher le choisit. */
@Composable
private fun FoodSearch(model: AppModel, onPick: (SearchHit) -> Unit) {
    val kitchen = Domains.kitchen
    var query by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<SearchHit>>(emptyList()) }
    var message by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(query) {
        message = null
        if (query.trim().length < 3) {
            hits = emptyList()
            return@LaunchedEffect
        }
        delay(300)
        when (val result = model.search(query.trim())) {
            is ApiResult.Ok -> {
                hits = result.value.take(10)
                if (hits.isEmpty()) message = "Aucun résultat."
            }
            is ApiResult.Failed -> message = result.message
        }
    }
    NutriField(
        query, { query = it },
        placeholder = "Chercher un aliment",
        height = 46.dp,
        background = kitchen.soft,
        border = null,
        leadingIcon = R.drawable.lucide_search,
        leadingTint = kitchen.textOnLight,
        focusColor = kitchen.textOnLight,
        textSize = 14f,
    )
    message?.let { Txt(it, Type.secondary, Modifier.padding(horizontal = 4.dp)) }
    if (hits.isNotEmpty()) {
        Column(Modifier.fillMaxWidth().card()) {
            hits.forEach { hit ->
                Row(
                    Modifier.fillMaxWidth().tap { onPick(hit); query = "" }.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Txt(hit.name, Type.bodyStrong, maxLines = 2)
                        Txt("${formatInt(hit.per100g.kcal)} kcal / 100 g", Type.small)
                    }
                    Icon(R.drawable.lucide_plus, 16.dp, kitchen.textOnLight)
                }
            }
        }
    }
}

@Composable
private fun GramsField(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(10.dp)).border(1.dp, Neutrals.fieldBorder, RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = value,
            onValueChange = { onChange(it.filter(Char::isDigit).take(5)) },
            singleLine = true,
            textStyle = nt(15f, 600, line = 1.2f),
            cursorBrush = SolidColor(Domains.kitchen.fill),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.width(56.dp),
        )
        Txt("g", nt(12f, color = Neutrals.muted))
    }
}

/** « Un article » : un aliment ajouté à la main à la liste de la semaine. */
@Composable
fun AddItemScreen(model: AppModel, weekStart: String, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var picked by remember { mutableStateOf<SearchHit?>(null) }
    var grams by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    Screen("Un article", onClose, footer = {
        val hit = picked
        if (hit != null) {
            PrimaryButton("Ajouter à la liste", Domains.kitchen, {
                val quantity = grams.toIntOrNull()
                if (quantity == null || quantity <= 0) {
                    model.toast("Une quantité en grammes.")
                } else {
                    busy = true
                    scope.launch {
                        when (val result = model.api.addShoppingItem(weekStart, hit, quantity)) {
                            is ApiResult.Ok -> {
                                model.bump()
                                model.toast("${hit.name} ajouté à la liste")
                                onClose()
                            }
                            is ApiResult.Failed -> model.toast(result.message)
                        }
                        busy = false
                    }
                }
            }, height = 52.dp, busy = busy)
        }
    }) {
        val hit = picked
        if (hit == null) {
            FoodSearch(model) {
                picked = it
                grams = Math.round(it.servingSizeG ?: 100.0).toString()
            }
        } else {
            Row(
                Modifier.fillMaxWidth().tinted(Domains.kitchen.soft, Radius.tile).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Txt(hit.name, nt(15f, 600), Modifier.weight(1f), maxLines = 2)
                GramsField(grams, { grams = it })
            }
            GhostButton("Choisir un autre aliment", { picked = null })
        }
    }
}

/**
 * « Scanner pour cocher » : en rayon, le produit scanné propose l'article de
 * la liste qu'il coche ; on confirme ou on en choisit un autre. Le produit
 * est retenu pour cet ingrédient, comme sur la PWA.
 */
@Composable
fun ScanCheckScreen(model: AppModel, weekStart: String, items: List<ShoppingItemRow>, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    var match by remember { mutableStateOf<ScanMatch?>(null) }
    var busy by remember { mutableStateOf(false) }
    var chosen by remember { mutableStateOf<Long?>(null) }
    val open = items.filter { it.checkedAt == null }

    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    BackHandler(onBack = onClose)

    Box(Modifier.fillMaxSize().background(Neutrals.scanner)) {
        if (granted) {
            CameraPreview(paused = busy || match != null) { barcode ->
                busy = true
                scope.launch {
                    when (val result = model.api.scanMatch(barcode, weekStart)) {
                        is ApiResult.Ok -> {
                            match = result.value
                            chosen = result.value.suggestedItemId
                        }
                        is ApiResult.Failed -> model.toast(result.message)
                    }
                    busy = false
                }
            }
        }
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt("En rayon", nt(17f, 600, Color.White), Modifier.weight(1f))
                CloseButton(onClose, dark = true)
            }
            Box(Modifier.weight(1f))
            val current = match
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = Radius.sheet, topEnd = Radius.sheet)).background(Neutrals.card)
                    .heightIn(max = 420.dp).verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when {
                    !granted -> PrimaryButton("Autoriser la caméra", Domains.kitchen, { permission.launch(Manifest.permission.CAMERA) }, height = 48.dp)
                    current == null -> Txt(if (busy) "Recherche du produit…" else "Scanne le paquet que tu mets dans le chariot.", Type.secondary)
                    else -> {
                        Txt(current.productName ?: "Produit inconnu d'Open Food Facts", nt(15f, 600))
                        Txt(
                            if (current.suggestedItemId != null) "C'est sans doute cet article :" else "Quel article coche-t-il ?",
                            Type.secondary,
                        )
                        open.forEach { item ->
                            val selected = item.id == chosen
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                    .background(if (selected) Domains.kitchen.soft else Color.Transparent)
                                    .tap { chosen = item.id }.padding(horizontal = 10.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Txt(item.label, nt(14f, if (selected) 600 else 400), Modifier.weight(1f))
                                Txt(item.quantityLabel, Type.small)
                            }
                        }
                        val target = open.firstOrNull { it.id == chosen }
                        PrimaryButton("Cocher", Domains.kitchen, {
                            if (target != null) {
                                scope.launch {
                                    when (val result = model.api.checkItemScanned(target, current.barcode)) {
                                        is ApiResult.Ok -> {
                                            model.bump()
                                            model.toast("${target.label} coché")
                                            match = null
                                            chosen = null
                                        }
                                        is ApiResult.Failed -> model.toast(result.message)
                                    }
                                }
                            }
                        }, height = 48.dp, enabled = target != null)
                        GhostButton("Scanner un autre produit", { match = null; chosen = null })
                    }
                }
            }
        }
    }
}

/** Un ingrédient de la recette en cours ; [line] est la ligne de la page d'origine, pour une recette importée. */
private class Ingredient(val hit: SearchHit, grams: String, val line: String? = null) {
    var grams by mutableStateOf(grams)

    constructor(hit: SearchHit) : this(hit, Math.round(hit.servingSizeG ?: 100.0).toString())

    /** Sans poids connu, le champ reste vide et sera réclamé. */
    constructor(draft: DraftIngredient) : this(draft.hit, draft.quantityG?.let { Math.round(it).toString() } ?: "", draft.line)
}

private fun formatParts(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString().replace('.', ',')

/**
 * Écrire une recette : nom, parts, ingrédients trouvés par la recherche, étapes.
 * Avec un brouillon (import de Cuisine+), tout arrive rempli, à relire.
 */
/**
 * Un plat du catalogue : photo, moment, ingrédients et étapes. On le prend
 * pour la semaine (installé puis mis au panier), ou seulement dans ses recettes.
 */
@Composable
fun CatalogMealScreen(model: AppModel, meal: CatalogMealRow, week: String, onClose: () -> Unit) {
    val kitchen = Domains.kitchen
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }

    fun run(call: suspend () -> ApiResult<Unit>, done: String) {
        if (busy) return
        busy = true
        scope.launch {
            when (val result = call()) {
                is ApiResult.Ok -> {
                    model.toast(done)
                    model.bump()
                    onClose()
                }
                is ApiResult.Failed -> model.toast(result.message)
            }
            busy = false
        }
    }

    Screen(meal.name, onClose, footer = {
        PrimaryButton(
            "Ajouter aux plats de la semaine", kitchen,
            { run({ model.api.chooseCatalog(week, meal.slug) }, "${meal.name} ajouté aux plats de la semaine") },
            height = 52.dp, busy = busy,
        )
        GhostButton("Seulement l'ajouter à mes recettes", {
            run({ model.api.installCatalog(meal.slug) }, "${meal.name} ajouté à tes recettes")
        })
    }) {
        Box(Modifier.fillMaxWidth().aspectRatio(1.6f).clip(RoundedCornerShape(Radius.tile)).photoStripes(kitchen.soft, kitchen.seg)) {
            meal.imageUrl?.let { url ->
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
            }
        }
        Txt(
            listOfNotNull(
                Meal.orNull(meal.slot)?.label,
                if (meal.kcal > 0) "${formatInt(meal.kcal.toDouble())} kcal par part" else null,
                if (meal.proteinG > 0) "${meal.proteinG} g de protéines" else null,
                meal.prepMinutes?.let { "$it min" },
            ).joinToString(" · "),
            Type.secondary,
        )
        Txt("Ingrédients pour ${formatParts(meal.servings)} parts", nt(13f, 500))
        Column(Modifier.fillMaxWidth().card(Radius.tile).padding(horizontal = 14.dp, vertical = 6.dp)) {
            meal.ingredients.forEach { ingredient ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Txt(ingredient.label, nt(14f), Modifier.weight(1f))
                    Txt("${formatInt(ingredient.quantityG)} g", nt(13f, 600, Neutrals.muted))
                }
            }
        }
        if (meal.steps.isNotEmpty()) {
            Txt("Étapes", nt(13f, 500))
            meal.steps.forEachIndexed { index, step ->
                Txt("${index + 1}. $step", nt(14f))
            }
        }
    }
}

@Composable
fun RecipeEditorScreen(model: AppModel, onClose: () -> Unit, draft: RecipeDraft? = null) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(draft?.name ?: "") }
    var servings by remember { mutableStateOf(draft?.servings?.let(::formatParts) ?: "2") }
    var minutes by remember { mutableStateOf(draft?.prepMinutes?.toString() ?: "") }
    var steps by remember { mutableStateOf(draft?.steps?.joinToString("\n") ?: "") }
    var notes by remember { mutableStateOf("") }
    // 0 : aucun moment ; ensuite matin, midi, soir, collation.
    var moment by remember { mutableStateOf(0) }
    val ingredients = remember { mutableStateListOf<Ingredient>().apply { draft?.ingredients?.forEach { add(Ingredient(it)) } } }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun save() {
        val parts = servings.replace(',', '.').toDoubleOrNull()
        val quantities = ingredients.map { it.grams.toIntOrNull() }
        error = when {
            name.isBlank() -> "Le nom de la recette est vide."
            parts == null || parts <= 0 -> "Le nombre de parts est invalide."
            ingredients.isEmpty() -> "Ajoute au moins un ingrédient."
            quantities.any { it == null || it <= 0 } -> "Chaque ingrédient demande une quantité en grammes."
            else -> null
        }
        if (error != null || parts == null) return
        val body = RecipeCreateBody(
            name = name.trim(),
            servings = parts,
            steps = steps.lines().map { it.trim() }.filter { it.isNotEmpty() },
            prepMinutes = minutes.toIntOrNull(),
            notes = notes.trim().ifBlank { null },
            ingredients = ingredients.mapIndexed { index, item ->
                IngredientBody(item.hit.kind, item.hit.ref, item.hit.name.take(120), quantities[index] ?: 0)
            },
            meal = if (moment == 0) null else Meal.planOrder[moment - 1].api,
            imported = if (draft == null) null else true,
        )
        busy = true
        scope.launch {
            when (val result = model.api.createRecipe(body, ingredients.map { it.hit })) {
                is ApiResult.Ok -> {
                    model.bump()
                    model.toast("Recette « ${body.name} » créée")
                    onClose()
                }
                is ApiResult.Failed -> {
                    error = result.message
                    if (result.code == "premium_required") model.requestPaywall()
                }
            }
            busy = false
        }
    }

    Screen(if (draft == null) "Nouvelle recette" else "Recette importée", onClose, footer = {
        PrimaryButton("Enregistrer la recette", Domains.kitchen, ::save, height = 52.dp, busy = busy)
    }) {
        if (draft != null) {
            Txt(
                "Relis les ingrédients : chaque ligne de la page a été rapprochée d'un aliment, et les poids sont des ordres de grandeur.",
                Type.secondary,
            )
        }
        Labeled("Nom") { NutriField(name, { name = it.take(80) }, placeholder = "Curry de lentilles", focusColor = Domains.kitchen.textOnLight) }
        Labeled("Moment") {
            SegmentedPill(
                options = listOf("Aucun") + Meal.planOrder.map { it.moment },
                selected = moment,
                onSelect = { moment = it },
                track = Domains.kitchen.soft,
                textColor = Domains.kitchen.textOnLight,
                selectedTextColor = Domains.kitchen.textOnLight,
                textStyle = nt(12.5f, 600),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Labeled("Parts") { NutriField(servings, { servings = it.take(4) }, keyboardType = KeyboardType.Decimal, focusColor = Domains.kitchen.textOnLight) }
            }
            Column(Modifier.weight(1f)) {
                Labeled("Préparation (min)") { NutriField(minutes, { minutes = it.filter(Char::isDigit).take(3) }, keyboardType = KeyboardType.Number, focusColor = Domains.kitchen.textOnLight) }
            }
        }
        Txt("Ingrédients", nt(13f, 500))
        ingredients.forEachIndexed { index, item ->
            Row(
                Modifier.fillMaxWidth().card(Radius.tile).padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Txt(item.hit.name, nt(14f, 500), maxLines = 2)
                    item.line?.let { Txt("« $it »", Type.small, maxLines = 1) }
                }
                GramsField(item.grams, { item.grams = it })
                Icon(R.drawable.lucide_x, 16.dp, Neutrals.muted, Modifier.tap { ingredients.removeAt(index) })
            }
        }
        val unmatched = draft?.unmatched.orEmpty()
        if (unmatched.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().tinted(Domains.kitchen.soft, Radius.tile).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Txt("Non repris, à ajouter si besoin", nt(13f, 600))
                unmatched.forEach { Txt("· $it", Type.secondary) }
            }
        }
        FoodSearch(model) { ingredients.add(Ingredient(it)) }
        Labeled("Étapes, une par ligne") {
            BasicTextField(
                value = steps,
                onValueChange = { steps = it.take(5000) },
                textStyle = nt(14f),
                cursorBrush = SolidColor(Domains.kitchen.fill),
                modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp).card(Radius.field).padding(14.dp),
            )
        }
        Labeled("Notes, facultatif") {
            NutriField(notes, { notes = it.take(1000) }, focusColor = Domains.kitchen.textOnLight, imeAction = ImeAction.Done)
        }
        error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
    }
}


/** Importer une recette depuis un lien (Cuisine+) : le lien, puis le brouillon dans l'éditeur. */
@Composable
fun ImportRecipeScreen(model: AppModel, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf("") }
    var draft by remember { mutableStateOf<RecipeDraft?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    draft?.let {
        RecipeEditorScreen(model, onClose, it)
        return
    }

    fun read() {
        val link = url.trim()
        if (busy || link.isEmpty()) return
        busy = true
        error = null
        scope.launch {
            when (val result = model.api.importRecipe(link)) {
                is ApiResult.Ok -> draft = result.value
                is ApiResult.Failed -> if (result.code == "premium_required") model.requestPaywall() else error = result.message
            }
            busy = false
        }
    }

    Screen("Importer une recette", onClose, footer = {
        PrimaryButton("Lire la recette", Domains.kitchen, ::read, height = 52.dp, busy = busy, enabled = url.isNotBlank())
    }) {
        Txt("Colle le lien d'une page de recette, d'un site ou d'un blog de cuisine. Tu relis tout avant d'enregistrer.", Type.secondary)
        Labeled("Lien de la page") {
            NutriField(
                url,
                { url = it.take(2000) },
                placeholder = "https://…",
                keyboardType = KeyboardType.Uri,
                imeAction = ImeAction.Go,
                onDone = ::read,
                focusColor = Domains.kitchen.textOnLight,
            )
        }
        error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
    }
}
