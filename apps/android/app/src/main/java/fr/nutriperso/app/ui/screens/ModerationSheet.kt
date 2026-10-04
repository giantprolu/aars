package fr.nutriperso.app.ui.screens

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.PublicPerson
import fr.nutriperso.app.ui.components.GhostButton
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.NutriSheet
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.rememberSelectionClick
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Macros
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import kotlinx.coroutines.launch

/** Ce qu'on signale ou bloque : une personne, et peut-être une de ses séances. */
data class ModerationTarget(
    val userId: Long,
    val handle: String,
    val displayName: String?,
    val sessionId: Long? = null,
    val sessionName: String? = null,
) {
    constructor(person: PublicPerson, sessionId: Long? = null, sessionName: String? = null) :
        this(person.id, person.handle, person.displayName, sessionId, sessionName)
}

/** Les motifs d'un signalement, comme `REPORT_REASONS` côté serveur. */
private enum class ReportReason(val api: String, val label: String) {
    Inappropriate("inappropriate", "Contenu inapproprié"),
    Harassment("harassment", "Harcèlement"),
    Spam("spam", "Spam ou faux compte"),
    Other("other", "Autre"),
}

private enum class ModerationStep { Menu, Report, Reported, Block }

/** Couleurs de l'action qui ne se rattrape pas : la rouge des protéines, en plein. */
private val Danger = Domains.body.copy(
    fill = Macros.protein.fill,
    soft = Macros.protein.track,
    textOnLight = Macros.protein.text,
    textOnFill = Color.White,
)

/**
 * Signaler ou bloquer (règle 1.2 de l'App Store, même exigence chez Google
 * Play). Ouverte depuis une séance du fil ou une personne de l'écran Personnes.
 *
 * Le signalement part à l'équipe qui modère ; le blocage coupe tout entre les
 * deux comptes, sans que l'autre en soit averti. Les règles sont celles du
 * serveur : l'écran ne fait que les demander.
 */
@Composable
fun BoxScope.ModerationSheet(target: ModerationTarget?, model: AppModel, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val click = rememberSelectionClick()
    var step by remember { mutableStateOf(ModerationStep.Menu) }
    var reason by remember { mutableStateOf<ReportReason?>(null) }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Garde la cible pendant l'animation de sortie de la feuille.
    var shown by remember { mutableStateOf(target) }

    LaunchedEffect(target) {
        if (target != null) {
            shown = target
            step = ModerationStep.Menu
            reason = null
            note = ""
            error = null
        }
    }

    val current = shown
    val title = when {
        current == null -> ""
        step == ModerationStep.Menu -> current.displayName ?: "@${current.handle}"
        step == ModerationStep.Report -> if (current.sessionId == null) "Signaler @${current.handle}" else "Signaler la séance"
        step == ModerationStep.Reported -> "Signalement envoyé"
        else -> "Bloquer @${current.handle}"
    }

    fun send(who: ModerationTarget, chosen: ReportReason) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            val result = model.api.report(who.userId, who.sessionId, chosen.api, note.trim().ifBlank { null })
            busy = false
            when (result) {
                is ApiResult.Ok -> step = ModerationStep.Reported
                is ApiResult.Failed -> error = result.message
            }
        }
    }

    fun block(who: ModerationTarget) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            val result = model.api.relation("block", who.userId)
            busy = false
            when (result) {
                is ApiResult.Ok -> {
                    model.toast("@${who.handle} bloqué")
                    model.bump()
                    onDismiss()
                }
                is ApiResult.Failed -> error = result.message
            }
        }
    }

    NutriSheet(target != null, title, onDismiss, gap = 12) {
        if (current == null) return@NutriSheet
        when (step) {
            ModerationStep.Menu -> Column(Modifier.fillMaxWidth().card()) {
                ModerationRow(
                    R.drawable.lucide_flag,
                    if (current.sessionId == null) "Signaler @${current.handle}" else "Signaler cette séance",
                    Neutrals.ink,
                ) { step = ModerationStep.Report }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
                ModerationRow(R.drawable.lucide_ban, "Bloquer @${current.handle}", Macros.protein.text) {
                    step = ModerationStep.Block
                }
            }

            ModerationStep.Report -> {
                current.sessionName?.let {
                    Txt("« $it », partagée par @${current.handle}.", Type.secondary, Modifier.padding(horizontal = 4.dp))
                }
                val shape = RoundedCornerShape(Radius.tile)
                Column(Modifier.fillMaxWidth().clip(shape).background(Neutrals.card).border(1.dp, Neutrals.fieldBorder, shape)) {
                    ReportReason.entries.forEachIndexed { index, choice ->
                        val active = choice == reason
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .background(if (active) Domains.community.soft else Color.Transparent)
                                .tap {
                                    click()
                                    reason = choice
                                }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                Modifier.size(18.dp).clip(CircleShape).border(
                                    if (active) 5.dp else 1.5.dp,
                                    if (active) Domains.community.textOnLight else Neutrals.radioBorder,
                                    CircleShape,
                                ),
                            )
                            Txt(choice.label, nt(14f, if (active) 600 else 400))
                        }
                        if (index < ReportReason.entries.lastIndex) {
                            Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
                        }
                    }
                }
                NutriField(
                    note,
                    { note = it.take(500) },
                    placeholder = "Préciser, facultatif",
                    imeAction = ImeAction.Done,
                    focusColor = Domains.community.textOnLight,
                )
                error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
                PrimaryButton(
                    "Envoyer le signalement",
                    Domains.community,
                    { reason?.let { send(current, it) } },
                    height = 50.dp,
                    enabled = reason != null,
                    busy = busy,
                    textSize = 15f,
                )
                GhostButton("Retour", { step = ModerationStep.Menu })
            }

            ModerationStep.Reported -> {
                Txt(
                    "Merci. L'équipe le regarde sous 24 heures, et retire ce qui enfreint les règles. " +
                        "Tu peux aussi bloquer @${current.handle} : vous ne vous verrez plus.",
                    Type.secondary,
                    Modifier.padding(horizontal = 4.dp),
                )
                PrimaryButton("Bloquer @${current.handle}", Danger, { step = ModerationStep.Block }, height = 50.dp, textSize = 15f)
                GhostButton("Fermer", onDismiss)
            }

            ModerationStep.Block -> {
                Txt(
                    "Vous ne vous suivrez plus, et aucun de vous ne verra plus l'autre, ni dans la recherche ni dans le fil. " +
                        "@${current.handle} n'en est pas averti. Tu pourras le débloquer depuis Personnes.",
                    Type.secondary,
                    Modifier.padding(horizontal = 4.dp),
                )
                error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
                PrimaryButton("Bloquer", Danger, { block(current) }, height = 50.dp, busy = busy, textSize = 15f)
                GhostButton("Annuler", { step = ModerationStep.Menu })
            }
        }
    }
}

@Composable
private fun ModerationRow(@DrawableRes icon: Int, label: String, color: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().tap(onClick = onClick).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, 17.dp, color)
        Txt(label, nt(14f, 500, color), Modifier.weight(1f))
        Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
    }
}

/** « … » : signaler ou bloquer. */
@Composable
fun MoreButton(onClick: () -> Unit) {
    Box(Modifier.size(30.dp).tap(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(R.drawable.lucide_ellipsis, 18.dp, Neutrals.muted)
    }
}
