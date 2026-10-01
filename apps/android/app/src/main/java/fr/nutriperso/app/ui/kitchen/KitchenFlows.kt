package fr.nutriperso.app.ui.kitchen

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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.IngredientBody
import fr.nutriperso.app.data.RecipeCreateBody
import fr.nutriperso.app.data.ScanMatch
import fr.nutriperso.app.data.SearchHit
import fr.nutriperso.app.data.ShoppingItemRow
import fr.nutriperso.app.ui.add.CameraPreview
import fr.nutriperso.app.ui.components.CloseButton
import fr.nutriperso.app.ui.components.GhostButton
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.Labeled
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.formatInt
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Macros
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Space
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
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

private class Ingredient(val hit: SearchHit) {
    var grams by mutableStateOf(Math.round(hit.servingSizeG ?: 100.0).toString())
}

/** Écrire une recette : nom, parts, ingrédients trouvés par la recherche, étapes. */
@Composable
fun RecipeEditorScreen(model: AppModel, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var servings by remember { mutableStateOf("2") }
    var minutes by remember { mutableStateOf("") }
    var steps by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val ingredients = remember { mutableStateListOf<Ingredient>() }
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
        )
        busy = true
        scope.launch {
            when (val result = model.api.createRecipe(body, ingredients.map { it.hit })) {
                is ApiResult.Ok -> {
                    model.bump()
                    model.toast("Recette « ${body.name} » créée")
                    onClose()
                }
                is ApiResult.Failed -> error = result.message
            }
            busy = false
        }
    }

    Screen("Nouvelle recette", onClose, footer = {
        PrimaryButton("Enregistrer la recette", Domains.kitchen, ::save, height = 52.dp, busy = busy)
    }) {
        Labeled("Nom") { NutriField(name, { name = it.take(80) }, placeholder = "Curry de lentilles", focusColor = Domains.kitchen.textOnLight) }
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
                Txt(item.hit.name, nt(14f, 500), Modifier.weight(1f), maxLines = 2)
                GramsField(item.grams, { item.grams = it })
                Icon(R.drawable.lucide_x, 16.dp, Neutrals.muted, Modifier.tap { ingredients.removeAt(index) })
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

