package fr.aars.app.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fr.aars.app.data.ApiResult
import fr.aars.app.ui.components.ErrorBanner
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.tinted
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Type

/** Une lecture d'écran : la dernière valeur reçue, l'erreur éventuelle, et de quoi relire. */
@Stable
class Loaded<T> {
    var value by mutableStateOf<T?>(null)
        internal set
    var error by mutableStateOf<String?>(null)
        internal set
    internal var serial by mutableIntStateOf(0)

    fun reload() {
        serial++
    }
}

/**
 * Lit une route à l'affichage, et la relit quand une clé change (semaine,
 * période, révision après écriture). La valeur précédente reste affichée
 * pendant la relecture.
 */
@Composable
fun <T> rememberLoaded(vararg keys: Any?, fetch: suspend () -> ApiResult<T>): Loaded<T> {
    val state = remember { Loaded<T>() }
    LaunchedEffect(*keys, state.serial) {
        when (val result = fetch()) {
            is ApiResult.Ok -> {
                state.value = result.value
                state.error = null
            }
            is ApiResult.Failed -> state.error = result.message
        }
    }
    return state
}

/** Erreur en bandeau, ou squelettes tant que rien n'est arrivé. Vrai si la valeur est là. */
@Composable
fun <T> LoadedGate(loaded: Loaded<T>, skeletons: List<Dp> = listOf(80.dp, 160.dp, 120.dp)): Boolean {
    loaded.error?.let { ErrorBanner(it, onRetry = loaded::reload) }
    if (loaded.value == null) {
        skeletons.forEach { height -> Box(Modifier.fillMaxWidth().height(height).tinted(Neutrals.track)) }
        return false
    }
    return true
}

/** Carte d'état vide, sobre. */
@Composable
fun EmptyCard(title: String, body: String) {
    androidx.compose.foundation.layout.Column(Modifier.fillMaxWidth().card().padding(16.dp)) {
        Txt(title, fr.aars.app.ui.theme.nt(15f, 600))
        Txt(body, Type.secondary)
    }
}
