package fr.nutriperso.app.ui.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.horizontalDrag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.valueOrNull
import fr.nutriperso.app.data.BodyProfile
import fr.nutriperso.app.data.EnergyTarget
import fr.nutriperso.app.data.Gym
import fr.nutriperso.app.data.TrainingPreferences
import fr.nutriperso.app.data.WorkoutTemplate
import fr.nutriperso.app.ui.components.Avatar
import fr.nutriperso.app.ui.components.GhostButton
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.Labeled
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.Ring
import fr.nutriperso.app.ui.components.SegmentedPill
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.formatInt
import fr.nutriperso.app.ui.components.formatSigned
import fr.nutriperso.app.ui.components.rememberSelectionClick
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.theme.DomainColors
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Macros
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Space
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import java.util.Locale
import kotlinx.coroutines.launch

private enum class Step { Welcome, Measures, Activity, Target, Identity, Sessions, Program }

/** Remplissage des trois segments du haut, en part de chaque étape. */
private fun Step.fill(): Triple<Float, Float, Float> = when (this) {
    Step.Welcome -> Triple(0f, 0f, 0f)
    Step.Measures -> Triple(0.33f, 0f, 0f)
    Step.Activity -> Triple(0.66f, 0f, 0f)
    Step.Target -> Triple(1f, 0f, 0f)
    Step.Identity -> Triple(1f, 0.5f, 0f)
    Step.Sessions -> Triple(1f, 1f, 0.5f)
    Step.Program -> Triple(1f, 1f, 1f)
}

private val ACTIVITIES = listOf(
    "sedentary" to "Sédentaire, pas de sport",
    "light" to "Léger, 1 à 3 séances",
    "moderate" to "Modéré, 3 à 5 séances",
    "active" to "Actif, 6 à 7 séances",
    "veryActive" to "Très actif, métier physique",
)
private val GOALS = listOf("lose" to "Perdre", "maintain" to "Maintenir", "gain" to "Prendre")
private val FOCUS = listOf(
    Triple("upper", "Haut", "Haut du corps, avec un minimum de bas."),
    Triple("lower", "Bas", "Bas du corps, avec un minimum de haut."),
    Triple("full", "Les deux", "Les deux à parts égales."),
)
private val EQUIPMENT = listOf("free" to "Poids libres", "machine" to "Machines guidées", "any" to "Indifférent")
private val RHYTHMS = listOf(2, 3, 4, 5, 6)
private const val MAX_LOSS_RATE = 1.0
private const val MAX_GAIN_RATE = 0.5
private const val MANUAL_TARGET_MAX = 6000
private val HANDLE = Regex("^[a-z0-9_]{3,20}$")

/**
 * Le parcours d'arrivée (O0 à O4), une seule fois après l'inscription :
 * objectif, profil Communauté, séances. Chaque étape écrit sur le serveur
 * avant de passer à la suivante : une reprise repart du serveur, pas du
 * téléphone.
 */
