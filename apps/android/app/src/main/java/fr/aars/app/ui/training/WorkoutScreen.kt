package fr.aars.app.ui.training

import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fr.aars.app.AppModel
import fr.aars.app.R
import fr.aars.app.data.ApiResult
import fr.aars.app.data.Runner
import fr.aars.app.data.RunnerExercise
import fr.aars.app.data.RunnerSet
import fr.aars.app.data.SetBody
import fr.aars.app.ui.components.CloseButton
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.ProgressTrack
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.rememberSelectionClick
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.screens.formatTonnage
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.nt
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Accent de la séance : Sport clair sur fond sombre (README de la maquette). */
private val Accent = Domains.training.light
private val Dark = Neutrals.workoutDark
private val Raised = Color(0xFF2A2621)
private val OnDark = Color(0xFFF4F1EB)
private val OnDarkMuted = Color(0xFFA39A8F)

/** Ce que l'utilisateur tape pour une série, avant de la valider. */
private data class Draft(val weight: String, val reps: String, val seconds: String, val failure: Boolean)

private fun RunnerSet.toDraft() = Draft(
    weight = weightKg?.let(::formatNumber) ?: "",
    reps = reps?.toString() ?: "",
    seconds = seconds?.toString() ?: "",
    failure = toFailure,
)

