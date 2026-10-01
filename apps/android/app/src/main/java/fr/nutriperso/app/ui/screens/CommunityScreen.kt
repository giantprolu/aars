package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.FeedSession
import fr.nutriperso.app.data.Identity
import fr.nutriperso.app.ui.components.Avatar
import fr.nutriperso.app.ui.components.DomainBadge
import fr.nutriperso.app.ui.components.DomainHeader
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.ProgressTrack
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.dashedBorder
import fr.nutriperso.app.ui.components.rememberSelectionClick
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Macros
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

/** Les lavis des domaines, pour distinguer les avatars (`avatarTone`, lib/social.ts). */
private val AVATAR_TONES = listOf(
    Macros.protein.track, Domains.training.soft, Domains.kitchen.soft, Domains.body.soft, Domains.community.soft,
)

private fun avatarTone(id: Long): Color = AVATAR_TONES[(id % AVATAR_TONES.size).toInt()]

private fun labelOf(handle: String, displayName: String?): String = displayName ?: "@$handle"

private val hourFormat = DateTimeFormatter.ofPattern("H 'h' mm", Locale.FRENCH)
private val dayFormat = DateTimeFormatter.ofPattern("EEEE", Locale.FRENCH)

/** « Hier, 18 h 40 », « Dimanche, 9 h 05 ». */
private fun feedWhen(session: FeedSession): String {
    val started = runCatching { OffsetDateTime.parse(session.startedAt).atZoneSameInstant(ZoneId.of("Europe/Paris")) }.getOrNull()
    val date = LocalDate.parse(session.sessionDate)
    val today = LocalDate.now(ZoneId.of("Europe/Paris"))
    val day = when (date) {
        today -> "Aujourd'hui"
        today.minusDays(1) -> "Hier"
        else -> date.format(dayFormat).replaceFirstChar { it.titlecase(Locale.FRENCH) }
    }
    return if (started == null) day else "$day, ${started.format(hourFormat)}"
}

