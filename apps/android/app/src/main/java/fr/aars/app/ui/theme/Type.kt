package fr.aars.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import fr.aars.app.R

/**
 * Instrument Sans, police variable embarquée (OFL, licences/). Chaque graisse
 * pointe sur le même fichier : Compose règle l'axe `wght` d'après le poids.
 */
val InstrumentSans = FontFamily(
    Font(R.font.instrument_sans, FontWeight.W400),
    Font(R.font.instrument_sans, FontWeight.W500),
    Font(R.font.instrument_sans, FontWeight.W600),
    Font(R.font.instrument_sans, FontWeight.W700),
)

/** Interligne à la CSS : l'espace en trop se répartit dessus et dessous. */
private val CssLineHeight = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None,
)

/**
 * Un style de texte de la maquette. Taille en pt, interligne en multiple de la
 * taille (1.45 comme le corps de page des maquettes), approche en em. Chiffres
 * tabulaires partout.
 */
fun nt(
    size: Float,
    weight: Int = 400,
    color: Color = Neutrals.ink,
    line: Float = 1.45f,
    tracking: Float = 0f,
): TextStyle = TextStyle(
    fontFamily = InstrumentSans,
    fontSize = size.sp,
    fontWeight = FontWeight(weight),
    color = color,
    lineHeight = (size * line).sp,
    letterSpacing = tracking.em,
    fontFeatureSettings = "tnum",
    lineHeightStyle = CssLineHeight,
)

object Type {
    val screenTitle = nt(24f, 600, line = 1.2f, tracking = -0.03f)
    val onboardingTitle = nt(28f, 600, line = 1.15f, tracking = -0.03f)
    val ringValue = nt(26f, 700, Domains.nutrition.textOnLight, line = 1f, tracking = -0.03f)
    val bigNumber = nt(52f, 700, Domains.body.textOnLight, line = 1f, tracking = -0.04f)
    val cardTitle = nt(15f, 600)
    val body = nt(14f)
    val bodyStrong = nt(14f, 500)
    val secondary = nt(12.5f, color = Neutrals.muted)
    val small = nt(12f, color = Neutrals.muted)
    val tileLabel = nt(11.5f, 600)
    val sectionCaps = nt(11.5f, 700, tracking = 0.06f)
    val sheetTitle = nt(19f, 600, tracking = -0.02f)
    val tab = nt(10.5f, 500, Neutrals.tabInactive)
    val tabActive = nt(10.5f, 700)
}
