package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.data.Identity
import fr.nutriperso.app.ui.theme.Space
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Le gabarit d'un écran : défilement, marges de 16, blocs espacés de 12, et
 * la place de la barre d'onglets en bas quand il y en a une.
 */
@Composable
fun ScreenColumn(withTabBar: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(horizontal = Space.screenH)
            .padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(Space.block),
    ) {
        content()
        Spacer(Modifier.navigationBarsPadding().height(if (withTabBar) TabBarClearance else 16.dp))
    }
}

/** « CL » pour Camille L., « CA » pour @camille_s. */
fun initialsOf(identity: Identity?): String {
    val source = identity?.displayName?.takeIf { it.isNotBlank() } ?: identity?.handle ?: return "·"
    val words = source.split(' ', '_', '-', '.').filter { it.isNotBlank() }
    val initials = if (words.size >= 2) "${words[0].first()}${words[1].first()}" else source.take(2)
    return initials.uppercase(Locale.FRENCH)
}

private val longDate = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)

/** « Mardi 30 septembre ». */
fun formatLongDate(iso: String): String =
    LocalDate.parse(iso).format(longDate).replaceFirstChar { it.titlecase(Locale.FRENCH) }

/** « L 29 » sous les barres de la semaine. */
fun formatDayInitial(iso: String): String {
    val date = LocalDate.parse(iso)
    val initial = "LMMJVSD"[date.dayOfWeek.value - 1]
    return "$initial ${date.dayOfMonth}"
}