private fun formatNumber(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString().replace('.', ',')

private fun parseDecimal(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()

private fun clock(totalSeconds: Long): String {
    val s = totalSeconds.coerceAtLeast(0)
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
}

/**
 * La séance en cours, plein écran et sombre. Chaque série validée part au
 * serveur, puis l'écran relit la séance : la consigne, la suggestion et le
 * record viennent toujours du serveur.
 */
@Composable
fun WorkoutScreen(model: AppModel, sessionId: Long, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val view = LocalView.current
    val click = rememberSelectionClick()
    var runner by remember { mutableStateOf<Runner?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    val drafts = remember { mutableStateMapOf<String, Draft>() }
    var restEndsAt by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var picking by remember { mutableStateOf(false) }
    var confirmDiscard by remember { mutableStateOf(false) }

    LaunchedEffect(sessionId, reload) {
        when (val result = model.api.runner(sessionId)) {
            is ApiResult.Ok -> {
                runner = result.value
                error = null
            }
            is ApiResult.Failed -> error = result.message
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(500)
            val previous = now
            now = System.currentTimeMillis()
            if (restEndsAt in (previous + 1)..now) view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        }
    }
    BackHandler { if (picking) picking = false else onClose() }

    fun key(exercise: RunnerExercise, set: RunnerSet) = "${exercise.exerciseId}:${set.setIndex}"
    fun draftOf(exercise: RunnerExercise, set: RunnerSet) = drafts[key(exercise, set)] ?: set.toDraft()
    val timed = { exercise: RunnerExercise -> exercise.kind == "hold" || exercise.kind == "cardio" }

    fun save(exercise: RunnerExercise, set: RunnerSet) {
        val current = runner ?: return
        val draft = draftOf(exercise, set)
        val isTimed = timed(exercise)
        val body = SetBody(
            sessionId = current.id,
            exerciseId = exercise.exerciseId,
            position = exercise.position,
            setIndex = set.setIndex,
            weightKg = if (isTimed) null else parseDecimal(draft.weight),
            reps = if (isTimed) null else draft.reps.trim().toIntOrNull(),
            seconds = if (isTimed) draft.seconds.trim().toIntOrNull() else null,
            toFailure = draft.failure,
        )
        busy = true
        scope.launch {
            val result = model.api.recordSet(body)
            busy = false
            if (result is ApiResult.Failed) {
                error = "Série non enregistrée. Vérifie les valeurs."
                return@launch
            }
            click()
            drafts.remove(key(exercise, set))
            if (!set.done) exercise.restSeconds?.let { restEndsAt = System.currentTimeMillis() + it * 1000L }
            val before = exercise.recordSetIndex
            when (val next = model.api.runner(current.id)) {
                is ApiResult.Ok -> {
                    runner = next.value
                    val after = next.value.exercises.firstOrNull { it.position == exercise.position }?.recordSetIndex
                    if (after == set.setIndex && before != set.setIndex) model.toast("Nouveau record sur ${exercise.name}")
                }
                is ApiResult.Failed -> reload++
            }
        }
    }

    fun act(call: suspend () -> ApiResult<Unit>, after: () -> Unit = { reload++ }) {
        busy = true
        scope.launch {
            val result = call()
            busy = false
            if (result is ApiResult.Failed) error = result.message else after()
        }
    }

    Box(Modifier.fillMaxSize().background(Dark)) {
        val data = runner
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(data?.name ?: "Séance", nt(20f, 600, OnDark, tracking = -0.02f), maxLines = 1)
                    if (data != null) {
                        val start = runCatching { Instant.parse(data.startedAt).toEpochMilli() }.getOrNull()
                        val end = data.finishedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: now
                        val (volume, unit) = formatTonnage(data.volumeKg)
                        Txt(
                            listOfNotNull(start?.let { clock((end - it) / 1000) }, "${data.recordedSets} / ${data.plannedSets} séries", "$volume$unit").joinToString(" · "),
                            nt(12.5f, color = OnDarkMuted),
                        )
                    }
                }
                CloseButton(onClose, dark = true)
            }
            if (data != null && data.plannedSets > 0) {
                ProgressTrack(
                    data.recordedSets / data.plannedSets.toFloat(), Raised, Accent, 5.dp,
                    Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
            error?.let {
                Txt(it, nt(13f, 500, Color(0xFFF8DDE1)), Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            }

            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (data == null) {
                    Txt(if (error == null) "Chargement…" else "", nt(14f, color = OnDarkMuted), Modifier.padding(8.dp))
                } else {
                    // La première série pas encore faite est la série active.
                    val active = data.exercises.firstNotNullOfOrNull { exercise ->
                        exercise.sets.firstOrNull { !it.done }?.let { exercise.exerciseId to it.setIndex }
                    }
                    data.exercises.forEach { exercise ->
                        ExerciseBlock(
                            exercise = exercise,
                            closed = data.closed,
                            timed = timed(exercise),
                            active = active,
                            draftOf = { set -> draftOf(exercise, set) },
                            onDraft = { set, draft -> drafts[key(exercise, set)] = draft },
                            onSave = { set -> save(exercise, set) },
                            busy = busy,
                        )
                    }
                    if (data.canAddExercise) {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, Raised, RoundedCornerShape(16.dp))
                                .tap { picking = true }.padding(14.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(R.drawable.lucide_plus, 16.dp, Accent)
                            Spacer(Modifier.width(8.dp))
                            Txt("Ajouter un exercice", nt(14f, 600, Accent))
                        }
                    }
                    if (data.closed) {
                        FinishedPanel(data, busy, onVisibility = { value -> act({ model.api.setVisibility(data.id, value) }) },
                            onFavorite = { act({ model.api.favoriteSession(data.id) }) })
                    } else {
                        Txt(
                            if (confirmDiscard) "Toucher encore pour supprimer cette séance" else "Abandonner la séance",
                            nt(13.5f, 500, if (confirmDiscard) Color(0xFFF8DDE1) else OnDarkMuted),
                            Modifier.fillMaxWidth().tap {
                                if (confirmDiscard) {
                                    act({ model.api.discardSession(data.id) }) {
                                        model.bump()
                                        onClose()
                                    }
                                } else {
                                    confirmDiscard = true
                                }
                            }.padding(10.dp),
                            align = TextAlign.Center,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }

            // Le repos, puis le bouton de fin.
            val remaining = ((restEndsAt - now) / 1000).coerceAtLeast(0)
            if (data != null && !data.closed) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (restEndsAt > now) {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Raised).padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(R.drawable.lucide_timer, 18.dp, Accent)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Txt("Repos", nt(12f, 500, OnDarkMuted))
                                Txt(clock(remaining), nt(22f, 700, OnDark, line = 1.1f))
                            }
                            Txt("+30 s", nt(13f, 600, Accent), Modifier.tap { restEndsAt += 30_000 }.padding(8.dp))
                            Txt("Passer", nt(13f, 600, OnDark), Modifier.tap { restEndsAt = 0 }.padding(8.dp))
                        }
                    }
                    Box(
                        Modifier.fillMaxWidth().height(52.dp).clip(CircleShape).background(Accent)
                            .tap(enabled = !busy) {
                                act({ model.api.finishSession(data.id) }) {
                                    restEndsAt = 0
                                    model.bump()
                                    reload++
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Txt("Terminer la séance", nt(15.5f, 700, Dark))
                    }
                }
            }
        }

        val data2 = runner
        AnimatedVisibility(
            picking && data2 != null,
            enter = slideInVertically { it },
            exit = slideOutVertically { it },
        ) {
            ExercisePicker(
                exercises = data2?.catalog.orEmpty(),
                onPick = { exercise ->
                    picking = false
                    data2?.let { act({ model.api.addSessionExercise(it.id, exercise.id) }) }
                },
                onClose = { picking = false },
            )
        }
    }
}

@Composable
private fun ExerciseBlock(
    exercise: RunnerExercise,
    closed: Boolean,
    timed: Boolean,
    active: Pair<Long, Int>?,
    draftOf: (RunnerSet) -> Draft,
    onDraft: (RunnerSet, Draft) -> Unit,
    onSave: (RunnerSet) -> Unit,
    busy: Boolean,
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Raised).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Txt(exercise.name, nt(16f, 600, OnDark), maxLines = 2)
                Txt(exercise.prescription, nt(12.5f, color = OnDarkMuted))
            }
            val done = exercise.sets.count { it.done }
            Txt("$done/${exercise.sets.size}", nt(13f, 700, Accent))
        }
        exercise.suggestion?.let { Txt(it.reason, nt(12.5f, 500, if (it.trend == "up") Accent else OnDark)) }
        exercise.previous?.let { Txt("La dernière fois : $it", nt(12f, color = OnDarkMuted)) }
        exercise.sets.forEach { set ->
            val isActive = !closed && active == (exercise.exerciseId to set.setIndex)
            SetRow(
                set = set,
                draft = draftOf(set),
                timed = timed,
                active = isActive,
                record = exercise.recordSetIndex == set.setIndex,
                editable = !closed,
                busy = busy,
                onDraft = { onDraft(set, it) },
                onSave = { onSave(set) },
            )
        }
    }
}

