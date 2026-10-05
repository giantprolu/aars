package fr.aars.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import fr.aars.app.AppModel
import fr.aars.app.data.ApiResult
import fr.aars.app.ui.components.GhostButton
import fr.aars.app.ui.components.Labeled
import fr.aars.app.ui.components.NutriField
import fr.aars.app.ui.components.PrimaryButton
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Space
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import kotlinx.coroutines.launch

/** Longueur minimale du mot de passe, comme `MIN_PASSWORD_LENGTH` côté serveur. */
private const val MIN_PASSWORD_LENGTH = 10

/**
 * Connexion et inscription, sur un seul écran. L'inscription est libre et
 * enchaîne sur l'onboarding ; la récupération du mot de passe reste sur le web.
 */
@Composable
fun AuthScreen(model: AppModel) {
    val nutrition = Domains.nutrition
    val scope = rememberCoroutineScope()
    var creating by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    var recovering by rememberSaveable { mutableStateOf(false) }
    var code by rememberSaveable { mutableStateOf("") }

    val submit: () -> Unit = submit@{
        if (busy) return@submit
        if ((creating || recovering) && password.length < MIN_PASSWORD_LENGTH) {
            error = "Un mot de passe d'au moins $MIN_PASSWORD_LENGTH caractères."
            return@submit
        }
        busy = true
        error = null
        scope.launch {
            val result = when {
                recovering -> model.api.recover(email, code, password)
                creating -> model.api.register(email, password)
                else -> model.api.login(email, password)
            }
            busy = false
            if (result is ApiResult.Failed) error = result.message
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = Space.onboardingH)
                .padding(top = 80.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Txt("Aars", nt(14f, 600, nutrition.textOnLight))
                Txt(
                    when {
                        recovering -> "Retrouve ton compte."
                        creating -> "Crée ton compte."
                        else -> "Content de te revoir."
                    },
                    nt(34f, 600, line = 1.1f, tracking = -0.035f),
                )
                Txt(
                    when {
                        recovering -> "Ton adresse, ton code de secours, et un nouveau mot de passe."
                        creating -> "Une adresse et un mot de passe. Le reste se règle juste après."
                        else -> "Ton journal t'attend."
                    },
                    nt(15f, color = Neutrals.muted),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Labeled("Adresse") {
                    NutriField(email, { email = it.trim() }, placeholder = "toi@exemple.fr", keyboardType = KeyboardType.Email)
                }
                if (recovering) {
                    Labeled("Code de secours") {
                        NutriField(code, { code = it.take(40) }, placeholder = "XXXX-XXXX-XXXX")
                    }
                }
                Labeled(
                    if (recovering) "Nouveau mot de passe" else "Mot de passe",
                    hint = if (creating || recovering) "Au moins $MIN_PASSWORD_LENGTH caractères." else null,
                ) {
                    NutriField(
                        password,
                        { password = it },
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Go,
                        onDone = submit,
                        password = true,
                    )
                }
                error?.let { Txt(it, nt(13f, 500, fr.aars.app.ui.theme.Macros.protein.text)) }
            }
            PrimaryButton(
                when {
                    recovering -> "Changer le mot de passe"
                    creating -> "Créer mon compte"
                    else -> "Se connecter"
                },
                nutrition,
                submit,
                enabled = email.isNotBlank() && password.isNotEmpty() && (!recovering || code.isNotBlank()),
                busy = busy,
            )
            GhostButton(if (creating || recovering) "J'ai déjà un compte" else "Créer un compte", {
                creating = !(creating || recovering)
                recovering = false
                error = null
            })
            if (!creating && !recovering) {
                GhostButton("Mot de passe oublié", {
                    recovering = true
                    error = null
                })
            }
        }
    }
}