/** Communauté (C5) : suivis, classement de la semaine, fil des séances partagées. */
@Composable
fun CommunityScreen(model: AppModel, onMe: () -> Unit) {
    val community = Domains.community
    val scope = rememberCoroutineScope()
    val home = rememberLoaded(model.revision) { model.api.socialHome() }
    val feed = rememberLoaded(model.revision) { model.api.feed() }
    // Bravos donnés ou retirés à l'instant, en attendant la relecture.
    val kudos = remember { mutableStateMapOf<Long, Boolean>() }
    val data = home.value

    ScreenColumn {
        DomainHeader(
            title = "Communauté",
            subtitle = buildAnnotatedString {
                if (data != null) {
                    val count = data.following.size
                    append("$count suivi${if (count > 1) "s" else ""}")
                    if (data.pendingRequests > 0) {
                        append(" · ")
                        withStyle(SpanStyle(color = community.textOnLight, fontWeight = FontWeight.W600)) {
                            append("${data.pendingRequests} demande${if (data.pendingRequests > 1) "s" else ""}")
                        }
                    }
                }
            },
            initials = initialsOf(model.today?.identity),
            onAvatar = onMe,
            badge = DomainBadge(R.drawable.lucide_users, community),
        )
        if (!LoadedGate(home) || data == null) return@ScreenColumn

        if (data.identity.handle == null) {
            EmptyCard(
                "Présente-toi",
                "Choisis un identifiant pour qu'on puisse te trouver et que tu puisses suivre d'autres personnes. " +
                    "Tes séances restent privées tant que tu ne les partages pas.",
            )
        } else {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(
                    Modifier.width(54.dp).tap { model.toast("La recherche de personnes arrive bientôt sur Android") },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(Modifier.size(50.dp).dashedBorder(Domains.communityRing, 25.dp, 1.5.dp), contentAlignment = Alignment.Center) {
                        Icon(R.drawable.lucide_user_plus, 18.dp, community.textOnLight)
                    }
                    Txt("Inviter", nt(11f, 600, community.textOnLight))
                }
                data.following.forEach { person ->
                    val label = labelOf(person.handle, person.displayName)
                    Column(Modifier.width(54.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(
                            Modifier
                                .size(54.dp)
                                .then(if (person.recent) Modifier.border(2.dp, Domains.communityRing, CircleShape) else Modifier)
                                .padding(4.dp),
                        ) {
                            Avatar(
                                initialsOf(Identity(person.handle, person.displayName)),
                                size = 46.dp, background = avatarTone(person.id), foreground = Neutrals.ink, fontSize = 13f,
                            )
                        }
                        Txt(
                            label.removePrefix("@").split(' ').first(),
                            nt(11f, color = if (person.recent) Neutrals.ink else Neutrals.muted),
                            align = TextAlign.Center,
                            maxLines = 1,
                        )
                    }
                }
            }
        }

        if (data.board.size > 1) {
            Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Txt("Cette semaine", nt(13f, 600))
                val best = data.board.maxOf { it.sessions }.coerceAtLeast(1)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.board.forEach { row ->
                        val name = if (row.mine) "Toi" else labelOf(row.handle, row.displayName).split(' ').first()
                        val style = if (row.mine) nt(13f, 700, community.textOnLight) else nt(13f)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Txt(name, style, Modifier.width(60.dp), maxLines = 1)
                            ProgressTrack(row.sessions / best.toFloat(), community.soft, community.fill, 8.dp, Modifier.weight(1f))
                            Txt("${row.sessions}", if (row.mine) style else nt(13f, 600), Modifier.width(40.dp), align = TextAlign.End)
                        }
                    }
                }
                Txt("Séances terminées depuis lundi, partagées par ceux que tu suis", nt(11.5f, color = Neutrals.muted))
            }
        }

        val sessions = feed.value?.sessions.orEmpty()
        if (feed.value != null && sessions.isEmpty()) {
            EmptyCard("Le fil est vide", "Les séances partagées par toi et par ceux que tu suis apparaîtront ici.")
        }
        sessions.forEach { session ->
            val given = kudos[session.id] ?: session.kudoedByMe
            val count = session.kudos + (if (given) 1 else 0) - (if (session.kudoedByMe) 1 else 0)
            FeedCard(session, given, count) {
                if (session.mine) return@FeedCard
                val next = !given
                kudos[session.id] = next
                scope.launch {
                    if (model.api.kudos(session.id, next) is ApiResult.Failed) {
                        kudos.remove(session.id)
                        model.toast("Le bravo n'a pas pu être enregistré")
                    }
                }
            }
        }
    }
}

@Composable
private fun FeedCard(session: FeedSession, given: Boolean, count: Int, onKudos: () -> Unit) {
    val training = Domains.training
    val click = rememberSelectionClick()
    val (volume, unit) = formatTonnage(session.volumeKg)
    Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Avatar(
                initialsOf(Identity(session.author.handle, session.author.displayName)),
                size = 32.dp, background = avatarTone(session.author.id), foreground = Neutrals.ink, fontSize = 11.5f,
            )
            Column(Modifier.weight(1f)) {
                Txt(
                    buildAnnotatedString {
                        append(if (session.mine) "Toi · " else "${labelOf(session.author.handle, session.author.displayName)} · ")
                        withStyle(SpanStyle(color = training.textOnLight, fontWeight = FontWeight.W600)) { append(session.name) }
                    },
                    nt(14f, 500),
                    maxLines = 2,
                )
                Txt(feedWhen(session), Type.small)
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(training.soft).padding(vertical = 8.dp)) {
            listOfNotNull(
                (if (session.exercises.isEmpty()) "${session.setCount}" else "${session.exercises.size}") to
                    (if (session.exercises.isEmpty()) "séries" else "exercices"),
                "$volume$unit" to "volume",
                session.durationSeconds?.let { "${Math.round(it / 60.0)} min" to "durée" },
            ).forEach { (value, label) ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Txt(value, nt(15f, 600))
                    Txt(label, nt(11f, color = Neutrals.muted))
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f))
            Row(
                Modifier.tap(enabled = !session.mine) {
                    click()
                    onKudos()
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val color = if (given) Neutrals.heartActive else Domains.community.textOnLight
                Icon(R.drawable.lucide_heart, 16.dp, color)
                Txt("$count", nt(13f, 700, color))
            }
        }
    }
}