@Composable
private fun SetRow(
    set: RunnerSet,
    draft: Draft,
    timed: Boolean,
    active: Boolean,
    record: Boolean,
    editable: Boolean,
    busy: Boolean,
    onDraft: (Draft) -> Unit,
    onSave: () -> Unit,
) {
    // La série active se lit sur fond clair, les autres restent sombres.
    val background = if (active) Neutrals.card else Color.Transparent
    val ink = if (active) Neutrals.ink else OnDark
    val muted = if (active) Neutrals.muted else OnDarkMuted
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(background).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Txt("${set.setIndex}", nt(13f, 700, muted), Modifier.width(18.dp))
        if (timed) {
            NumberBox(draft.seconds, { onDraft(draft.copy(seconds = it.filter(Char::isDigit).take(4))) }, "s", ink, muted, editable, Modifier.weight(1f))
        } else {
            NumberBox(draft.weight, { onDraft(draft.copy(weight = it.filter { c -> c.isDigit() || c == ',' || c == '.' }.take(6))) }, "kg", ink, muted, editable, Modifier.weight(1f), decimal = true)
            NumberBox(draft.reps, { onDraft(draft.copy(reps = it.filter(Char::isDigit).take(3))) }, "reps", ink, muted, editable, Modifier.weight(1f))
        }
        if (record) Icon(R.drawable.lucide_trending_up, 16.dp, Neutrals.recordBg)
        Box(
            Modifier.size(28.dp).clip(CircleShape)
                .background(if (draft.failure) Domains.kitchen.fill else Color.Transparent)
                .border(1.dp, muted, CircleShape)
                .tap(enabled = editable) { onDraft(draft.copy(failure = !draft.failure)) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(R.drawable.lucide_flame, 14.dp, if (draft.failure) Domains.kitchen.textOnFill else muted)
        }
        val checkBg = when {
            set.done -> Accent
            active -> Domains.training.fill
            else -> Color.Transparent
        }
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(checkBg)
                .then(if (set.done || active) Modifier else Modifier.border(1.5.dp, muted, CircleShape))
                .tap(enabled = editable && !busy, onClick = onSave),
            contentAlignment = Alignment.Center,
        ) {
            Icon(R.drawable.lucide_check, 18.dp, if (set.done) Dark else if (active) Color.White else muted)
        }
    }
}

