package fr.nutriperso.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import fr.nutriperso.app.data.Api
import fr.nutriperso.app.data.ApiResult
import fr.nutriperso.app.data.LunchReminder
import fr.nutriperso.app.data.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Au-delà, on s'en remet au journal vu par l'app : `goAsync` ne laisse que
 * quelques secondes. L'appel garde ses propres délais (OkHttp, `Api`).
 */
private const val CHECK_TIMEOUT_MS = 8_000L

/**
 * Le réveil du rappel du déjeuner, et sa reprogrammation après un
 * redémarrage du téléphone ou une mise à jour de l'app, qui effacent les
 * alarmes.
 *
 * À 14 heures, le journal du jour est lu sur le serveur avec le jeton de
 * session : le rappel ne part que si ni déjeuner ni dîner n'y figure, quel que
 * soit l'appareil où le repas a été noté. Sans réponse, l'app s'en remet à ce
 * qu'elle a vu à sa dernière ouverture.
 */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> LunchReminder.schedule(app)
            LunchReminder.ACTION_FIRE -> {
                val pending = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        if (shouldRemind(app)) LunchReminder.show(app)
                    } finally {
                        LunchReminder.schedule(app)
                        pending.finish()
                    }
                }
            }
        }
    }

    private suspend fun shouldRemind(context: Context): Boolean {
        if (!LunchReminder.isEnabled(context)) return false
        val tokens = TokenStore(context)
        // Plus de session : personne à qui rappeler quoi que ce soit.
        if (tokens.read() == null) return false
        val day = LunchReminder.today()
        val noted = when (val result = withTimeoutOrNull(CHECK_TIMEOUT_MS) { Api(tokens).today() }) {
            is ApiResult.Ok -> result.value.entries.any { it.meal == "lunch" || it.meal == "dinner" }
            else -> LunchReminder.notedLocally(context, day)
        }
        return !noted
    }
}
