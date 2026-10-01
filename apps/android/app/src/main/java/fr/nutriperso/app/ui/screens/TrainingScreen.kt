package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.ui.components.Badge
import fr.nutriperso.app.ui.components.DomainBadge
import fr.nutriperso.app.ui.components.DomainHeader
import fr.nutriperso.app.ui.components.Icon
import fr.nutriperso.app.ui.components.LinkText
import fr.nutriperso.app.ui.components.SegmentDots
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.components.tinted
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Radius
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt

/**
 * Sport (C4) : la semaine en trois tuiles, la séance du jour, le programme,
 * les dernières séances. Séance du jour et compteurs viennent de l'API quand
 * elle les fournit ; le reste est encore un exemple, voir [Demo].
 */
@Composable
fun TrainingScreen(model: AppModel, onMe: () -> Unit, onStart: () -> Unit) {
    val training = Domains.training
    val data = model.today
    val activity = data?.activity
    val sessionsPlanned = activity?.sessionsPlanned?.takeIf { it > 0 } ?: 3
    val sessionsDone = activity?.sessionsDone ?: 0

    ScreenColumn {
        DomainHeader(
            title = "Sport",
            subtitle = AnnotatedString(data?.let { "Semaine ${it.isoWeek}" } ?: ""),
            initials = initialsOf(data?.identity),
            onAvatar = onMe,
            badge = DomainBadge(R.drawable.lucide_dumbbell, training),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatTile(
                "Séances", "$sessionsDone", " / $sessionsPlanned", null, Modifier.weight(1f),
                background = training.soft, labelColor = training.textOnLight, labelWeight = 600, valueSize = 20f,
            ) {
                SegmentDots(sessionsDone, sessionsPlanned, training.fill, training.seg, 4.dp, Modifier.padding(top = 2.dp))
            }
            StatTile(
                "Volume", "8,4", " t", null, Modifier.weight(1f),
                background = training.soft, labelColor = training.textOnLight, labelWeight = 600, valueSize = 20f,
            ) {
                Txt("+12 %", nt(11f, 600, training.textOnLight))
            }
            StatTile(
                "Records", "1", null, null, Modifier.weight(1f),
                background = training.soft, labelColor = training.textOnLight, labelWeight = 600, valueSize = 20f,
            ) {
                Txt("Squat", nt(11f, color = Neutrals.muted))
            }
        }

        val (demoName, exercises) = Demo.todaySession
        val session = data?.session
        Column(
            Modifier.fillMaxWidth().tinted(training.fill, Radius.sessionCard).tap(onClick = onStart).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Txt(if (session?.kind == "open") "Séance en cours" else "Séance du jour · 50 min", nt(11.5f, 500, Color.White.copy(alpha = 0.85f)))
                    Txt(session?.name ?: demoName, nt(20f, 600, Color.White, tracking = -0.02f))
                }
                Box(Modifier.size(44.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                    Icon(R.drawable.lucide_play, 18.dp, training.fill)
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                exercises.forEach { exercise ->
                    Row(Modifier.fillMaxWidth()) {
                        Txt(exercise.name, nt(13f, color = Color.White), Modifier.weight(1f))
                        Txt(exercise.detail, nt(13f, color = Color.White.copy(alpha = 0.8f)))
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt("Programme", nt(13f, 600), Modifier.weight(1f))
                LinkText("Modifier", training.textOnLight, { model.toast("La modification du programme arrive bientôt") })
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Demo.program.forEach { program ->
                    Column(
                        Modifier.width(150.dp).card(Radius.tile).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(R.drawable.lucide_star, 14.dp, if (program.favorite) Domains.kitchen.textOnLight else Neutrals.starOff)
                        Txt(program.name, nt(14f, 600))
                        Txt(program.detail, Type.small)
                    }
                }
            }
        }

        Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 4.dp)) {
            Txt("Dernières séances", nt(13f, 600), Modifier.padding(top = 10.dp, bottom = 4.dp))
            Demo.pastSessions.forEachIndexed { index, past ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(training.fill))
                    Column(Modifier.weight(1f)) {
                        Txt(past.name, Type.bodyStrong)
                        Txt(past.detail, Type.small)
                    }
                    if (past.record) Badge("record", Neutrals.recordBg, Neutrals.recordText)
                    Txt(past.tonnage, nt(14f, 600))
                }
                if (index < Demo.pastSessions.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            }
        }
    }
}
