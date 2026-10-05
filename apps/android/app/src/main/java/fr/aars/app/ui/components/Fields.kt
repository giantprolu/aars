package fr.aars.app.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.nt

/**
 * Champ de saisie de la maquette : 50 de haut, rayon 14, fond crème, filet
 * qui passe à la couleur du domaine quand il a le focus.
 */
@Composable
fun NutriField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onDone: (() -> Unit)? = null,
    focusColor: Color = Domains.nutrition.textOnLight,
    password: Boolean = false,
    prefix: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    height: Dp = 50.dp,
    background: Color = Neutrals.card,
    border: Color? = Neutrals.fieldBorder,
    @DrawableRes leadingIcon: Int? = null,
    leadingTint: Color = Domains.nutrition.textOnLight,
    textSize: Float = 16f,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val shape = RoundedCornerShape(Radius.field)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        textStyle = nt(textSize, 500, line = 1.2f),
        cursorBrush = SolidColor(focusColor),
        interactionSource = source,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }, onGo = { onDone?.invoke() }, onSearch = { onDone?.invoke() }),
        decorationBox = { inner ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(height)
                    .clip(shape)
                    .background(background)
                    .then(
                        when {
                            focused -> Modifier.border(1.5.dp, focusColor, shape)
                            border != null -> Modifier.border(1.dp, border, shape)
                            else -> Modifier
                        },
                    )
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (leadingIcon != null) {
                    Icon(leadingIcon, 17.dp, leadingTint)
                    Spacer(Modifier.width(10.dp))
                }
                if (prefix != null) Txt(prefix, nt(textSize, 500, Neutrals.faint), Modifier.padding(end = 2.dp))
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Txt(placeholder, nt(if (leadingIcon != null) 14f else textSize, if (leadingIcon != null) 400 else 500, Neutrals.faint), maxLines = 1)
                    inner()
                }
                trailing?.invoke()
            }
        },
    )
}

/** Un champ et son libellé de 13/500, avec une aide facultative dessous. */
@Composable
fun Labeled(label: String, hint: String? = null, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Txt(label, nt(13f, 500))
        content()
        if (hint != null) Txt(hint, nt(12.5f, color = Neutrals.muted))
    }
}
