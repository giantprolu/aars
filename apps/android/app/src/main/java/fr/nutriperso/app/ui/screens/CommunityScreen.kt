package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt

/** Communauté (C5) : suivis, classement de la semaine, fil. Contenus d'exemple, voir [Demo]. */
@Composable
fun CommunityScreen(model: AppModel, onMe: () -> Unit) {
    val community = Domains.community
    ScreenColumn {
        DomainHeader(
            title = "Communauté",
            subtitle = buildAnnotatedString {
                append("12 suivis · ")
                withStyle(SpanStyle(color = community.textOnLight, fontWeight = FontWeight.W600)) { append("2 demandes") }
            },
            initials = initialsOf(model.today?.identity),
            onAvatar = onMe,
            badge = DomainBadge(R.drawable.lucide_users, community),
        )
        Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.width(54.dp).tap { model.toast("L'invitation arrive bientôt sur Android") }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(50.dp).dashedBorder(Domains.communityRing, 25.dp, 1.5.dp), contentAlignment = Alignment.Center) {
                    Icon(R.drawable.lucide_user_plus, 18.dp, community.textOnLight)
                }
                Txt("Inviter", nt(11f, 600, community.textOnLight))
            }
            Demo.friends.forEach { friend ->
                Column(Modifier.width(54.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(
                        Modifier
                            .size(54.dp)
                            .then(if (friend.fresh) Modifier.border(2.dp, Domains.communityRing, CircleShape) else Modifier)
                            .padding(4.dp),
                    ) {
                        Avatar(friend.initials, size = 46.dp, background = Color(friend.color), foreground = Neutrals.ink, fontSize = 13f)
                    }
                    Txt(friend.name, nt(11f, color = if (friend.fresh) Neutrals.ink else Neutrals.muted), maxLines = 1)
                }
            }
        }
        Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Txt("Cette semaine", nt(13f, 600))
            val best = Demo.leaderboard.maxOf { it.second }.coerceAtLeast(1)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Demo.leaderboard.forEach { (name, count) ->
                    val me = name == "Toi"
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Txt(name, if (me) nt(13f, 700, community.textOnLight) else nt(13f), Modifier.width(60.dp))
                        ProgressTrack(count / best.toFloat(), community.soft, community.fill, 8.dp, Modifier.weight(1f))
                        Txt("$count", if (me) nt(13f, 700, community.textOnLight) else nt(13f, 600), Modifier.width(40.dp), align = TextAlign.End)
                    }
                }
            }
            Txt("Séances terminées depuis lundi", nt(11.5f, color = Neutrals.muted))
        }
        FeedCard()
        Row(Modifier.fillMaxWidth().card().padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Avatar("TR", size = 32.dp, background = Domains.training.soft, foreground = Neutrals.ink, fontSize = 11.5f)
            Column(Modifier.weight(1f)) {
                Txt(
                    buildAnnotatedString {
                        append("Thomas R. · ")
                        withStyle(SpanStyle(color = Domains.training.textOnLight, fontWeight = FontWeight.W600)) { append("Séance libre") }
                    },
                    nt(14f, 500),
                )
                Txt("Dimanche · 3,1 t · 41 min", Type.small)
            }
            Icon(R.drawable.lucide_heart, 16.dp, Neutrals.faint)
        }
    }
}

@Composable
private fun FeedCard() {
    val training = Domains.training
    val click = rememberSelectionClick()
    var liked by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Avatar("JM", size = 32.dp, background = Color(0xFFF8DDE1), foreground = Neutrals.ink, fontSize = 11.5f)
            Column(Modifier.weight(1f)) {
                Txt(
                    buildAnnotatedString {
                        append("Julie M. · ")
                        withStyle(SpanStyle(color = training.textOnLight, fontWeight = FontWeight.W600)) { append("Bas du corps B") }
                    },
                    nt(14f, 500),
                )
                Txt("Hier, 18 h 40", Type.small)
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(training.soft).padding(vertical = 8.dp)) {
            listOf("7" to "exercices", "6,2 t" to "volume", "58 min" to "durée").forEach { (value, label) ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Txt(value, nt(15f, 600))
                    Txt(label, nt(11f, color = Neutrals.muted))
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clip(CircleShape).background(Neutrals.recordBg).padding(horizontal = 10.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(R.drawable.lucide_trending_up, 13.dp, Neutrals.recordText)
                Txt("Squat 80 kg × 5", nt(13f, 600, Neutrals.recordText))
            }
            Box(Modifier.weight(1f))
            Row(
                Modifier.tap {
                    click()
                    liked = !liked
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val color = if (liked) Neutrals.heartActive else Domains.community.textOnLight
                Icon(R.drawable.lucide_heart, 16.dp, color)
                Txt(if (liked) "4" else "3", nt(13f, 700, color))
            }
        }
    }
}
