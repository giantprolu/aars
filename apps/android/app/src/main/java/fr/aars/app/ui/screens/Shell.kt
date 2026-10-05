package fr.nutriperso.app.ui.screens

import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.QuickSession
import fr.nutriperso.app.data.SearchHit
import fr.nutriperso.app.ui.kitchen.AddItemScreen
import fr.nutriperso.app.ui.kitchen.ImportRecipeScreen
import fr.nutriperso.app.ui.kitchen.RecipeEditorScreen
import fr.nutriperso.app.ui.kitchen.ScanCheckScreen
import fr.nutriperso.app.ui.onboarding.OnboardingFlow
import fr.nutriperso.app.ui.training.ComposeScreen
import fr.nutriperso.app.ui.training.ImportScreen
import fr.nutriperso.app.ui.training.WorkoutScreen
import fr.nutriperso.app.ui.add.MealSheet
import fr.nutriperso.app.ui.add.ScannerOverlay
import fr.nutriperso.app.ui.add.SessionSheet
import fr.nutriperso.app.ui.add.WeighSheet
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.Scrim
import fr.nutriperso.app.ui.components.ToastHost
import fr.nutriperso.app.ui.components.ToastState
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Motion
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Space
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class Tab(val label: String, @DrawableRes val icon: Int, val active: Color) {
    Today("Aujourd'hui", R.drawable.lucide_sun, Domains.nutrition.textOnLight),
    Kitchen("Cuisine", R.drawable.lucide_utensils, Domains.kitchen.textOnLight),
    Training("Sport", R.drawable.lucide_dumbbell, Domains.training.textOnLight),
    Community("Communauté", R.drawable.lucide_users, Domains.community.textOnLight),
}

/** Écrans poussés par-dessus la coquille, avec un retour. */
enum class Pushed { Me, Progress, History, People, Account, Health, Premium }

enum class AddSheet { Meal, Session, Weigh, Scan }

/** Hauteur réservée en bas des onglets, sous laquelle passe la barre. */
val TabBarClearance: Dp = Space.tabBarHeight + 16.dp

/**
 * La coquille : quatre onglets, le + central qui ouvre son arc, Moi et
 * Progression poussés par-dessus, les feuilles d'ajout, les toasts.
 */