@Composable
fun OnboardingFlow(model: AppModel) {
    val scope = rememberCoroutineScope()
    var step by rememberSaveable { mutableStateOf(Step.Welcome) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    // Objectif.
    var sex by rememberSaveable { mutableStateOf("female") }
    var height by rememberSaveable { mutableStateOf("") }
    var weight by rememberSaveable { mutableStateOf("") }
    var birth by rememberSaveable { mutableStateOf("") }
    var bodyFat by rememberSaveable { mutableStateOf("") }
    var activity by rememberSaveable { mutableStateOf("moderate") }
    var goal by rememberSaveable { mutableStateOf("lose") }
    var rate by rememberSaveable { mutableStateOf(0.5) }
    var target by remember { mutableStateOf<EnergyTarget?>(null) }
    var manual by rememberSaveable { mutableStateOf<String?>(null) }

    // Communauté.
    var handle by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }
    var savedHandle by rememberSaveable { mutableStateOf<String?>(null) }

    // Séances.
    var focus by rememberSaveable { mutableStateOf("full") }
    var gyms by remember { mutableStateOf<List<Gym>>(emptyList()) }
    var gymId by rememberSaveable { mutableStateOf<Long?>(null) }
    var equipment by rememberSaveable { mutableStateOf("any") }
    var perWeek by rememberSaveable { mutableStateOf(3) }
    var program by remember { mutableStateOf<List<WorkoutTemplate>>(emptyList()) }

    fun go(next: Step) {
        error = null
        step = next
    }

    val back = mapOf(
        Step.Measures to Step.Welcome, Step.Activity to Step.Measures, Step.Target to Step.Activity,
        Step.Identity to Step.Target, Step.Sessions to Step.Identity, Step.Program to Step.Sessions,
    )
    BackHandler(enabled = back.containsKey(step)) { back[step]?.let(::go) }

    fun number(text: String): Double? = text.replace(',', '.').trim().toDoubleOrNull()

    fun isoBirth(): String? {
        val digits = birth.filter(Char::isDigit)
        if (digits.length != 8) return null
        val iso = "${digits.substring(4, 8)}-${digits.substring(2, 4)}-${digits.substring(0, 2)}"
        return runCatching { java.time.LocalDate.parse(iso) }.getOrNull()?.toString()
    }

    fun checkMeasures(): Boolean {
        val h = height.toIntOrNull()
        val w = number(weight)
        val fat = if (bodyFat.isBlank()) null else number(bodyFat)
        error = when {
            h == null || h < 100 || h > 250 -> "Une taille en centimètres, entre 100 et 250."
            w == null || w < 30 || w > 300 -> "Un poids en kilos, entre 30 et 300."
            isoBirth() == null -> "La date de naissance, au format JJ/MM/AAAA."
            bodyFat.isNotBlank() && (fat == null || fat < 3 || fat > 60) -> "La masse grasse, entre 3 et 60 %, ou rien."
            else -> null
        }
        return error == null
    }

    fun profile(manualKcal: Int?) = BodyProfile(
        sex = sex,
        birthDate = isoBirth().orEmpty(),
        heightCm = height.toIntOrNull() ?: 0,
        weightKg = number(weight) ?: 0.0,
        bodyFatPercent = if (bodyFat.isBlank()) null else number(bodyFat),
        activity = activity,
        goal = goal,
        ratePercentPerWeek = if (goal == "maintain") 0.0 else rate,
        manualTargetKcal = manualKcal,
    )

    fun computeTarget() {
        if (!checkMeasures()) {
            go(Step.Measures)
            return
        }
        busy = true
        scope.launch {
            when (val saved = model.api.saveProfile(profile(null))) {
                is ApiResult.Ok -> {
                    // Le poids saisi devient la première pesée, visible dans Moi.
                    model.api.weighIn(number(weight) ?: 0.0)
                    target = saved.value.target
                    manual = null
                    go(Step.Target)
                }
                is ApiResult.Failed -> error = "Ces mesures n'ont pas pu être enregistrées. ${saved.message}"
            }
            busy = false
        }
    }

    fun confirmTarget() {
        val typed = manual
        if (typed == null) {
            go(Step.Identity)
            return
        }
        val kcal = typed.toIntOrNull()
        if (kcal == null || kcal < 1000 || kcal > MANUAL_TARGET_MAX) {
            error = "Une cible entre 1 000 et 6 000 kcal."
            return
        }
        busy = true
        scope.launch {
            when (val saved = model.api.saveProfile(profile(kcal))) {
                is ApiResult.Ok -> {
                    target = saved.value.target
                    go(Step.Identity)
                }
                is ApiResult.Failed -> error = "La cible n'a pas pu être enregistrée."
            }
            busy = false
        }
    }

    fun confirmIdentity() {
        val normalized = handle.trim().lowercase(Locale.ROOT)
        if (!HANDLE.matches(normalized)) {
            error = "Un identifiant de 3 à 20 caractères : lettres, chiffres et _."
            return
        }
        busy = true
        scope.launch {
            when (val saved = model.api.saveIdentity(normalized, displayName.trim().ifBlank { null })) {
                is ApiResult.Ok -> {
                    savedHandle = normalized
                    go(Step.Sessions)
                }
                is ApiResult.Failed -> error =
                    if (saved.status == 409) "Cet identifiant est déjà pris." else "L'identifiant n'a pas pu être enregistré."
            }
            busy = false
        }
    }

    fun composeProgram() {
        busy = true
        error = null
        scope.launch {
            val saved = model.api.savePreferences(TrainingPreferences(gymId, focus, equipment, perWeek))
            val generated = if (saved is ApiResult.Ok) model.api.generateProgram() else saved
            if (generated is ApiResult.Failed) {
                error = "Le programme n'a pas pu être composé."
            } else {
                program = model.api.templates().valueOrNull()?.templates.orEmpty().filter { it.kind == "program" }
                go(Step.Program)
            }
            busy = false
        }
    }

    LaunchedEffect(step) {
        if (step == Step.Sessions && gyms.isEmpty()) {
            model.api.preferences().valueOrNull()?.let { response ->
                gyms = response.gyms
                if (gymId == null) gymId = response.preferences.gymId ?: response.gyms.firstOrNull()?.id
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        AnimatedContent(step, transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) }, label = "étape") { current ->
            when (current) {
                Step.Welcome -> StepScaffold(null, null, footer = {
                    PrimaryButton("Commencer", Domains.nutrition, { go(Step.Measures) }, trailingIcon = R.drawable.lucide_arrow_right)
                }) { WelcomeStep() }

                Step.Measures -> StepScaffold(current, { go(Step.Welcome) }, footer = {
                    PrimaryButton("Continuer", Domains.nutrition, { if (checkMeasures()) go(Step.Activity) })
                }) {
                    StepTitle("Étape 1 sur 3 · Objectif", Domains.nutrition, "Tes mesures", "Elles servent à estimer ta dépense du jour.")
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Labeled("Sexe") {
                            Choice(listOf("Homme", "Femme"), if (sex == "male") 0 else 1, Domains.nutrition.soft) {
                                sex = if (it == 0) "male" else "female"
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.weight(1f)) {
                                Labeled("Taille (cm)") {
                                    NutriField(height, { height = it.filter(Char::isDigit).take(3) }, placeholder = "170", keyboardType = KeyboardType.Number)
                                }
                            }
                            Column(Modifier.weight(1f)) {
                                Labeled("Poids (kg)") {
                                    NutriField(weight, { weight = it.take(5) }, placeholder = "70,0", keyboardType = KeyboardType.Decimal)
                                }
                            }
                        }
                        Labeled("Date de naissance") {
                            NutriField(birth, { birth = formatBirth(it) }, placeholder = "JJ/MM/AAAA", keyboardType = KeyboardType.Number)
                        }
                        Labeled("Masse grasse, si connue (%)") {
                            NutriField(
                                bodyFat, { bodyFat = it.take(4) }, placeholder = "Laisser vide",
                                keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done,
                            )
                        }
                        Txt("Ce poids devient ta première pesée, visible dans Moi › Corps.", Type.secondary)
                    }
                    ErrorText(error)
                }

                Step.Activity -> StepScaffold(current, { go(Step.Measures) }, footer = {
                    PrimaryButton("Calculer ma cible", Domains.nutrition, ::computeTarget, busy = busy)
                }) {
                    StepTitle("Étape 1 sur 3 · Objectif", Domains.nutrition, "Ton activité, ton but", null)
                    Labeled("Activité") { ActivityList(activity) { activity = it } }
                    Labeled("Objectif") {
                        Choice(GOALS.map { it.second }, GOALS.indexOfFirst { it.first == goal }, Domains.nutrition.soft) {
                            goal = GOALS[it].first
                            rate = when (goal) {
                                "lose" -> 0.5
                                "gain" -> 0.25
                                else -> 0.0
                            }
                        }
                    }
                    if (goal != "maintain") {
                        val max = if (goal == "lose") MAX_LOSS_RATE else MAX_GAIN_RATE
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.fillMaxWidth()) {
                                Txt("Rythme visé, par semaine", nt(13f, 500), Modifier.weight(1f))
                                Txt("${formatDecimal(rate)} %", nt(13f, 600))
                            }
                            RateSlider(rate, 0.1, max) { rate = it }
                            number(weight)?.let { kg ->
                                Txt("Soit environ ${formatDecimal(Math.round(kg * rate / 10.0) / 10.0)} kg par semaine.", Type.secondary)
                            }
                        }
                    }
                    ErrorText(error)
                }

                Step.Target -> StepScaffold(current, { go(Step.Activity) }, footer = {
                    PrimaryButton("Valider et continuer", Domains.nutrition, ::confirmTarget, busy = busy)
                    GhostButton(if (manual == null) "Saisir ma cible à la main" else "Garder la cible calculée", {
                        manual = if (manual == null) "" else null
                        error = null
                    })
                }) {
                    StepTitle("Étape 1 sur 3 · Objectif", Domains.nutrition, "Ta cible quotidienne", null)
                    target?.let { TargetCard(it, goal) }
                    if (manual != null) {
                        Labeled("Ma cible (kcal par jour)") {
                            NutriField(manual.orEmpty(), { manual = it.filter(Char::isDigit).take(4) }, placeholder = "2000", keyboardType = KeyboardType.Number, imeAction = ImeAction.Done)
                        }
                    }
                    Txt(
                        "La cible s'ajuste les jours d'entraînement. Tu la retrouves sur la jauge d'Aujourd'hui.",
                        Type.secondary,
                        Modifier.fillMaxWidth(),
                        align = TextAlign.Center,
                    )
                    ErrorText(error)
                }

                Step.Identity -> StepScaffold(current, { go(Step.Target) }, footer = {
                    PrimaryButton("Continuer", Domains.community, ::confirmIdentity, busy = busy)
                    GhostButton("Plus tard", { go(Step.Sessions) })
                }) {
                    StepTitle(
                        "Étape 2 sur 3 · Communauté", Domains.community, "Comment te trouver",
                        "Tes amis te suivent par ton identifiant et voient tes séances.",
                    )
                    val normalized = handle.trim().lowercase(Locale.ROOT)
                    val shownName = displayName.trim().ifBlank { normalized.ifBlank { "Toi" } }
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Neutrals.card)
                            .border(1.dp, Neutrals.fieldBorder, RoundedCornerShape(Radius.card)).padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Avatar(shownName.take(2).uppercase(Locale.FRENCH), size = 44.dp, background = Domains.community.soft, foreground = Domains.community.textOnLight, fontSize = 15f)
                        Column(Modifier.weight(1f)) {
                            Txt(shownName, nt(15f, 600))
                            Txt(if (normalized.isEmpty()) "@identifiant" else "@$normalized", nt(13f, color = Neutrals.muted))
                        }
                        Txt("Aperçu", nt(11.5f, color = Neutrals.muted))
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Labeled("Identifiant", hint = "Unique, 3 à 20 caractères : lettres, chiffres et _. C'est par lui qu'on te trouve.") {
                            NutriField(
                                handle,
                                { handle = it.take(21) },
                                prefix = "@",
                                focusColor = Domains.community.textOnLight,
                                trailing = {
                                    if (HANDLE.matches(normalized)) Icon(R.drawable.lucide_check, 18.dp, Domains.training.fill)
                                },
                            )
                        }
                        Labeled("Nom affiché", hint = "Facultatif, et pas forcément unique. Ton adresse n'est jamais montrée.") {
                            NutriField(displayName, { displayName = it.take(40) }, focusColor = Domains.community.textOnLight, imeAction = ImeAction.Done)
                        }
                    }
                    ErrorText(error)
                }

                Step.Sessions -> StepScaffold(current, { go(Step.Identity) }, footer = {
                    PrimaryButton("Composer mon programme", Domains.training, ::composeProgram, busy = busy)
                }) {
                    StepTitle("Étape 3 sur 3 · Séances", Domains.training, "Tes séances", "Quatre réponses, et le programme se compose.")
                    Labeled("Ce que je veux travailler", hint = FOCUS.first { it.first == focus }.third) {
                        Choice(FOCUS.map { it.second }, FOCUS.indexOfFirst { it.first == focus }, Domains.training.seg) { focus = FOCUS[it].first }
                    }
                    Labeled("Ma salle", hint = "Les exercices sont limités à ce que cette enseigne propose.") {
                        GymPicker(gyms, gymId) { gymId = it }
                    }
                    Labeled("Poids libre ou machine") {
                        Choice(EQUIPMENT.map { it.second }, EQUIPMENT.indexOfFirst { it.first == equipment }, Domains.training.seg, textSize = 13.5f) {
                            equipment = EQUIPMENT[it].first
                        }
                    }
                    Labeled("Séances par semaine") {
                        Choice(RHYTHMS.map(Int::toString), RHYTHMS.indexOf(perWeek), Domains.training.seg, textSize = 15f, weight = 600) {
                            perWeek = RHYTHMS[it]
                        }
                    }
                    ErrorText(error)
                }

                Step.Program -> StepScaffold(current, { go(Step.Sessions) }, footer = {
                    PrimaryButton("Terminer", Domains.training, model::finishOnboarding)
                    GhostButton("Revoir mes réponses", { go(Step.Sessions) })
                }) {
                    val gym = gyms.firstOrNull { it.id == gymId }?.name
                    StepTitle(
                        "Étape 3 sur 3 · Séances", Domains.training, "Ton programme",
                        listOfNotNull(
                            FOCUS.first { it.first == focus }.second.let { if (focus == "full") "Haut et bas" else it },
                            gym,
                            EQUIPMENT.first { it.first == equipment }.second.lowercase(Locale.FRENCH),
                            "$perWeek par semaine",
                        ).joinToString(" · "),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (program.isEmpty()) Txt("Le programme est prêt, retrouve-le dans Sport.", Type.secondary)
                        program.forEach { template ->
                            Column(
                                Modifier.fillMaxWidth().tinted(Domains.training.soft).padding(horizontal = 16.dp, vertical = 14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Txt(template.name, nt(15f, 600), Modifier.weight(1f))
                                    Txt("${template.exercises.size} exercices", Type.small)
                                }
                                Txt(template.exercises.joinToString(" · ") { it.exercise.name }, nt(13f, color = Neutrals.muted, line = 1.55f))
                            }
                        }
                    }
                    Txt("Tu pourras tout modifier depuis Sport.", Type.secondary)
                }
            }
        }
    }
}

