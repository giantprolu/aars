package fr.nutriperso.app.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp

/**
 * Tokens de la refonte B v4, palette 2 (Annexe/mobile).
 *
 * Un domaine, une couleur, partout : Nutrition en vert, Cuisine en orange,
 * Sport en bleu nuit, Corps en violet, Communauté en cyan.
 */
@Immutable
data class DomainColors(
    /** Couleur pleine : boutons, anneaux, tuiles pleines. */
    val fill: Color,
    /** Fond de tuile ou de carte teintée. */
    val soft: Color,
    /** Piste de barre, fond de segmenté. */
    val seg: Color,
    /** Barres secondaires, graphiques. */
    val light: Color,
    /** Texte et icônes sur fond clair. Jamais [fill] sur clair pour Nutrition, Cuisine, Communauté. */
    val textOnLight: Color,
    /** Texte et icônes posés sur [fill]. */
    val textOnFill: Color,
)

object Domains {
    val nutrition = DomainColors(
        fill = Color(0xFF36B37E), soft = Color(0xFFDDF3E9), seg = Color(0xFFBDE7D3),
        light = Color(0xFF86D2AF), textOnLight = Color(0xFF1F7A52), textOnFill = Color(0xFF0B3B26),
    )
    val kitchen = DomainColors(
        fill = Color(0xFFF7A007), soft = Color(0xFFFDEBCC), seg = Color(0xFFFBD89A),
        light = Color(0xFFF9C25E), textOnLight = Color(0xFF945B00), textOnFill = Color(0xFF3A2600),
    )
    val training = DomainColors(
        fill = Color(0xFF262E57), soft = Color(0xFFDDE0EE), seg = Color(0xFFC2C7E0),
        light = Color(0xFF8E96C0), textOnLight = Color(0xFF262E57), textOnFill = Color(0xFFFFFFFF),
    )
    val body = DomainColors(
        fill = Color(0xFF7C5CFC), soft = Color(0xFFEAE5FF), seg = Color(0xFFD6CCFE),
        light = Color(0xFFB3A2FD), textOnLight = Color(0xFF5A3BD6), textOnFill = Color(0xFFFFFFFF),
    )
    val community = DomainColors(
        fill = Color(0xFFA5E9E8), soft = Color(0xFFE3F8F7), seg = Color(0xFFC8F1F0),
        light = Color(0xFFA5E9E8), textOnLight = Color(0xFF1C6968), textOnFill = Color(0xFF0E4D4C),
    )

    /** Contours, anneaux d'avatar, pointillés Communauté. */
    val communityRing = Color(0xFF4FBFBE)
}

@Immutable
data class MacroColors(val fill: Color, val track: Color, val text: Color)

object Macros {
    val protein = MacroColors(Color(0xFFC32B42), Color(0xFFF8DDE1), Color(0xFF9E2236))
    val carbs = MacroColors(Color(0xFFF7A007), Color(0xFFFDEBCC), Color(0xFF945B00))
    val fat = MacroColors(Color(0xFF4FBFBE), Color(0xFFE3F8F7), Color(0xFF1C6968))
}

object Neutrals {
    /** Texte seulement, jamais un fond plein. */
    val ink = Color(0xFF231F1A)
    val muted = Color(0xFF736B62)
    val faint = Color(0xFFA39A8F)
    val tabInactive = Color(0xFF8A8279)
    val screen = Color(0xFFF4F1EB)
    val card = Color(0xFFFFFDF9)
    val cardBorder = Color(0xFFE9E3D9)
    val fieldBorder = Color(0xFFE6E0D6)
    val divider = Color(0xFFEEE8DE)
    val track = Color(0xFFEBE5DA)
    val emptyBar = Color(0xFFE6E0D6)
    val chip = Color(0xFFF1ECE4)
    val periodTrack = Color(0xFFE8E2D8)
    val sheetHandle = Color(0xFFE0D9CE)
    val stepTrack = Color(0xFFE0D9CE)
    val radioBorder = Color(0xFFB8AE9F)
    val starOff = Color(0xFFD8D0C3)
    val tabBarBorder = Color(0xFFE6E0D6)
    val scrim = Color(0x801C1814)
    val workoutDark = Color(0xFF1C1915)
    val scanner = Color(0xFF15120F)
    val recordBg = Color(0xFFFDEBCC)
    val recordText = Color(0xFF945B00)
    val heartActive = Color(0xFF9E2236)
}

object Radius {
    val sheet = 28.dp
    val sessionCard = 20.dp
    val card = 18.dp
    val tile = 16.dp
    val field = 14.dp
    val domainBadge = 11.dp
    val small = 10.dp
}

object Space {
    val screenH = 16.dp
    val onboardingH = 22.dp
    val block = 12.dp
    val tabBarHeight = 58.dp
}

object Motion {
    /** Rebond des bulles du bouton +, toasts. */
    val spring = CubicBezierEasing(.34f, 1.56f, .64f, 1f)

    /** Entrée des feuilles. */
    val sheet = CubicBezierEasing(.2f, .9f, .3f, 1f)
    const val BUBBLES_MS = 380
    const val BUBBLE_STAGGER_MS = 40
    const val SHEET_IN_MS = 350
    const val SCRIM_MS = 250
    const val FAB_ROTATE_MS = 300
    const val LONG_PRESS_MS = 500L
    const val TOAST_HOLD_MS = 2200L

    /** Positions des bulles par rapport au centre du +. */
    val seanceOffset = DpOffset((-92).dp, (-78).dp)
    val repasOffset = DpOffset(0.dp, (-128).dp)
    val peseeOffset = DpOffset(92.dp, (-78).dp)
    val bubbleSize = 54.dp
    val bubbleSizeMain = 66.dp
    val fabSize = 50.dp
}
