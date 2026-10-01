package fr.nutriperso.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.unit.dp
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.R
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.FoundPerson
import fr.nutriperso.app.data.Identity
import fr.nutriperso.app.data.PublicPerson
import fr.nutriperso.app.ui.components.Avatar
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.SectionCaps
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.components.card
import fr.nutriperso.app.ui.components.tap
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.Type
import fr.nutriperso.app.ui.theme.nt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Les personnes : chercher par identifiant, suivre, répondre aux demandes,
 * gérer ses abonnés. Les règles (demande, acceptation) sont celles du serveur.
 */
@Composable
fun PeopleScreen(model: AppModel, onBack: () -> Unit) {
    val community = Domains.community
    val scope = rememberCoroutineScope()
    val home = rememberLoaded(model.revision) { model.api.socialHome() }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<FoundPerson>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(query, model.revision) {
        if (query.trim().length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(300)
        results = model.api.people(query.trim()).let { if (it is ApiResult.Ok) it.value.people else emptyList() }
    }

    fun act(action: String, userId: Long, done: String) {
        if (busy) return
        busy = true
        scope.launch {
            when (val result = model.api.relation(action, userId)) {
                is ApiResult.Ok -> {
                    model.toast(done)
                    model.bump()
                }
                is ApiResult.Failed -> model.toast(result.message)
            }
            busy = false
        }
    }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackLink("Communauté", onBack)
            Txt("Personnes", Type.screenTitle, Modifier.padding(horizontal = 4.dp))
            NutriField(
                query,
                { query = it.take(30) },
                placeholder = "Chercher un identifiant",
                prefix = "@",
                height = 46.dp,
                background = community.soft,
                border = null,
                focusColor = community.textOnLight,
                textSize = 14f,
            )
            if (results.isNotEmpty()) {
                PeopleCard(results.map { PublicPerson(it.id, it.handle, it.displayName) to it.state }) { person, state ->
                    when (state) {
                        "following" -> Action("Ne plus suivre", false) { act("unfollow", person.id, "Tu ne suis plus @${person.handle}") }
                        "requested" -> Action("Demandé", false) { act("unfollow", person.id, "Demande annulée") }
                        else -> Action("Suivre", true) { act("follow", person.id, "Demande envoyée à @${person.handle}") }
                    }
                }
            } else if (query.trim().length >= 2) {
                Txt("Personne sous cet identifiant.", Type.secondary, Modifier.padding(horizontal = 4.dp))
            }

            if (!LoadedGate(home)) return@ScreenColumn
            val data = home.value ?: return@ScreenColumn

            if (data.requests.isNotEmpty()) {
                SectionCaps("Demandes")
                PeopleCard(data.requests.map { it to "request" }) { person, _ ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Action("Refuser", false) { act("decline", person.id, "Demande refusée") }
                        Action("Accepter", true) { act("accept", person.id, "@${person.handle} te suit") }
                    }
                }
            }
            if (data.requested.isNotEmpty()) {
                SectionCaps("En attente")
                PeopleCard(data.requested.map { it to "requested" }) { person, _ ->
                    Action("Annuler", false) { act("unfollow", person.id, "Demande annulée") }
                }
            }
            SectionCaps("Tu suis")
            if (data.following.isEmpty()) {
                Txt("Personne pour l'instant. Cherche tes amis par leur identifiant.", Type.secondary, Modifier.padding(horizontal = 4.dp))
            } else {
                PeopleCard(data.following.map { PublicPerson(it.id, it.handle, it.displayName) to "following" }) { person, _ ->
                    Action("Ne plus suivre", false) { act("unfollow", person.id, "Tu ne suis plus @${person.handle}") }
                }
            }
            SectionCaps("Te suivent")
            if (data.followers.isEmpty()) {
                Txt("Personne ne te suit encore.", Type.secondary, Modifier.padding(horizontal = 4.dp))
            } else {
                PeopleCard(data.followers.map { it to "follower" }) { person, _ ->
                    Action("Retirer", false) { act("remove", person.id, "@${person.handle} ne te suit plus") }
                }
            }
        }
    }
}

@Composable
private fun PeopleCard(people: List<Pair<PublicPerson, String>>, trailing: @Composable (PublicPerson, String) -> Unit) {
    Column(Modifier.fillMaxWidth().card()) {
        people.forEachIndexed { index, (person, state) ->
            if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Avatar(
                    initialsOf(Identity(person.handle, person.displayName)),
                    size = 36.dp, background = Domains.community.soft, foreground = Domains.community.textOnLight,
                )
                Column(Modifier.weight(1f)) {
                    Txt(person.displayName ?: "@${person.handle}", Type.bodyStrong, maxLines = 1)
                    if (person.displayName != null) Txt("@${person.handle}", Type.small, maxLines = 1)
                }
                trailing(person, state)
            }
        }
    }
}

@Composable
private fun Action(label: String, primary: Boolean, onClick: () -> Unit) {
    val community = Domains.community
    Txt(
        label,
        nt(12.5f, 700, if (primary) community.textOnFill else community.textOnLight),
        Modifier.clip(CircleShape).background(if (primary) community.fill else Color.Transparent)
            .tap(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
    )
}