/** L'écran d'une étape : chevron et barre de progression, contenu défilant, boutons en bas. */
@Composable
private fun StepScaffold(
    step: Step?,
    onBack: (() -> Unit)?,
    footer: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Space.onboardingH),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (step != null && onBack != null) {
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(R.drawable.lucide_chevron_left, 22.dp, Neutrals.ink, Modifier.offset(x = (-4).dp).tap(onClick = onBack))
                    StepProgress(step, Modifier.weight(1f))
                }
            }
            content()
            Spacer(Modifier.height(8.dp))
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = Space.onboardingH).padding(top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = footer,
        )
    }
}

/** Trois segments de 5, chacun à la couleur de son étape. */
@Composable
private fun StepProgress(step: Step, modifier: Modifier) {
    val (a, b, c) = step.fill()
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        listOf(a to Domains.nutrition.fill, b to Domains.community.fill, c to Domains.training.fill).forEach { (fraction, color) ->
            Box(Modifier.weight(1f).height(5.dp).clip(CircleShape).background(Neutrals.stepTrack)) {
                if (fraction > 0f) Box(Modifier.fillMaxWidth(fraction).height(5.dp).clip(CircleShape).background(color))
            }
        }
    }
}

@Composable
private fun StepTitle(kicker: String, colors: DomainColors, title: String, subtitle: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Txt(kicker, nt(13f, 600, colors.textOnLight))
        Txt(title, Type.onboardingTitle)
        if (subtitle != null) Txt(subtitle, nt(14f, color = Neutrals.muted))
    }
}

