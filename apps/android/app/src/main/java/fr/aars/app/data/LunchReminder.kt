package fr.nutriperso.app.data

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import fr.nutriperso.app.MainActivity
import fr.nutriperso.app.R
import fr.nutriperso.app.ReminderReceiver
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Le rappel du déjeuner, programmé sur le téléphone.
 *
 * Même règle que le serveur (`services/reminders.ts`) : un seul rappel par
 * jour, à 14 heures à Paris, et seulement si ni déjeuner ni dîner n'est noté.
 * Une alarme réveille [ReminderReceiver], qui lit le journal du jour sur le
 * serveur avant de prévenir. Rien n'est conservé côté serveur : la préférence
 * est celle du téléphone, comme l'abonnement d'un navigateur sur le web.
 */
object LunchReminder {
    const val HOUR = 14
    const val ACTION_FIRE = "fr.nutriperso.app.LUNCH_REMINDER"
    const val EXTRA_OPEN = "fr.nutriperso.app.OPEN"
    const val OPEN_MEAL = "meal"

    private const val PREFS = "reminders"
    private const val KEY_ENABLED = "lunch"
    private const val KEY_NOTED_DAY = "lunch_noted_day"
    private const val CHANNEL = "lunch_reminder"
    private const val NOTIFICATION_ID = 14
    private val PARIS: ZoneId = ZoneId.of("Europe/Paris")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    /** Faux si les notifications de l'app sont coupées, ou la permission refusée. */
    fun canNotify(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()

    fun enable(context: Context) {
        prefs(context).edit().putBoolean(KEY_ENABLED, true).apply()
        createChannel(context)
        schedule(context)
    }

    fun disable(context: Context) {
        prefs(context).edit().putBoolean(KEY_ENABLED, false).apply()
        cancel(context)
    }

    /** Le jour du journal, à Paris, comme côté serveur. */
    fun today(): String = LocalDate.now(PARIS).toString()

    /**
     * L'app a lu le journal du jour : elle retient si un repas qui compte y
     * est. C'est le repli du rappel quand le serveur ne répond pas à 14 heures.
     */
    fun noteToday(context: Context, day: String, noted: Boolean) {
        prefs(context).edit().putString(KEY_NOTED_DAY, if (noted) day else null).apply()
    }

    fun notedLocally(context: Context, day: String): Boolean = prefs(context).getString(KEY_NOTED_DAY, null) == day

    /**
     * Pose la prochaine alarme : aujourd'hui à 14 heures si ce n'est pas
     * passé, sinon demain. Inexacte (quelques minutes de jeu au plus), ce qui
     * évite la permission d'alarme exacte : un rappel n'a pas besoin de la
     * seconde.
     */
    fun schedule(context: Context) {
        if (!isEnabled(context)) return
        val now = ZonedDateTime.now(PARIS)
        var next = now.toLocalDate().atTime(HOUR, 0).atZone(PARIS)
        if (!next.isAfter(now)) next = next.plusDays(1)
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.toInstant().toEpochMilli(), alarm(context))
    }

    /** Retire l'alarme et le rappel affiché, sans changer la préférence. */
    fun cancel(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(alarm(context))
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    /** Le rappel, qui ouvre la feuille Repas. */
    fun show(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        createChannel(context)
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_OPEN, OPEN_MEAL),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val text = "Deux touches maintenant valent mieux qu’un souvenir approximatif ce soir."
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setColor(ContextCompat.getColor(context, R.color.nutrition))
            .setContentTitle("Rien de noté ce midi")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    private fun alarm(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, ReminderReceiver::class.java).setAction(ACTION_FIRE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, "Rappel du déjeuner", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "À 14 h, si rien n'est noté au déjeuner ni au dîner."
        }
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
}
