package fr.aars.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fr.aars.app.ui.theme.MacroColors
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.nt

/**
 * Anneau plein façon `conic-gradient` : des parts posées bout à bout depuis
 * midi, sur une piste. Épaisseur de 10 pour la jauge d'Aujourd'hui.
 */
@Composable
fun Ring(
    size: Dp,
    thickness: Dp,
    track: Color,
    parts: List<Pair<Float, Color>>,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit = {},
) {
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = thickness.toPx()
            val inset = stroke / 2
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(track, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
            var start = -90f
            for ((fraction, color) in parts) {
                val sweep = 360f * fraction.coerceIn(0f, 1f)
                if (sweep > 0f) {
                    drawArc(color, start, sweep, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                }
                start += sweep
            }
        }
        content()
    }
}

/** Une macro : libellé coloré, `x / y g`, piste de 7. */
@Composable
fun MacroBar(label: String, value: Double, target: Double?, colors: MacroColors, modifier: Modifier = Modifier) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Txt(label, nt(12.5f, 500, colors.text))
            Txt(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.W600)) { append(formatInt(value)) }
                    if (target != null) {
                        withStyle(SpanStyle(color = Neutrals.muted)) { append(" / ${formatInt(target)} g") }
                    } else {
                        withStyle(SpanStyle(color = Neutrals.muted)) { append(" g") }
                    }
                },
                nt(12.5f),
            )
        }
        ProgressTrack(
            fraction = if (target == null || target <= 0) 0f else (value / target).toFloat(),
            track = colors.track,
            fill = colors.fill,
            height = 7.dp,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** Piste arrondie et sa part remplie. */
@Composable
fun ProgressTrack(fraction: Float, track: Color, fill: Color, height: Dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(height).clip(CircleShape).background(track)) {
        val f = fraction.coerceIn(0f, 1f)
        if (f > 0f) Box(Modifier.fillMaxWidth(f).fillMaxHeight().clip(CircleShape).background(fill))
    }
}

/** Barre de répartition des macros d'un repas, 64 × 7. */
@Composable
fun MacroSplit(protein: Double, carbs: Double, fat: Double, modifier: Modifier = Modifier) {
    val total = protein + carbs + fat
    Row(
        modifier.width(64.dp).height(7.dp).clip(CircleShape).background(Neutrals.track),
        horizontalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        if (total > 0) {
            listOf(
                protein to fr.aars.app.ui.theme.Macros.protein.fill,
                carbs to fr.aars.app.ui.theme.Macros.carbs.fill,
                fat to fr.aars.app.ui.theme.Macros.fat.fill,
            ).filter { it.first > 0 }.forEach { (value, color) ->
                Box(Modifier.weight(value.toFloat()).fillMaxHeight().background(color))
            }
        }
    }
}

/** Segments de progression : « 2 séances sur 3 ». */
@Composable
fun SegmentDots(done: Int, total: Int, on: Color, off: Color, height: Dp, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        repeat(total.coerceAtLeast(1)) { index ->
            Box(Modifier.weight(1f).height(height).clip(CircleShape).background(if (index < done) on else off))
        }
    }
}

/** Courbe simple, sans axes : la tuile Poids. */
@Composable
fun Sparkline(values: List<Double?>, color: Color, modifier: Modifier = Modifier, strokeWidth: Dp = 2.5.dp) {
    val known = values.filterNotNull()
    Canvas(modifier) {
        if (known.size < 2) return@Canvas
        val min = known.min()
        val max = known.max()
        val span = (max - min).takeIf { it > 0 } ?: 1.0
        val stroke = strokeWidth.toPx()
        val usable = size.height - stroke
        val step = size.width / (values.size - 1).coerceAtLeast(1)
        val path = Path()
        var started = false
        values.forEachIndexed { index, value ->
            if (value == null) return@forEachIndexed
            val x = index * step
            val y = stroke / 2 + ((max - value) / span).toFloat() * usable
            if (!started) path.moveTo(x, y) else path.lineTo(x, y)
            started = true
        }
        drawPath(path, color, style = Stroke(stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** Barres verticales arrondies en bas d'une zone, hauteurs de 0 à 1. */
@Composable
fun Bars(
    ratios: List<Float>,
    colors: List<Color>,
    modifier: Modifier = Modifier,
    gap: Dp = 5.dp,
    radius: Dp = 4.dp,
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.Bottom) {
        ratios.forEachIndexed { index, ratio ->
            Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.BottomCenter) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(ratio.coerceIn(0f, 1f))
                        .clip(RoundedCornerShape(radius))
                        .background(colors.getOrElse(index) { colors.last() }),
                )
            }
        }
    }
}

/** 1 420, à la française. */
fun formatInt(value: Double): String =
    String.format(java.util.Locale.FRANCE, "%,d", Math.round(value)).replace(NARROW_NBSP, NBSP)

private const val NARROW_NBSP = '\u202F'
private const val NBSP = '\u00A0'

/** 78,4. */
fun formatKg(value: Double): String = String.format(java.util.Locale.FRANCE, "%.1f", value)

/** −0,6 avec le vrai signe moins. */
fun formatSigned(value: Double, decimals: Int = 1): String {
    val body = String.format(java.util.Locale.FRANCE, "%.${decimals}f", kotlin.math.abs(value))
    return when {
        value > 0 -> "+$body"
        value < 0 -> "−$body"
        else -> body
    }
}