@Composable
private fun ErrorText(error: String?) {
    if (error != null) Txt(error, nt(13f, 500, Macros.protein.text))
}

@Composable
private fun WelcomeStep() {
    Column(Modifier.padding(top = 56.dp, start = 4.dp, end = 4.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Txt("Compte créé", nt(14f, 600, Domains.nutrition.textOnLight))
            Txt("Trois réglages, et l'app est à toi.", nt(34f, 600, line = 1.1f, tracking = -0.035f))
            Txt("Deux minutes environ. Tout se modifie ensuite.", nt(15f, color = Neutrals.muted))
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            WelcomeCard(1, "Mon objectif", "Mesures, activité, cible calorique", Domains.nutrition, R.drawable.lucide_target)
            WelcomeCard(2, "Mon profil Communauté", "L'identifiant par lequel on te trouve", Domains.community, R.drawable.lucide_users)
            WelcomeCard(3, "Mes séances", "Ta salle, ton matériel, ton rythme", Domains.training, R.drawable.lucide_dumbbell)
        }
    }
}

@Composable
private fun WelcomeCard(number: Int, title: String, subtitle: String, colors: DomainColors, icon: Int) {
    Row(
        Modifier.fillMaxWidth().tinted(colors.soft).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(colors.fill), contentAlignment = Alignment.Center) {
            Txt("$number", nt(14f, 600, colors.textOnFill, line = 1f))
        }
        Column(Modifier.weight(1f)) {
            Txt(title, nt(15f, 600))
            Txt(subtitle, Type.secondary)
        }
        Icon(icon, 18.dp, colors.textOnLight)
    }
}

