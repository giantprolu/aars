package fr.nutriperso.app.ui.training

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.AnalysedLine
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.CatalogExercise
import fr.nutriperso.app.data.ComposeBody
import fr.nutriperso.app.data.ComposedExercise
import fr.nutriperso.app.data.ParsedSet
import fr.nutriperso.app.data.WrittenLine
import fr.nutriperso.app.ui.components.CloseButton
import fr.nutriperso.app.ui.components.GhostButton
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.Labeled
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Macros
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Space
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

/** Le gabarit des écrans du Sport poussés par-dessus la coquille. */
@Composable
private fun FlowScaffold(
    title: String,
    onClose: () -> Unit,
    footer: @Composable ColumnScope.() -> Unit,
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

private class Composed(val exercise: CatalogExercise) {
    var sets by mutableStateOf("3")
    var reps by mutableStateOf(if (exercise.kind == "strength") "10" else "")
    var seconds by mutableStateOf(if (exercise.kind == "strength") "" else "45")
}

/**
 * Composer une séance : choisir des exercices, leurs séries, puis la lancer
 * aussitôt ou la garder en favori (`POST /api/training/templates`).
 */
@Composable
fun ComposeScreen(model: AppModel, onClose: () -> Unit, onStarted: (Long) -> Unit) {
    val training = Domains.training
    val scope = rememberCoroutineScope()
    var catalog by remember { mutableStateOf<List<CatalogExercise>?>(null) }
    var picking by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val chosen = remember { mutableStateListOf<Composed>() }

    LaunchedEffect(Unit) {
        when (val result = model.api.exercises()) {
            is ApiResult.Ok -> {
                val favorites = result.value.favoriteIds.toSet()
                catalog = result.value.exercises.sortedBy { if (it.id in favorites) 0 else 1 }
            }
            is ApiResult.Failed -> error = result.message
        }
    }

    fun submit(start: Boolean) {
        val exercises = chosen.mapNotNull { item ->
            val sets = item.sets.toIntOrNull() ?: return@mapNotNull null
            val timed = item.exercise.kind != "strength"
            ComposedExercise(
                exerciseId = item.exercise.id,
                sets = sets,
                reps = if (timed) null else item.reps.toIntOrNull(),
                seconds = if (timed) item.seconds.toIntOrNull() else null,
            )
        }
        if (exercises.size != chosen.size || exercises.isEmpty()) {
            error = "Chaque exercice demande un nombre de séries."
            return
        }
        busy = true
        error = null
        scope.launch {
            val result = model.api.compose(ComposeBody(name.trim().ifBlank { null }, exercises, keep = !start, start = start))
            busy = false
            when (result) {
                is ApiResult.Ok -> {
                    model.bump()
                    val sessionId = result.value.sessionId
                    if (start && sessionId != null) onStarted(sessionId) else {
                        model.toast("Séance gardée dans tes favoris")
                        onClose()
                    }
                }
                is ApiResult.Failed -> error = result.message
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        FlowScaffold("Composer", onClose, footer = {
            PrimaryButton("Commencer", training, { submit(true) }, height = 52.dp, enabled = chosen.isNotEmpty(), busy = busy)
            GhostButton("Garder en favori sans commencer", { if (chosen.isNotEmpty()) submit(false) })
        }) {
            Labeled("Nom, facultatif") { NutriField(name, { name = it.take(60) }, placeholder = "Haut du corps", focusColor = training.textOnLight) }
            chosen.forEachIndexed { index, item ->
                Column(Modifier.fillMaxWidth().card(Radius.tile).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Txt(item.exercise.name, nt(15f, 600), Modifier.weight(1f))
                        Icon(R.drawable.lucide_x, 16.dp, Neutrals.muted, Modifier.tap { chosen.removeAt(index) })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SmallNumber("séries", item.sets, { item.sets = it }, Modifier.weight(1f))
                        if (item.exercise.kind == "strength") {
                            SmallNumber("reps", item.reps, { item.reps = it }, Modifier.weight(1f))
                        } else {
                            SmallNumber("secondes", item.seconds, { item.seconds = it }, Modifier.weight(1f))
                        }
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().tinted(training.soft, Radius.tile).tap { if (catalog != null) picking = true }.padding(14.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(R.drawable.lucide_plus, 16.dp, training.textOnLight)
                Txt(if (catalog == null) "  Chargement du catalogue…" else "  Ajouter un exercice", nt(14f, 600, training.textOnLight))
            }
            error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
        }
        if (picking) {
            ExercisePicker(
                exercises = catalog.orEmpty(),
                onPick = { exercise ->
                    chosen.add(Composed(exercise))
                    picking = false
                },
                onClose = { picking = false },
            )
        }
    }
}

@Composable
private fun SmallNumber(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(10.dp)).border(1.dp, Neutrals.fieldBorder, RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = value,
            onValueChange = { onChange(it.filter(Char::isDigit).take(4)) },
            singleLine = true,
            textStyle = nt(15f, 600, line = 1.2f),
            cursorBrush = SolidColor(Domains.training.fill),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
        Txt(label, nt(12f, color = Neutrals.muted))
    }
}

private val EXAMPLE = """Chest press machine 4X12 27.5kg - 20 kg - 27.5 kg - 20 kg
shoulder press machine 3X10 50 - 42.5 - 35
pec deck 2X12 et 1X10 (echec) 6-6-6"""

private val WARNINGS = mapOf(
    "no_sets" to "Aucune série reconnue sur cette ligne.",
    "weight_count" to "Le nombre de charges ne correspond pas au nombre de séries.",
)

private fun describeSet(set: ParsedSet): String {
    val main = when {
        set.seconds != null -> "${set.seconds} s"
        set.weightKg != null && set.reps != null -> "${formatKg(set.weightKg)} kg × ${set.reps}"
        set.reps != null -> "${set.reps} reps"
        else -> "?"
    }
    return if (set.toFailure) "$main (échec)" else main
}

private fun formatKg(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString().replace('.', ',')

/**
 * « Déjà faite » : coller une séance écrite à la main (carnet, notes), la
 * faire lire par le serveur, vérifier, puis l'enregistrer à sa date.
 */
@Composable
fun ImportScreen(model: AppModel, onClose: () -> Unit) {
    val training = Domains.training
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var lines by remember { mutableStateOf<List<AnalysedLine>?>(null) }
    var dayOffset by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val today = LocalDate.now()
    val date = today.minusDays(dayOffset.toLong())

    FlowScaffold("Séance déjà faite", onClose, footer = {
        val analysed = lines
        if (analysed == null) {
            PrimaryButton("Lire la séance", training, {
                busy = true
                error = null
                scope.launch {
                    when (val result = model.api.analyseLog(text)) {
                        is ApiResult.Ok -> lines = result.value.lines
                        is ApiResult.Failed -> error = result.message
                    }
                    busy = false
                }
            }, height = 52.dp, enabled = text.isNotBlank(), busy = busy)
        } else {
            PrimaryButton("Enregistrer", training, {
                val written = analysed.filter { it.sets.isNotEmpty() }.map { WrittenLine(it.matchedExerciseId, it.name, it.sets) }
                if (written.isEmpty()) {
                    error = "Aucune série à enregistrer."
                    return@PrimaryButton
                }
                busy = true
                scope.launch {
                    when (val result = model.api.saveLog(date.toString(), written)) {
                        is ApiResult.Ok -> {
                            model.bump()
                            model.toast("Séance enregistrée")
                            onClose()
                        }
                        is ApiResult.Failed -> error = result.message
                    }
                    busy = false
                }
            }, height = 52.dp, busy = busy)
            GhostButton("Modifier le texte", { lines = null })
        }
    }) {
        val analysed = lines
        if (analysed == null) {
            Txt("Une ligne par exercice : le nom, les séries et les charges, comme sur un carnet.", Type.secondary)
            BasicTextField(
                value = text,
                onValueChange = { text = it.take(4000) },
                textStyle = nt(14f, line = 1.45f),
                cursorBrush = SolidColor(training.fill),
                modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp).card(Radius.field).padding(14.dp),
                decorationBox = { inner ->
                    Box {
                        if (text.isEmpty()) Txt(EXAMPLE, nt(14f, color = Neutrals.faint))
                        inner()
                    }
                },
            )
        } else {
            Labeled("Date") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Aujourd'hui" to 0, "Hier" to 1, "Avant-hier" to 2).forEach { (label, offset) ->
                        val selected = offset == dayOffset
                        Txt(
                            label,
                            nt(13f, if (selected) 600 else 500, if (selected) training.textOnFill else training.textOnLight),
                            Modifier.clip(CircleShape).background(if (selected) training.fill else training.soft)
                                .tap { dayOffset = offset }.padding(horizontal = 12.dp, vertical = 7.dp),
                        )
                    }
                }
            }
            Txt(date.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)), Type.secondary)
            analysed.forEach { line ->
                val matched = line.candidates.firstOrNull { it.id == line.matchedExerciseId }
                Column(Modifier.fillMaxWidth().card(Radius.tile).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Txt(matched?.name ?: line.name, nt(15f, 600))
                    if (matched == null) Txt("Nouvel exercice, créé sous ce nom", nt(12f, color = Neutrals.muted))
                    Txt(line.sets.joinToString(" · ", transform = ::describeSet).ifEmpty { "—" }, nt(13f, color = Neutrals.muted))
                    WARNINGS[line.warning]?.let { Txt(it, nt(12.5f, 500, Domains.kitchen.textOnLight)) }
                }
            }
        }
        error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
    }
}

