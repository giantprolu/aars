package fr.aars.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import fr.aars.app.AppModel
import fr.aars.app.BuildConfig
import fr.aars.app.R
import fr.aars.app.data.ApiResult
import fr.aars.app.ui.components.Icon
import fr.aars.app.ui.components.NutriField
import fr.aars.app.ui.components.PrimaryButton
import fr.aars.app.ui.components.SectionCaps
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.components.tap
import fr.aars.app.ui.components.tinted
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Macros
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Radius
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** La politique de confidentialité, publiée par l'app web. */
val PRIVACY_URL: String = BuildConfig.API_BASE_URL + "/legal/privacy"

/**
 * Compte et données : objectif, code de secours, export, politique de
 * confidentialité, déconnexion, suppression du compte (exigée par Google Play
 * pour une app qui crée des comptes).
 */
@Composable
fun AccountScreen(model: AppModel, onBack: () -> Unit, onEditGoal: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf<String?>(null) }
    var exportJson by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf(false) }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        val content = exportJson
        if (uri != null && content != null) {
            scope.launch {
                val ok = withContext(Dispatchers.IO) {
                    runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) } }.isSuccess
                }
                model.toast(if (ok) "Données exportées" else "L'export n'a pas pu être écrit")
            }
        }
        exportJson = null
    }

    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        ScreenColumn(withTabBar = false) {
            BackLink("Moi", onBack)
            Txt("Compte et données", Type.screenTitle, Modifier.padding(horizontal = 4.dp))

            Column(Modifier.fillMaxWidth().card()) {
                AccountRow(R.drawable.lucide_target, "Mon objectif", onClick = onEditGoal)
                RowDivider()
                AccountRow(R.drawable.lucide_key_round, "Nouveau code de secours", onClick = {
                    busy = true
                    scope.launch {
                        when (val result = model.api.recoveryCode()) {
                            is ApiResult.Ok -> code = result.value.code
                            is ApiResult.Failed -> model.toast(result.message)
                        }
                        busy = false
                    }
                })
                RowDivider()
                AccountRow(R.drawable.lucide_download, "Exporter mes données", onClick = {
                    busy = true
                    scope.launch {
                        when (val result = model.api.exportData()) {
                            is ApiResult.Ok -> {
                                exportJson = result.value
                                save.launch("aars-${LocalDate.now()}.json")
                            }
                            is ApiResult.Failed -> model.toast(result.message)
                        }
                        busy = false
                    }
                })
                RowDivider()
                AccountRow(R.drawable.lucide_lock, "Politique de confidentialité", onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL)))
                })
                RowDivider()
                AccountRow(R.drawable.lucide_log_out, "Se déconnecter", onClick = model::signOut)
            }

            code?.let { value ->
                Column(Modifier.fillMaxWidth().tinted(Domains.kitchen.soft, Radius.tile).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Txt("Ton code de secours", nt(13f, 600, Domains.kitchen.textOnLight))
                    Txt(value, nt(22f, 700, tracking = 0.04f))
                    Txt(
                        "Note-le maintenant : il ne sera plus affiché. Il remplace l'ancien et sert une seule fois, " +
                            "à retrouver ton compte si tu oublies ton mot de passe.",
                        Type.secondary,
                    )
                    Txt("Copier", nt(13.5f, 700, Domains.kitchen.textOnLight), Modifier.tap {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("Code de secours", value))
                        model.toast("Code copié")
                    }.padding(vertical = 4.dp))
                }
            }

            SectionCaps("Zone sensible")
            if (!deleting) {
                Row(
                    Modifier.fillMaxWidth().card().tap { deleting = true }.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(R.drawable.lucide_x, 17.dp, Macros.protein.text)
                    Txt("Supprimer mon compte", nt(14f, 600, Macros.protein.text), Modifier.weight(1f))
                }
            } else {
                Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Txt("Supprimer mon compte", nt(15f, 600, Macros.protein.text))
                    Txt(
                        "Tout est effacé : journal, pesées, profil, recettes, séances, abonnements. " +
                            "C'est définitif. Pense à exporter tes données avant.",
                        Type.secondary,
                    )
                    NutriField(
                        password, { password = it },
                        placeholder = "Ton mot de passe",
                        password = true,
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                        focusColor = Macros.protein.text,
                    )
                    error?.let { Txt(it, nt(13f, 500, Macros.protein.text)) }
                    PrimaryButton(
                        "Supprimer définitivement",
                        Domains.body.copy(fill = Macros.protein.fill, textOnFill = androidx.compose.ui.graphics.Color.White),
                        {
                            busy = true
                            error = null
                            scope.launch {
                                when (val result = model.api.deleteAccount(password)) {
                                    is ApiResult.Ok -> Unit // La session est fermée : retour à la connexion.
                                    is ApiResult.Failed -> error = result.message
                                }
                                busy = false
                            }
                        },
                        height = 48.dp,
                        enabled = password.isNotEmpty(),
                        busy = busy,
                        textSize = 15f,
                    )
                    Txt("Annuler", nt(14f, 500, Neutrals.muted), Modifier.tap { deleting = false; password = "" }.padding(6.dp))
                }
            }
        }
    }
}

@Composable
private fun AccountRow(@DrawableRes icon: Int, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().tap(onClick = onClick).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, 17.dp, Neutrals.muted)
        Txt(label, Type.bodyStrong, Modifier.weight(1f))
        Icon(R.drawable.lucide_chevron_right, 16.dp, Neutrals.faint)
    }
}

@Composable
private fun RowDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Neutrals.divider))
}