/** Segmenté de l'onboarding : rayon 14, sélection crème de rayon 11. */
@Composable
private fun Choice(
    options: List<String>,
    selected: Int,
    track: Color,
    textSize: Float = 14f,
    weight: Int = 500,
    onSelect: (Int) -> Unit,
) {
    SegmentedPill(
        options = options,
        selected = selected,
        onSelect = onSelect,
        modifier = Modifier.fillMaxWidth(),
        track = track,
        textColor = Neutrals.muted,
        selectedTextColor = Neutrals.ink,
        textStyle = nt(textSize, weight),
        outerRadius = Radius.field,
        innerRadius = 11.dp,
        itemPadding = 10.dp,
    )
}

@Composable
private fun ActivityList(selected: String, onSelect: (String) -> Unit) {
    val click = rememberSelectionClick()
    val nutrition = Domains.nutrition
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.tile)).background(Neutrals.card)
            .border(1.dp, Neutrals.fieldBorder, RoundedCornerShape(Radius.tile)),
    ) {
        ACTIVITIES.forEachIndexed { index, (key, label) ->
            val active = key == selected
            Row(
                Modifier.fillMaxWidth().background(if (active) nutrition.soft else Color.Transparent).tap {
                    click()
                    onSelect(key)
                }.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier.size(18.dp).clip(CircleShape)
                        .border(if (active) 5.dp else 1.5.dp, if (active) nutrition.textOnLight else Neutrals.radioBorder, CircleShape),
                )
                Txt(label, nt(14f, if (active) 600 else 400))
            }
            if (index < ACTIVITIES.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
        }
    }
}