@Composable
private fun NumberBox(
    value: String,
    onChange: (String) -> Unit,
    unit: String,
    ink: Color,
    muted: Color,
    enabled: Boolean,
    modifier: Modifier,
    decimal: Boolean = false,
    height: Dp = 40.dp,
) {
    Row(
        modifier.height(height).clip(RoundedCornerShape(10.dp)).border(1.dp, muted.copy(alpha = 0.5f), RoundedCornerShape(10.dp)).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = value,
            onValueChange = onChange,
            enabled = enabled,
            singleLine = true,
            textStyle = nt(16f, 600, ink, line = 1.2f),
            cursorBrush = SolidColor(ink),
            keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
        Txt(unit, nt(12f, color = muted))
    }
}

@Composable
private fun FinishedPanel(data: Runner, busy: Boolean, onVisibility: (String) -> Unit, onFavorite: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Neutrals.card).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Txt("Séance terminée", nt(16f, 600))
        Txt("Ce que tes abonnés en voient", nt(12.5f, 500, Neutrals.muted))
        Row(Modifier.fillMaxWidth().clip(CircleShape).background(Neutrals.chip).padding(3.dp)) {
            data.visibilities.forEach { option ->
                val selected = option.value == data.visibility
                Txt(
                    option.label,
                    nt(13f, if (selected) 600 else 500, if (selected) Neutrals.ink else Neutrals.muted),
                    Modifier.weight(1f).clip(CircleShape).background(if (selected) Neutrals.card else Color.Transparent)
                        .tap(enabled = !busy && !selected) { onVisibility(option.value) }.padding(vertical = 7.dp),
                    align = TextAlign.Center,
                )
            }
        }
        data.visibilities.firstOrNull { it.value == data.visibility }?.let { Txt(it.note, nt(12.5f, color = Neutrals.muted)) }
        if (!data.favorited) {
            Row(
                Modifier.fillMaxWidth().clip(CircleShape).background(Domains.kitchen.soft).tap(enabled = !busy, onClick = onFavorite).padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(R.drawable.lucide_star, 15.dp, Domains.kitchen.textOnLight)
                Spacer(Modifier.width(6.dp))
                Txt("Garder en favori", nt(13.5f, 600, Domains.kitchen.textOnLight))
            }
        } else {
            Txt("Dans tes favoris", nt(13f, 600, Domains.kitchen.textOnLight))
        }
    }
}

/** Liste filtrable du catalogue, plein écran. */
@Composable
fun ExercisePicker(
    exercises: List<fr.aars.app.data.CatalogExercise>,
    onPick: (fr.aars.app.data.CatalogExercise) -> Unit,
    onClose: () -> Unit,
    title: String = "Ajouter un exercice",
) {
    var query by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(Neutrals.screen).statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Txt(title, nt(19f, 600, tracking = -0.02f), Modifier.weight(1f))
            CloseButton(onClose)
        }
        fr.aars.app.ui.components.NutriField(
            query, { query = it }, Modifier.padding(horizontal = 16.dp),
            placeholder = "Chercher un exercice",
            leadingIcon = R.drawable.lucide_search,
            leadingTint = Domains.training.textOnLight,
            focusColor = Domains.training.textOnLight,
            height = 46.dp,
            textSize = 14f,
        )
        val shown = exercises.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            shown.take(120).forEach { exercise ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).tap { onPick(exercise) }.padding(horizontal = 4.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Txt(exercise.name, nt(14f, 500))
                        exercise.muscleGroup?.let { Txt(it, nt(12f, color = Neutrals.muted)) }
                    }
                    Icon(R.drawable.lucide_plus, 16.dp, Domains.training.textOnLight)
                }
            }
            if (shown.isEmpty()) Txt("Aucun exercice.", nt(13f, color = Neutrals.muted), Modifier.padding(8.dp))
        }
    }
}
