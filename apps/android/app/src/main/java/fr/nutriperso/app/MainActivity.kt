package fr.nutriperso.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import fr.nutriperso.app.ui.auth.AuthScreen
import fr.nutriperso.app.ui.onboarding.OnboardingFlow
import fr.nutriperso.app.ui.screens.MainShell
import fr.nutriperso.app.ui.theme.Neutrals

class MainActivity : ComponentActivity() {
    private val model: AppModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Barres système transparentes à icônes sombres : seul le thème clair
        // est dessiné pour l'instant (README de la maquette, décision 3).
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        setContent { NutriApp(model) }
    }

    override fun onResume() {
        super.onResume()
        // Les journées Santé se rattrapent à chaque retour dans l'app.
        model.syncHealth()
    }
}

@Composable
fun NutriApp(model: AppModel) {
    val signedIn by model.api.signedIn.collectAsState()
    Box(Modifier.fillMaxSize().background(Neutrals.screen)) {
        val screen = when {
            !signedIn -> "auth"
            model.gate == Gate.Onboarding -> "onboarding"
            model.gate == Gate.Ready -> "app"
            else -> "checking"
        }
        Crossfade(screen, label = "racine") { target ->
            when (target) {
                "auth" -> AuthScreen(model)
                "onboarding" -> OnboardingFlow(model)
                "app" -> MainShell(model)
                else -> Box(Modifier.fillMaxSize().background(Neutrals.screen))
            }
        }
    }
}
