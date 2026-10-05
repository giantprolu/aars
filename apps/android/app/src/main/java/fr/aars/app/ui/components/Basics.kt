package fr.aars.app.ui.components

import android.view.HapticFeedbackConstants
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fr.aars.app.R
import fr.aars.app.ui.theme.DomainColors
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt

/** Un texte de la maquette. Aucun composant Material : tout part de BasicText. */
@Composable
fun Txt(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    align: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
) {
    val resolved = style.merge(
        TextStyle(
            color = if (color == Color.Unspecified) style.color else color,
            textAlign = align ?: TextAlign.Unspecified,
        ),
    )
    BasicText(text, modifier, resolved, overflow = TextOverflow.Ellipsis, maxLines = maxLines)
}

@Composable
fun Txt(
    text: AnnotatedString,
    style: TextStyle,
    modifier: Modifier = Modifier,
    align: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
) {
    BasicText(
        text,
        modifier,
        style.merge(TextStyle(textAlign = align ?: TextAlign.Unspecified)),
        overflow = TextOverflow.Ellipsis,
        maxLines = maxLines,
    )
}

/** « 78,4 kg −0,6 » : un chiffre, son unité en petit, puis un complément. */
fun valueWithUnit(
    value: String,
    unit: String,
    unitSize: Float = 12f,
    extra: String? = null,
    extraColor: Color = Neutrals.ink,
): AnnotatedString = buildAnnotatedString {
    append(value)
    withStyle(SpanStyle(fontSize = nt(unitSize).fontSize, color = Neutrals.muted, fontWeight = FontWeight.W500)) {
        append(unit)
    }
    if (extra != null) {
        append(" ")
        withStyle(SpanStyle(fontSize = nt(unitSize).fontSize, color = extraColor, fontWeight = FontWeight.W700)) {
            append(extra)
        }
    }
}

/** Une icône Lucide, teinte au choix. */
@Composable
fun Icon(@DrawableRes res: Int, size: Dp, color: Color, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(res),
        contentDescription = null,
        modifier = modifier.size(size),
        colorFilter = ColorFilter.tint(color),
    )
}

/**
 * Un toucher sans ondulation Material : l'élément s'éclaircit sous le doigt,
 * comme sur iOS. Une seule réponse visuelle pour les deux plateformes.
 */
fun Modifier.tap(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    this
        .graphicsLayer { alpha = if (pressed) 0.6f else 1f }
        .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
}

/** Retour haptique léger : segmentés, cases à cocher, ajout d'un récent. */
@Composable
fun rememberSelectionClick(): () -> Unit {
    val view = LocalView.current
    return remember(view) {
        val click: () -> Unit = { view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
        click
    }
}

/** La carte de base : fond crème, filet, rayon 18. */
fun Modifier.card(radius: Dp = Radius.card, background: Color = Neutrals.card, border: Color = Neutrals.cardBorder): Modifier =
    this
        .clip(RoundedCornerShape(radius))
        .background(background)
        .border(1.dp, border, RoundedCornerShape(radius))

fun Modifier.tinted(color: Color, radius: Dp = Radius.card): Modifier =
    this.clip(RoundedCornerShape(radius)).background(color)

@Composable
fun Divider(modifier: Modifier = Modifier, color: Color = Neutrals.divider) {
    Box(modifier.fillMaxWidth().height(1.dp).background(color))
}

/** Titre de section en MAJUSCULES. */
@Composable
fun SectionCaps(text: String, modifier: Modifier = Modifier) {
    Txt(text.uppercase(), Type.sectionCaps, modifier.padding(horizontal = 4.dp))
}

/** Pastille ronde à initiales. */
@Composable
fun Avatar(
    initials: String,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    background: Color = Domains.body.soft,
    foreground: Color = Domains.body.textOnLight,
    fontSize: Float = 12.5f,
    onClick: (() -> Unit)? = null,
) {
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(background)
            .then(if (onClick != null) Modifier.tap(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Txt(initials, nt(fontSize, 600, foreground, line = 1f))
    }
}

/** La pastille carrée d'un domaine, à gauche du titre. */
data class DomainBadge(@DrawableRes val icon: Int, val colors: DomainColors)

/**
 * En-tête des écrans principaux : titre de 24, sous-titre, avatar qui ouvre Moi.
 */
@Composable
fun DomainHeader(
    title: String,
    subtitle: AnnotatedString,
    initials: String,
    onAvatar: () -> Unit,
    badge: DomainBadge? = null,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (badge != null) {
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(Radius.domainBadge)).background(badge.colors.fill),
                contentAlignment = Alignment.Center,
            ) {
                Icon(badge.icon, 18.dp, badge.colors.textOnFill)
            }
            Spacer(Modifier.width(10.dp))
        }
        Column(Modifier.weight(1f)) {
            Txt(title, if (badge != null) Type.screenTitle.merge(TextStyle(lineHeight = nt(24f, line = 1.1f).lineHeight)) else Type.screenTitle)
            Txt(subtitle, Type.secondary)
        }
        Avatar(initials, onClick = onAvatar)
    }
}