@Composable
fun MainShell(model: AppModel) {
    var tab by rememberSaveable { mutableStateOf(Tab.Today) }
    var stack by remember { mutableStateOf(listOf<Pushed>()) }
    var fabOpen by remember { mutableStateOf(false) }
    var sheet by remember { mutableStateOf<AddSheet?>(null) }
    var scanned by remember { mutableStateOf<SearchHit?>(null) }
    var kitchenFlow by remember { mutableStateOf<KitchenFlow?>(null) }
    var historyDate by rememberSaveable { mutableStateOf<String?>(null) }
    var editingGoal by rememberSaveable { mutableStateOf(false) }
    var workoutId by rememberSaveable { mutableStateOf<Long?>(null) }
    var flow by rememberSaveable { mutableStateOf<TrainingFlow?>(null) }
    val scope = rememberCoroutineScope()
    var planSlot by remember { mutableStateOf<PlanSlot?>(null) }
    var moderation by remember { mutableStateOf<ModerationTarget?>(null) }
    var planBasket by remember { mutableStateOf<List<fr.nutriperso.app.data.BasketRow>>(emptyList()) }
    val toast = remember { ToastState() }
    val holder = rememberSaveableStateHolder()

    LaunchedEffect(Unit) { model.toasts.collect { toast.show(it) } }

    fun closeAll() {
        fabOpen = false
        sheet = null
        planSlot = null
        moderation = null
    }

    fun pick(target: AddSheet) {
        fabOpen = false
        sheet = target
        if (target != AddSheet.Scan) model.loadQuick()
    }

    /** Reprend la séance ouverte, lance la suivante du programme, ou une libre. */
    fun startSession(session: QuickSession?) {
        closeAll()
        if (session?.kind == "open" && session.sessionId != null) {
            workoutId = session.sessionId
            return
        }
        scope.launch {
            when (val result = model.api.startSession(session?.templateId)) {
                is ApiResult.Ok -> {
                    model.bump()
                    workoutId = result.value.id
                }
                is ApiResult.Failed -> toast.show(result.message)
            }
        }
    }

    // Un rappel du déjeuner touché : droit à la feuille Repas.
    LaunchedEffect(model.pendingMealSheet) {
        if (model.pendingMealSheet) {
            model.pendingMealSheet = false
            stack = emptyList()
            pick(AddSheet.Meal)
        }
    }

    // Une limite gratuite atteinte : l'écran Premium, par-dessus ce qu'on faisait.
    LaunchedEffect(model.paywallRequested) {
        if (model.paywallRequested) {
            model.paywallRequested = false
            closeAll()
            kitchenFlow = null
            if (stack.lastOrNull() != Pushed.Premium) stack = stack + Pushed.Premium
        }
    }

    BackHandler(enabled = fabOpen || sheet != null || planSlot != null || moderation != null || stack.isNotEmpty()) {
        when {
            sheet != null || fabOpen || planSlot != null || moderation != null -> closeAll()
            else -> stack = stack.dropLast(1)
        }
    }

    val openMe = { stack = listOf(Pushed.Me) }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        holder.SaveableStateProvider(tab.name) {
            when (tab) {
                Tab.Today -> TodayScreen(
                    model,
                    onMe = openMe,
                    onPick = ::pick,
                    onOpenTab = { tab = it },
                    onHistory = { stack = listOf(Pushed.History) },
                    onEditGoal = { editingGoal = true },
                )
                Tab.Kitchen -> KitchenScreen(
                    model,
                    onMe = openMe,
                    onPlanSlot = { slot, basket ->
                        planBasket = basket
                        planSlot = slot
                    },
                    onScanCheck = { week, items -> kitchenFlow = KitchenFlow.ScanCheck(week, items) },
                    onAddItem = { week -> kitchenFlow = KitchenFlow.AddItem(week) },
                    onNewRecipe = { kitchenFlow = KitchenFlow.NewRecipe },
                    onImportRecipe = { kitchenFlow = KitchenFlow.ImportRecipe },
                )
                Tab.Training -> TrainingScreen(model, onMe = openMe, onStart = { pick(AddSheet.Session) })
                Tab.Community -> CommunityScreen(
                    model,
                    onMe = openMe,
                    onPeople = { stack = listOf(Pushed.People) },
                    onModerate = { moderation = it },
                )
            }
        }

        NutriTabBar(tab, onSelect = { tab = it }, modifier = Modifier.align(Alignment.BottomCenter))

        AnimatedContent(
            targetState = stack.lastOrNull(),
            transitionSpec = {
                val forward = (targetState?.ordinal ?: -1) > (initialState?.ordinal ?: -1)
                if (forward) {
                    slideInHorizontally(tween(320)) { it } togetherWith fadeOut(tween(320))
                } else {
                    fadeIn(tween(320)) togetherWith slideOutHorizontally(tween(320)) { it }
                }
            },
            label = "pile",
        ) { route ->
            when (route) {
                Pushed.Me -> MeScreen(
                    model,
                    onBack = { stack = emptyList() },
                    onProgress = { stack = listOf(Pushed.Me, Pushed.Progress) },
                    onWeigh = { pick(AddSheet.Weigh) },
                    onAccount = { stack = listOf(Pushed.Me, Pushed.Account) },
                    onHealth = { stack = listOf(Pushed.Me, Pushed.Health) },
                    onPremium = { stack = listOf(Pushed.Me, Pushed.Premium) },
                )
                Pushed.Progress -> ProgressScreen(model, onBack = { stack = listOf(Pushed.Me) })
                Pushed.Account -> AccountScreen(model, onBack = { stack = listOf(Pushed.Me) }, onEditGoal = { editingGoal = true })
                Pushed.Health -> HealthScreen(model, onBack = { stack = listOf(Pushed.Me) })
                Pushed.Premium -> PremiumScreen(model, onBack = { stack = stack.dropLast(1) })
                Pushed.People -> PeopleScreen(model, onBack = { stack = emptyList() }, onModerate = { moderation = it })
                Pushed.History -> HistoryScreen(model, onBack = { stack = emptyList() }, onDay = { historyDate = it })
                null -> Box(Modifier.fillMaxSize())
            }
        }

        Scrim(visible = fabOpen || planSlot != null || moderation != null || sheet == AddSheet.Meal || sheet == AddSheet.Session || sheet == AddSheet.Weigh, onDismiss = ::closeAll)

        if (stack.isEmpty()) {
            FabArc(
                open = fabOpen,
                onToggle = { if (sheet != null) closeAll() else fabOpen = !fabOpen },
                onLongPress = { pick(AddSheet.Scan) },
                onPick = ::pick,
            )
        }

        MealSheet(
            visible = sheet == AddSheet.Meal,
            model = model,
            preset = scanned,
            onDismiss = {
                closeAll()
                scanned = null
            },
            onScan = { pick(AddSheet.Scan) },
            onMessage = toast::show,
        )
        PlanSlotSheet(planSlot, planBasket, model, onDismiss = ::closeAll)
        ModerationSheet(moderation, model, onDismiss = ::closeAll)
        SessionSheet(
            visible = sheet == AddSheet.Session,
            model = model,
            onDismiss = ::closeAll,
            onStart = ::startSession,
            onImport = {
                closeAll()
                flow = TrainingFlow.Import
            },
            onCompose = {
                closeAll()
                flow = TrainingFlow.Compose
            },
        )
        WeighSheet(visible = sheet == AddSheet.Weigh, model = model, onDismiss = ::closeAll)
        ScannerOverlay(
            visible = sheet == AddSheet.Scan,
            model = model,
            onDismiss = ::closeAll,
            onFound = { hit ->
                scanned = hit
                pick(AddSheet.Meal)
            },
        )

        historyDate?.let { date ->
            DayScreen(model, date, onBack = { historyDate = null })
            BackHandler { historyDate = null }
        }
        if (editingGoal) {
            OnboardingFlow(model, editGoal = true, onClose = { editingGoal = false })
        }

        when (val current = kitchenFlow) {
            is KitchenFlow.ScanCheck -> ScanCheckScreen(model, current.week, current.items, onClose = { kitchenFlow = null })
            is KitchenFlow.AddItem -> AddItemScreen(model, current.week, onClose = { kitchenFlow = null })
            KitchenFlow.NewRecipe -> RecipeEditorScreen(model, onClose = { kitchenFlow = null })
            KitchenFlow.ImportRecipe -> ImportRecipeScreen(model, onClose = { kitchenFlow = null })
            null -> Unit
        }

        when (flow) {
            TrainingFlow.Compose -> ComposeScreen(model, onClose = { flow = null }, onStarted = { id ->
                flow = null
                workoutId = id
            })
            TrainingFlow.Import -> ImportScreen(model, onClose = { flow = null })
            null -> Unit
        }

        AnimatedVisibility(
            visible = workoutId != null,
            enter = slideInVertically(tween(Motion.SHEET_IN_MS, easing = Motion.sheet)) { it },
            exit = slideOutVertically(tween(260)) { it },
        ) {
            // Garde l'identifiant pendant l'animation de sortie.
            val id = remember { mutableStateOf(workoutId ?: 0L) }
            workoutId?.let { id.value = it }
            WorkoutScreen(model, id.value, onClose = {
                workoutId = null
                model.bump()
                model.refreshToday()
            })
        }

        ToastHost(toast)
    }
}

