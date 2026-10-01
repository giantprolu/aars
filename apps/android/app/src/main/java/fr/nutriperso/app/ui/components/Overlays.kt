package fr.nutriperso.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.R
import fr.nutriperso.app.ui.theme.Motion
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Le voile sous les feuilles et l'arc du +, en fondu de 250 ms. */
@Composable
fun Scrim(visible: Boolean, onDismiss: () -> Unit) {
    AnimatedVisibility(visible, enter = fadeIn(tween(Motion.SCRIM_MS)), exit = fadeOut(tween(Motion.SCRIM_MS))) {
        Box(Modifier.fillMaxSize().background(Neutrals.scrim).tap(onClick = onDismiss))
    }
}

/**
 * Feuille du bas : rayon 28 en haut, poignée, titre de 19, bouton ×. Monte en
 * 350 ms ; se ferme d'un glissé au-delà de 30 % de sa hauteur ou d'un geste vif.
 */
@Composable
fun BoxScope.NutriSheet(
    visible: Boolean,
    title: String,
    onDismiss: () -> Unit,
    gap: Int = 14,
    content: @Composable ColumnScope.() -> Unit,
) {
    val scope = rememberCoroutineScope()
    val drag = remember { Animatable(0f) }
    var height by remember { mutableIntStateOf(1) }
    val flingThreshold = with(LocalDensity.current) { 700.dp.toPx() }
    LaunchedEffect(visible) { if (visible) drag.snapTo(0f) }

    AnimatedVisibility(
        visible,
        modifier = Modifier.align(Alignment.BottomCenter),
        enter = slideInVertically(tween(Motion.SHEET_IN_MS, easing = Motion.sheet)) { (it * 1.1f).roundToInt() },
        exit = slideOutVertically(tween(260, easing = Motion.sheet)) { (it * 1.1f).roundToInt() },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .onSizeChanged { height = it.height.coerceAtLeast(1) }
                .offset { IntOffset(0, drag.value.roundToInt()) }
                .draggable(
                    orientation = Orientation.Vertical,
                    state = rememberDraggableState { delta ->
                        scope.launch { drag.snapTo((drag.value + delta).coerceAtLeast(0f)) }
                    },
                    onDragStopped = { velocity ->
                        if (drag.value > height * 0.3f || velocity > flingThreshold) {
                            onDismiss()
                        } else {
                            drag.animateTo(0f, tween(200))
                        }
                    },
                )
                .clip(RoundedCornerShape(topStart = Radius.sheet, topEnd = Radius.sheet))
                .background(Neutrals.card)
                .navigationBarsPadding()
                .imePadding()
                .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(gap.dp),
        ) {
            Box(
                Modifier.align(Alignment.CenterHorizontally).width(40.dp).height(4.dp)
                    .clip(CircleShape).background(Neutrals.sheetHandle),
            )
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt(title, Type.sheetTitle, Modifier.weight(1f))
                CloseButton(onDismiss)
            }
            content()
        }
    }
}

@Composable
fun CloseButton(onClick: () -> Unit, dark: Boolean = false) {
    Box(
        Modifier
            .size(if (dark) 36.dp else 32.dp)
            .clip(CircleShape)
            .background(if (dark) androidx.compose.ui.graphics.Color.White.copy(alpha = 0.14f) else Neutrals.chip)
            .tap(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            R.drawable.lucide_x,
            if (dark) 16.dp else 15.dp,
            if (dark) androidx.compose.ui.graphics.Color.White else Neutrals.ink,
        )
    }
}

/** Le message du moment : une pilule sombre en haut, 2,2 s. */
@Stable
class ToastState {
    var message by mutableStateOf("")
        private set
    var visible by mutableStateOf(false)
        private set
    private var serial by mutableIntStateOf(0)

    fun show(text: String) {
        message = text
        visible = true
        serial++
    }

    @Composable
    fun AutoHide() {
        LaunchedEffect(serial) {
            if (visible) {
                delay(Motion.TOAST_HOLD_MS)
                visible = false
            }
        }
    }
}

@Composable
fun BoxScope.ToastHost(state: ToastState) {
    state.AutoHide()
    val lift = with(LocalDensity.current) { 20.dp.roundToPx() }
    AnimatedVisibility(
        state.visible,
        modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 6.dp),
        enter = slideInVertically(tween(300, easing = Motion.spring)) { -lift } +
            fadeIn(tween(200)),
        exit = slideOutVertically(tween(300)) { -lift } + fadeOut(tween(200)),
    ) {
        Box(
            Modifier.clip(CircleShape).background(Neutrals.ink).padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Txt(state.message, nt(13.5f, 500, androidx.compose.ui.graphics.Color.White), maxLines = 1)
        }
    }
}
