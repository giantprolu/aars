package fr.aars.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import fr.aars.app.ui.components.PrimaryButton
import fr.aars.app.ui.components.Txt
import fr.aars.app.ui.components.card
import fr.aars.app.ui.screens.PRIVACY_URL
import fr.aars.app.ui.screens.ScreenColumn
import fr.aars.app.ui.theme.Domains
import fr.aars.app.ui.theme.Neutrals
import fr.aars.app.ui.theme.Type
import fr.aars.app.ui.theme.nt

/**
 * L'explication que Health Connect affiche quand on lui demande pourquoi
 * l'app veut ces données : `ACTION_SHOW_PERMISSIONS_RATIONALE` jusqu'à
 * Android 13, `VIEW_PERMISSION_USAGE` à partir d'Android 14 (alias du
 * manifeste). Sans elle, Health Connect refuse d'afficher la demande.
 */
class HealthRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        setContent {
            Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
                ScreenColumn(withTabBar = false) {
                    Txt("Aars et Health Connect", Type.screenTitle, Modifier.padding(horizontal = 4.dp))
                    Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Txt("Ce qui est lu", nt(14f, 600))
                        Txt(
                            "Calories actives brûlées, calories totales brûlées et métabolisme de base, sur les trente derniers jours.",
                            Type.secondary,
                        )
                        Txt("Pourquoi", nt(14f, 600))
                        Txt(
                            "Pour ajuster ta cible calorique à ta dépense réelle. L'app n'en garde qu'un total d'énergie active " +
                                "par jour, envoyé à ton compte Aars. Elle n'écrit rien dans Health Connect, ne lit rien en " +
                                "arrière-plan et ne partage ces données avec personne.",
                            Type.secondary,
                        )
                        Txt("Retirer l'accès", nt(14f, 600))
                        Txt(
                            "À tout moment, dans les réglages de Health Connect. Supprimer ton compte efface aussi l'activité reçue.",
                            Type.secondary,
                        )
                    }
                    PrimaryButton(
                        "Lire la politique de confidentialité",
                        Domains.body,
                        { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL))) },
                        height = 48.dp,
                        textSize = 15f,
                    )
                }
            }
        }
    }
}