/** Curseur du rythme : piste de 5, pastille crème de 22. Pas de 0,05 %. */
@Composable
private fun RateSlider(value: Double, min: Double, max: Double, onChange: (Double) -> Unit) {
    val nutrition = Domains.nutrition
    BoxWithConstraints(Modifier.fillMaxWidth().height(22.dp)) {
        val widthPx = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        val fraction = ((value - min) / (max - min)).toFloat().coerceIn(0f, 1f)
        fun update(x: Float) {
            val raw = min + (x / widthPx).coerceIn(0f, 1f) * (max - min)
            onChange((Math.round(raw / 0.05) * 0.05).let { Math.round(it * 100) / 100.0 })
        }
        Box(
            Modifier.fillMaxSize().pointerInput(min, max, widthPx) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    update(down.position.x)
                    horizontalDrag(down.id) { change ->
                        update(change.position.x)
                        change.consume()
                    }
                }
            },
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(Neutrals.stepTrack)) {
                Box(Modifier.fillMaxWidth(fraction).height(5.dp).clip(CircleShape).background(nutrition.fill))
            }
            Box(
                Modifier
                    .offset(x = maxWidth * fraction - 11.dp)
                    .size(22.dp)
                    .shadow(2.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Neutrals.card),
            )
        }
    }
}