/** Lien coloré en gras, avec chevron facultatif. */
@Composable
fun LinkText(text: String, color: Color, onClick: () -> Unit, size: Float = 12.5f, chevron: Boolean = false) {
    Row(Modifier.tap(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        Txt(text, nt(size, 700, color))
        if (chevron) Icon(R.drawable.lucide_chevron_right, 12.dp, color, Modifier.padding(start = 2.dp))
    }
}

/**
 * Sélecteur segmenté en pilule : onglets de Cuisine, repas, périodes,
 * apparence, choix de l'onboarding.
 */
@Composable
fun SegmentedPill(
    options: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    track: Color = Neutrals.chip,
    selectedBackground: Color = Neutrals.card,
    textColor: Color = Neutrals.muted,
    selectedTextColor: Color = Neutrals.ink,
    textStyle: TextStyle = nt(13.5f, 600),
    selectedWeight: Int? = null,
    outerRadius: Dp? = null,
    innerRadius: Dp? = null,
    padding: Dp = 3.dp,
    itemPadding: Dp = 7.dp,
    itemHorizontalPadding: Dp = 0.dp,
    fill: Boolean = true,
    badges: Map<Int, String> = emptyMap(),
    badgeColors: DomainColors = Domains.kitchen,
) {
    val click = rememberSelectionClick()
    val outer: Shape = outerRadius?.let { RoundedCornerShape(it) } ?: CircleShape
    val inner: Shape = innerRadius?.let { RoundedCornerShape(it) } ?: CircleShape
    Row(modifier.clip(outer).background(track).padding(padding)) {
        options.forEachIndexed { index, label ->
            val isSelected = index == selected
            Row(
                (if (fill) Modifier.weight(1f) else Modifier)
                    .clip(inner)
                    .background(if (isSelected) selectedBackground else Color.Transparent)
                    .tap {
                        if (index != selected) click()
                        onSelect(index)
                    }
                    .padding(vertical = itemPadding, horizontal = itemHorizontalPadding),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val style = if (isSelected && selectedWeight != null) {
                    textStyle.merge(TextStyle(fontWeight = FontWeight(selectedWeight)))
                } else {
                    textStyle
                }
                Txt(label, style, color = if (isSelected) selectedTextColor else textColor, maxLines = 1)
                badges[index]?.let { badge ->
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier.clip(CircleShape).background(badgeColors.fill).padding(horizontal = 6.dp),
                    ) {
                        Txt(badge, nt(11f, 600, badgeColors.textOnFill))
                    }
                }
            }
        }
    }
}

/** Bouton principal en pilule, à la couleur du domaine courant. */
@Composable
fun PrimaryButton(
    text: String,
    colors: DomainColors,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 54.dp,
    enabled: Boolean = true,
    busy: Boolean = false,
    @DrawableRes trailingIcon: Int? = null,
    textSize: Float = 16f,
    weight: Int = 600,
) {
    Row(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(CircleShape)
            .background(colors.fill)
            .graphicsLayer { alpha = if (enabled && !busy) 1f else 0.6f }
            .tap(enabled = enabled && !busy, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Txt(if (busy) "Un instant…" else text, nt(textSize, weight, colors.textOnFill))
        if (trailingIcon != null && !busy) {
            Spacer(Modifier.width(8.dp))
            Icon(trailingIcon, 18.dp, colors.textOnFill)
        }
    }
}

/** Action secondaire en texte gris. */
@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Txt(
        text,
        nt(14f, 500, Neutrals.muted),
        modifier.fillMaxWidth().tap(onClick = onClick).padding(6.dp),
        align = TextAlign.Center,
    )
}

/** Badge en pilule : « record », « Actif », écarts de 1RM. */
@Composable
fun Badge(text: String, background: Color, foreground: Color, modifier: Modifier = Modifier, size: Float = 11.5f) {
    Box(modifier.clip(CircleShape).background(background).padding(horizontal = 8.dp, vertical = 2.dp)) {
        Txt(text, nt(size, 700, foreground))
    }
}

/** Un bandeau d'erreur sobre, en haut d'un écran. */
@Composable
fun ErrorBanner(message: String, onRetry: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().tinted(Neutrals.chip, Radius.tile).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Txt(message, nt(13f, 500), Modifier.weight(1f))
        if (onRetry != null) LinkText("Réessayer", Domains.nutrition.textOnLight, onRetry)
    }
}
