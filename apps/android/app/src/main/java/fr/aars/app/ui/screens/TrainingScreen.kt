package fr.aars.app.ui.screens

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
import fr.aars.app.AppModel
import fr.aars.app.R
import fr.aars.app.data.SessionRow
import fr.aars.app.ui.components.Badge
import fr.aars.app.ui.components.DomainBadge
import fr.aars.app.ui.components.DomainHeader
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.SegmentDots
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.components.tinted
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** « 8,4 t » au-delà d'une tonne, « 850 kg » en deçà (`formatTonnage`, lib/workout-progress.ts). */
fun formatTonnage(kg: Double): Pair<String, String> =
    if (kg >= 1000) String.format(Locale.FRANCE, "%.1f", Math.round(kg / 100) / 10.0) to " t"
    else fr.aars.app.ui.components.formatInt(kg) to " kg"

private val dayFormat = DateTimeFormatter.ofPattern("EEEE d", Locale.FRENCH)

private fun sessionDetail(session: SessionRow): String {
    val day = LocalDate.parse(session.sessionDate).format(dayFormat).replaceFirstChar { it.titlecase(Locale.FRENCH) }
    val minutes = session.durationSeconds?.let { "${Math.round(it / 60.0)} min" }
    return listOfNotNull(day, minutes).joinToString(" · ")
}

/** Sport (C4) : la semaine en trois tuiles, la séance du jour, le programme, les dernières séances. */
@Composable
fun TrainingScreen(model: AppModel, onMe: () -> Unit, onStart: () -> Unit) {
    val training = Domains.training
    val home = rememberLoaded(model.revision) { model.api.trainingHome() }
    val data = home.value

    ScreenColumn {
        DomainHeader(
            title = "Sport",
            subtitle = AnnotatedString(data?.let { "Semaine ${it.isoWeek}" } ?: ""),
            initials = initialsOf(model.today?.identity),
            onAvatar = onMe,
            badge = DomainBadge(R.drawable.lucide_dumbbell, training),
        )
        if (!LoadedGate(home) || data == null) return@ScreenColumn

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatTile(
                "Séances", "${data.weekSessions}", " / ${data.sessionsPerWeek}", null, Modifier.weight(1f),
                background = training.soft, labelColor = training.textOnLight, labelWeight = 600, valueSize = 20f,
            ) {
                SegmentDots(data.weekSessions, data.sessionsPerWeek, training.fill, training.seg, 4.dp, Modifier.padding(top = 2.dp))
            }
            val (volume, unit) = formatTonnage(data.weekVolumeKg)
            StatTile(
                "Volume", volume, unit, null, Modifier.weight(1f),
                background = training.soft, labelColor = training.textOnLight, labelWeight = 600, valueSize = 20f,
            ) {
                data.volumeChange?.let { change ->
                    Txt("${if (change > 0) "+" else if (change < 0) "−" else ""}${kotlin.math.abs(change)} %", nt(11f, 600, training.textOnLight))
                }
            }
            StatTile(
                "Records", "${data.records.size}", null, null, Modifier.weight(1f),
                background = training.soft, labelColor = training.textOnLight, labelWeight = 600, valueSize = 20f,
            ) {
                Txt(data.records.firstOrNull() ?: "cette semaine", nt(11f, color = Neutrals.muted), maxLines = 1)
            }
        }

        val open = data.openSession
        val next = data.next
        Column(
            Modifier.fillMaxWidth().tinted(training.fill, Radius.sessionCard).tap(onClick = onStart).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Txt(
                        when {
                            open != null -> "Séance en cours · ${open.setCount} séries"
                            next != null -> "Séance du jour · ${next.exercises.size} exercices"
                            else -> "Pas de programme"
                        },
                        nt(11.5f, 500, Color.White.copy(alpha = 0.85f)),
                    )
                    Txt(open?.name ?: next?.name ?: "Séance libre", nt(20f, 600, Color.White, tracking = -0.02f))
                }
                Box(Modifier.size(44.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                    Icon(R.drawable.lucide_play, 18.dp, training.fill)
                }
            }
            if (open == null && next != null && next.exercises.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    next.exercises.forEach { exercise ->
                        Row(Modifier.fillMaxWidth()) {
                            Txt(exercise.name, nt(13f, color = Color.White), Modifier.weight(1f), maxLines = 1)
                            Txt(exercise.target, nt(13f, color = Color.White.copy(alpha = 0.8f)))
                        }
                    }
                }
            }
        }

        if (data.templates.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Txt("Programme", nt(13f, 600), Modifier.padding(horizontal = 4.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.templates.forEach { template ->
                        Column(
                            Modifier.width(150.dp).card(Radius.tile).padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(R.drawable.lucide_star, 14.dp, if (template.favorite) Domains.kitchen.textOnLight else Neutrals.starOff)
                            Txt(template.name, nt(14f, 600), maxLines = 2)
                            Txt("${template.exerciseCount} exercices", Type.small)
                        }
                    }
                }
            }
        }

        Column(Modifier.fillMaxWidth().card().padding(horizontal = 14.dp, vertical = 4.dp)) {
            Txt("Dernières séances", nt(13f, 600), Modifier.padding(top = 10.dp, bottom = 4.dp))
            if (data.history.isEmpty()) {
                Txt("Aucune séance terminée pour l'instant.", Type.secondary, Modifier.padding(bottom = 10.dp))
            }
            data.history.forEachIndexed { index, session ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(training.fill))
                    Column(Modifier.weight(1f)) {
                        Txt(session.name, Type.bodyStrong, maxLines = 1)
                        Txt(sessionDetail(session), Type.small)
                    }
                    if (session.record) Badge("record", Neutrals.recordBg, Neutrals.recordText)
                    val (volume, unit) = formatTonnage(session.volumeKg)
                    Txt("$volume$unit", nt(14f, 600))
                }
                if (index < data.history.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            }
        }
    }
}