@Composable
private fun GymPicker(gyms: List<Gym>, selected: Long?, onSelect: (Long) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(Radius.field)
    Column(Modifier.fillMaxWidth().clip(shape).background(Neutrals.card).border(1.dp, Neutrals.fieldBorder, shape)) {
        Row(
            Modifier.fillMaxWidth().height(50.dp).tap { open = !open }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Txt(gyms.firstOrNull { it.id == selected }?.name ?: if (gyms.isEmpty()) "Chargement…" else "Choisir", nt(16f, 500), Modifier.weight(1f))
            Icon(R.drawable.lucide_chevron_down, 18.dp, Neutrals.muted)
        }
        if (open) {
            gyms.forEach { gym ->
                Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
                Row(
                    Modifier.fillMaxWidth().tap {
                        onSelect(gym.id)
                        open = false
                    }.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Txt(gym.name, nt(15f, if (gym.id == selected) 600 else 400), Modifier.weight(1f))
                    if (gym.id == selected) Icon(R.drawable.lucide_check, 16.dp, Domains.training.fill)
                }
            }
        }
    }
}

/** La cible calculée : anneau de 150 en trois parts, puis le détail du calcul. */
@Composable
private fun TargetCard(target: EnergyTarget, goal: String) {
    val proteinKcal = target.proteinG * 4
    val carbsKcal = target.carbsG * 4
    val fatKcal = target.fatG * 9
    val total = (proteinKcal + carbsKcal + fatKcal).takeIf { it > 0 } ?: 1.0
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Neutrals.card)
            .border(1.dp, Neutrals.fieldBorder, RoundedCornerShape(22.dp)).padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Ring(
            150.dp,
            14.dp,
            Neutrals.track,
            listOf(
                (proteinKcal / total).toFloat() to Macros.protein.fill,
                (carbsKcal / total).toFloat() to Macros.carbs.fill,
                (fatKcal / total).toFloat() to Macros.fat.fill,
            ),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Txt(formatInt(target.targetKcal), nt(34f, 700, Domains.nutrition.textOnLight, line = 1f, tracking = -0.035f))
                Txt("kcal par jour", nt(12f, color = Neutrals.muted))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            listOf(
                Triple(target.proteinG, "Protéines", Macros.protein.fill),
                Triple(target.carbsG, "Glucides", Macros.carbs.fill),
                Triple(target.fatG, "Lipides", Macros.fat.fill),
            ).forEach { (grams, label, color) ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Txt("${formatInt(grams)} g", nt(17f, 600))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
                        Txt(label, nt(12f, color = Neutrals.muted))
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            Spacer(Modifier.height(6.dp))
            DetailRow("Métabolisme de base", "${formatInt(target.bmrKcal)} kcal")
            DetailRow("Dépense estimée", "${formatInt(target.maintenanceKcal)} kcal")
            DetailRow(
                when (goal) {
                    "lose" -> "Déficit pour « Perdre »"
                    "gain" -> "Surplus pour « Prendre »"
                    else -> "Écart"
                },
                "${formatSigned(target.adjustmentKcal, 0)} kcal",
            )
            if (target.floored) Txt("Le rythme visé descendrait sous le plancher : la cible a été relevée.", nt(12f, color = Neutrals.muted))
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Txt(label, nt(13f, color = Neutrals.muted), Modifier.weight(1f))
        Txt(value, nt(13f, 500))
    }
}

/** 14031994 → 14/03/1994, au fil de la frappe. */
private fun formatBirth(input: String): String {
    val digits = input.filter(Char::isDigit).take(8)
    return buildString {
        digits.forEachIndexed { index, char ->
            if (index == 2 || index == 4) append('/')
            append(char)
        }
    }
}

private fun formatDecimal(value: Double): String =
    String.format(Locale.FRANCE, "%.2f", value).trimEnd('0').trimEnd(',')
