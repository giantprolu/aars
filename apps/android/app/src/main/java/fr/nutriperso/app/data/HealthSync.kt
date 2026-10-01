package fr.nutriperso.app.data

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import kotlin.math.roundToInt

/** Où en est Health Connect sur ce téléphone. */
enum class HealthAvailability {
    /** Android 8 : Health Connect n'existe pas. */
    Unsupported,

    /** Android 9 à 13 sans l'app Health Connect, ou une version trop ancienne. */
    NeedsInstall,

    Available,
}

/**
 * Le pont Santé de l'app Android : Health Connect, lu au premier plan.
 *
 * L'app ne lit qu'un nombre par jour, l'énergie active, et le pousse sur
 * `POST /api/activity` avec le jeton de session. Pas de lecture en arrière-plan
 * (et donc pas de permission `READ_HEALTH_DATA_IN_BACKGROUND` à justifier
 * devant Google) : chaque ouverture relit les trente derniers jours, ce qui
 * rattrape toute journée manquée tant que l'app est ouverte une fois par mois.
 *
 * Énergie active d'abord. Certaines sources n'écrivent que la dépense totale :
 * on retire alors le métabolisme de base que Health Connect calcule, ce qui
 * redonne la même grandeur, celle que l'iPhone remonte comme « énergie
 * active ».
 */
class HealthSync(private val context: Context) {

    fun availability(): HealthAvailability = when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
        HealthConnectClient.SDK_AVAILABLE -> HealthAvailability.Available
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthAvailability.NeedsInstall
        else -> HealthAvailability.Unsupported
    }

    private fun client(): HealthConnectClient? =
        if (availability() == HealthAvailability.Available) HealthConnectClient.getOrCreate(context) else null

    /** Les permissions accordées parmi les nôtres. Vide si Health Connect est absent. */
    suspend fun granted(): Set<String> {
        val client = client() ?: return emptySet()
        return runCatching { client.permissionController.getGrantedPermissions() }
            .getOrDefault(emptySet())
            .intersect(PERMISSIONS)
    }

    /** Vrai si l'énergie active, ou à défaut la totale, est lisible. */
    suspend fun canRead(): Boolean {
        val granted = granted()
        return ACTIVE in granted || TOTAL in granted
    }

    /**
     * L'énergie active des [days] derniers jours, aujourd'hui compris, jour par
     * jour. Un jour sans aucune mesure est omis plutôt qu'envoyé à zéro : le
     * téléphone resté dans un tiroir ne doit pas tirer la médiane vers le bas.
     */
    suspend fun readDays(days: Int = WINDOW_DAYS): List<ActivityDay> {
        val client = client() ?: return emptyList()
        val granted = granted()
        // Une métrique sans permission fait lever toute l'agrégation : on ne
        // demande que ce qui a été accordé.
        val metrics = buildSet {
            if (ACTIVE in granted) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
            if (TOTAL in granted) add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
            if (BASAL in granted) add(BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL)
        }
        if (metrics.isEmpty()) return emptyList()

        // Les jours du journal sont ceux de Paris, comme côté serveur.
        val today = LocalDate.now(PARIS)
        val request = AggregateGroupByPeriodRequest(
            metrics = metrics,
            timeRangeFilter = TimeRangeFilter.between(
                today.minusDays((days - 1).toLong()).atStartOfDay(),
                today.plusDays(1).atStartOfDay(),
            ),
            timeRangeSlicer = Period.ofDays(1),
        )
        val groups = client.aggregateGroupByPeriod(request)
        return groups.mapNotNull { group ->
            val result = group.result
            val active = if (ACTIVE in granted) result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories else null
            val total = if (TOTAL in granted) result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories else null
            val basal = if (BASAL in granted) result[BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL]?.inKilocalories else null
            val kcal = active ?: if (total != null && basal != null) (total - basal).coerceAtLeast(0.0) else null
            // Au-delà du plafond du serveur, la valeur est fausse et ferait
            // refuser tout le lot.
            if (kcal == null || kcal.isNaN() || kcal > MAX_KCAL) {
                null
            } else {
                ActivityDay(group.startTime.toLocalDate().toString(), (kcal * 10).roundToInt() / 10.0)
            }
        }
    }

    /** Vrai si l'écriture de test est accordée (debug seulement, voir le manifeste de debug). */
    suspend fun canWriteSamples(): Boolean {
        val client = client() ?: return false
        return runCatching { WRITE_ACTIVE in client.permissionController.getGrantedPermissions() }.getOrDefault(false)
    }

    /**
     * Écrit [days] journées d'énergie active, d'hier en remontant, pour essayer
     * le pont sur un émulateur. Une séance d'une heure à midi par jour, de 250 à
     * 550 kcal. Rejouer l'écriture ajoute des enregistrements : Health Connect
     * les somme, d'où des journées plus fortes à chaque appui.
     */
    suspend fun writeSampleDays(days: Int = 7): Boolean {
        val client = client() ?: return false
        val today = LocalDate.now(PARIS)
        val records = (1..days).map { back ->
            val start = today.minusDays(back.toLong()).atTime(12, 0).atZone(PARIS)
            ActiveCaloriesBurnedRecord(
                startTime = start.toInstant(),
                startZoneOffset = start.offset,
                endTime = start.plusHours(1).toInstant(),
                endZoneOffset = start.offset,
                energy = Energy.kilocalories(250.0 + (back * 47) % 300),
                metadata = Metadata.manualEntry(),
            )
        }
        return runCatching { client.insertRecords(records) }.isSuccess
    }

    companion object {
        const val PROVIDER = "com.google.android.apps.healthdata"
        const val WINDOW_DAYS = 30
        private const val MAX_KCAL = 20000.0
        private val PARIS: ZoneId = ZoneId.of("Europe/Paris")

        val ACTIVE = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
        val TOTAL = HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class)
        val BASAL = HealthPermission.getReadPermission(BasalMetabolicRateRecord::class)

        /** Les trois permissions déclarées dans le manifeste, et rien d'autre. */
        val PERMISSIONS: Set<String> = setOf(ACTIVE, TOTAL, BASAL)

        /** Debug seulement : déclarée dans `src/debug/AndroidManifest.xml`. */
        val WRITE_ACTIVE = HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class)
    }
}