enum class TrainingFlow { Compose, Import }

/** Les écrans plein écran de Cuisine. */
sealed interface KitchenFlow {
    data class ScanCheck(val week: String, val items: List<fr.nutriperso.app.data.ShoppingItemRow>) : KitchenFlow
    data class AddItem(val week: String) : KitchenFlow
    data object NewRecipe : KitchenFlow
    data object ImportRecipe : KitchenFlow
}

/** La barre d'onglets : 58 de haut, fond crème à 96 %, filet en haut, place vide au centre pour le +. */
@Composable
fun NutriTabBar(current: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().background(Neutrals.card.copy(alpha = 0.96f))) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.tabBarBorder))
        Row(
            Modifier.fillMaxWidth().height(Space.tabBarHeight).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val tabs = Tab.entries
            tabs.forEachIndexed { index, tab ->
                if (index == 2) Spacer(Modifier.weight(1f))
                val active = tab == current
                val color = if (active) tab.active else Neutrals.tabInactive
                Column(
                    Modifier.weight(1f).tap { onSelect(tab) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(tab.icon, 22.dp, color)
                    Txt(tab.label, if (active) Type.tabActive else Type.tab, color = color, maxLines = 1)
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding())
    }
}

/**
 * Le bouton + et son arc (maquette « Bouton + interactif »).
 *
 * Toucher : le + devient un × crème, trois bulles sortent en rebond, décalées
 * de 40 ms. Appui long de 500 ms : le scanner, directement.
 */
@Composable
fun BoxScope.FabArc(
    open: Boolean,
    onToggle: () -> Unit,
    onLongPress: () -> Unit,
    onPick: (AddSheet) -> Unit,
) {
    val view = LocalView.current
    val nutrition = Domains.nutrition
    val background by animateColorAsState(if (open) Neutrals.card else nutrition.fill, tween(250), label = "fond du +")
    val tint by animateColorAsState(if (open) Neutrals.ink else nutrition.textOnFill, tween(250), label = "icône du +")
    val rotation by animateFloatAsState(if (open) 135f else 0f, tween(Motion.FAB_ROTATE_MS, easing = Motion.spring), label = "rotation")
    val scale by animateFloatAsState(if (open) 0.92f else 1f, tween(Motion.FAB_ROTATE_MS, easing = Motion.spring), label = "échelle")

    // Le centre du + : au milieu de la barre d'onglets.
    val anchor = Modifier
        .align(Alignment.BottomCenter)
        .navigationBarsPadding()
        .padding(bottom = (Space.tabBarHeight - Motion.fabSize) / 2 + 1.dp)

    Bubble(open, 0, Motion.seanceOffset, Motion.bubbleSize, Domains.training.fill, Color.White, R.drawable.lucide_dumbbell, 22.dp, "Séance", anchor) {
        onPick(AddSheet.Session)
    }
    Bubble(open, 1, Motion.repasOffset, Motion.bubbleSizeMain, nutrition.fill, nutrition.textOnFill, R.drawable.lucide_utensils, 26.dp, "Repas", anchor) {
        onPick(AddSheet.Meal)
    }
    Bubble(open, 2, Motion.peseeOffset, Motion.bubbleSize, Domains.body.fill, Color.White, R.drawable.lucide_scale, 22.dp, "Pesée", anchor) {
        onPick(AddSheet.Weigh)
    }

    Box(
        anchor
            .size(Motion.fabSize)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .shadow(10.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.35f), spotColor = Color.Black.copy(alpha = 0.35f))
            .clip(CircleShape)
            .background(background)
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown()
                    var released = false
                    var cancelled = false
                    withTimeoutOrNull(Motion.LONG_PRESS_MS) {
                        val up = waitForUpOrCancellation()
                        released = up != null
                        cancelled = up == null
                    }
                    when {
                        released -> onToggle()
                        cancelled -> Unit
                        else -> {
                            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            onLongPress()
                            waitForUpOrCancellation()
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(R.drawable.lucide_plus, 24.dp, tint, Modifier.graphicsLayer { rotationZ = rotation })
    }
}

@Composable
private fun BoxScope.Bubble(
    open: Boolean,
    index: Int,
    offset: DpOffset,
    size: Dp,
    color: Color,
    tint: Color,
    @DrawableRes icon: Int,
    iconSize: Dp,
    label: String,
    anchor: Modifier,
    onClick: () -> Unit,
) {
    val progress = remember { Animatable(0f) }
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(open) {
        if (open) {
            delay((index * Motion.BUBBLE_STAGGER_MS).toLong())
            coroutineScope {
                launch { alpha.animateTo(1f, tween(200)) }
                progress.animateTo(1f, tween(Motion.BUBBLES_MS, easing = Motion.spring))
            }
        } else {
            coroutineScope {
                launch { alpha.animateTo(0f, tween(200)) }
                progress.animateTo(0f, tween(Motion.BUBBLES_MS, easing = Motion.spring))
            }
        }
    }
    val density = LocalDensity.current
    val dx = with(density) { offset.x.toPx() }
    val dy = with(density) { offset.y.toPx() }
    val lift = with(density) { ((Motion.fabSize - size) / 2).toPx() }

    if (alpha.value == 0f && !open) return
    Box(
        anchor
            .size(size)
            .graphicsLayer {
                val p = progress.value
                translationX = dx * p
                translationY = dy * p + lift
                val s = 0.2f + 0.8f * p
                scaleX = s
                scaleY = s
                this.alpha = alpha.value
            }
            .shadow(14.dp, CircleShape, ambientColor = color.copy(alpha = 0.6f), spotColor = color.copy(alpha = 0.6f))
            .clip(CircleShape)
            .background(color)
            .tap(enabled = open, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, iconSize, tint)
    }
    // Le libellé, 6 pt sous la bulle, hors de sa zone de toucher.
    Txt(
        label,
        nt(12.5f, 700, Color.White),
        anchor
            .size(size)
            .graphicsLayer {
                val p = progress.value
                translationX = dx * p
                translationY = dy * p + lift
                this.alpha = alpha.value * p.coerceIn(0f, 1f)
            }
            .wrapLabel(),
        maxLines = 1,
    )
}

/** Pose le libellé sous la bulle, centré, sans contrainte de largeur. */
private fun Modifier.wrapLabel(): Modifier = this.layout { measurable, constraints ->
    val placeable = measurable.measure(Constraints())
    val gap = 6.dp.roundToPx()
    layout(constraints.maxWidth, constraints.maxHeight) {
        placeable.place((constraints.maxWidth - placeable.width) / 2, constraints.maxHeight + gap)
    }
}
