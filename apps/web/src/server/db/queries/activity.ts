import 'server-only';
import { sql } from 'drizzle-orm';
import { db, schema } from '../client';

/**
 * Dépense d'activité mesurée.
 *
 * Santé d'Apple est la seule source. Strava a été écarté : son interface exige
 * un abonnement payant depuis juin 2026 (voir B-9 de BLOCKERS.md). La colonne
 * `source` reste en base, au cas où une autre source arriverait, mais une
 * seule valeur est acceptée aujourd'hui.
 *
 * Si une deuxième source apparaît un jour, ne pas sommer les lignes d'une
 * même journée : deux capteurs qui voient la même sortie compteraient deux
 * fois la même dépense. Il faudra en élire une, comme le fait la requête
 * ci-dessous avec son `max` par journée.
 */

export type ActivitySource = 'health';

/**
 * Écrit la dépense d'un jour pour une source. Le même jour renvoyé deux fois
 * écrase la valeur précédente : une journée en cours est réémise au fil des
 * heures, et c'est la dernière mesure qui vaut.
 */
export async function upsertDailyActivity(
  userId: number,
  day: string,
  source: ActivitySource,
  activeKcal: number,
): Promise<void> {
  await db()
    .insert(schema.dailyActivity)
    .values({ userId, day, source, activeKcal: String(activeKcal), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        schema.dailyActivity.userId,
        schema.dailyActivity.day,
        schema.dailyActivity.source,
      ],
      set: { activeKcal: sql`excluded.active_kcal`, updatedAt: sql`now()` },
    });
}

export interface ActivityBaseline {
  /** Dépense journalière retenue, en kilocalories. */
  typicalActiveKcal: number;
  /** Plus forte journée de la fenêtre, pour diagnostiquer une mesure aberrante. */
  maxActiveKcal: number;
  /** Nombre de journées complètes ayant servi au calcul. */
  dayCount: number;
}

/**
 * Dépense habituelle sur la fenêtre précédant `today`, jour courant exclu.
 *
 * Une valeur de fenêtre plutôt que celle du jour, et c'est le premier point :
 * au réveil, la dépense du jour vaut zéro, et une cible qui en dépendrait
 * s'effondrerait chaque matin pour remonter le soir. La fenêtre récente
 * remplace le multiplicateur deviné par un multiplicateur constaté, sans
 * introduire cette instabilité.
 *
 * La médiane et non la moyenne, et c'est le second point, appris à nos dépens.
 * Le pont Santé a remonté une journée à 10 773 kcal actives ; moyennée avec
 * deux journées normales de 49 et 203 kcal, elle donnait 3 675 kcal par jour et
 * portait la cible d'un homme de 90 kg qui veut maigrir à plus de quatre mille
 * kilocalories. La médiane de ces trois journées vaut 203. Une seule mesure
 * fausse ne peut pas déplacer une médiane, alors qu'elle emporte une moyenne :
 * sur une fenêtre de quatorze jours alimentée par un capteur grand public, ce
 * n'est pas un raffinement, c'est la seule statistique tenable.
 *
 * Le maximum est rendu à côté, sans servir au calcul : c'est lui qui permet à
 * l'écran de réglages de dire que le raccourci envoie n'importe quoi.
 */
export async function activityBaseline(
  userId: number,
  today: string,
  windowDays: number,
): Promise<ActivityBaseline> {
  // Les bornes sont calculées en JavaScript plutôt qu'en SQL : le pilote HTTP
  // envoie ses paramètres en texte, et `date - $n` n'a alors pas d'opérateur.
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - windowDays);
  const from = start.toISOString().slice(0, 10);

  const result = await db().execute<{
    median: string | null;
    peak: string | null;
    days: string;
  }>(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY kcal) AS median,
      max(kcal) AS peak,
      count(*) AS days
    FROM (
      SELECT max(active_kcal) AS kcal
      FROM daily_activity
      WHERE user_id = ${userId}
        AND day < ${today}
        AND day >= ${from}
      GROUP BY day
    ) AS per_day
  `);

  const row = result.rows[0];
  return {
    typicalActiveKcal: row?.median == null ? 0 : Number(row.median),
    maxActiveKcal: row?.peak == null ? 0 : Number(row.peak),
    dayCount: Number(row?.days ?? 0),
  };
}

export interface LastActivity {
  day: string;
  activeKcal: number;
  receivedAt: Date;
}

/**
 * La dernière journée reçue, pour que l'écran de réglages dise si le raccourci
 * tourne encore. Une automatisation silencieuse qui a cessé de fonctionner est
 * indiscernable d'une automatisation qui marche, sauf à l'afficher quelque part.
 */
export async function lastActivity(userId: number): Promise<LastActivity | null> {
  const result = await db().execute<{
    day: string;
    active_kcal: string;
    updated_at: string;
  }>(sql`
    SELECT day, active_kcal, updated_at
    FROM daily_activity
    WHERE user_id = ${userId}
    ORDER BY day DESC
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    // Le pilote rend une date complète ; seule la journée nous intéresse.
    day: String(row.day).slice(0, 10),
    activeKcal: Number(row.active_kcal),
    receivedAt: new Date(row.updated_at),
  };
}
