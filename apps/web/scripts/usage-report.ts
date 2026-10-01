/**
 * Rapport de mesure d'usage (étape « mesurer », 01/10/2026).
 *
 * Lancement : npm run usage:report
 *
 * Ne lit que des agrégats : `users` pour la date d'inscription, `usage_days`
 * pour les compteurs, `store_subscriptions` pour l'abonnement. Il n'affiche
 * aucun compte, aucune adresse, et ne touche ni au journal ni aux profils :
 * la mesure répond à « que font les gens ? », pas à « qui fait quoi ? ».
 *
 * Les jours sont ceux de Paris, comme le journal. La rétention Jn est la part
 * des comptes revenus le n-ième jour après leur inscription, parmi ceux dont
 * ce jour est passé ; un compte inscrit hier ne compte pas encore pour J7.
 */
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });
config({ path: '.env' });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquante (.env.local).');
  process.exit(1);
}
const sql = neon(url);

/** Fenêtre des sections « récentes », en jours. */
const RECENT_DAYS = 30;

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)} %`;
}

function count(value: unknown): number {
  return Number(value ?? 0);
}

async function main(): Promise<void> {
  const [totals] = await sql`
    select
      count(*) as accounts,
      count(*) filter (where exists (
        select 1 from usage_days d where d.user_id = u.id and d.event = 'target_set')) as with_target,
      count(*) filter (where exists (
        select 1 from usage_days d where d.user_id = u.id and d.event like 'meal\\_%')) as with_meal,
      count(*) filter (where exists (
        select 1 from usage_days d where d.user_id = u.id and d.event like 'meal\\_%'
          and d.day <= (u.created_at at time zone 'Europe/Paris')::date + 1)) as meal_first_day
    from users u`;

  const accounts = count(totals?.accounts);
  console.log(`\nComptes : ${accounts}`);
  console.log('\nActivation (depuis le début de la mesure)');
  console.log(`  cible calculée          ${percent(count(totals?.with_target), accounts)}`);
  console.log(`  au moins un repas       ${percent(count(totals?.with_meal), accounts)}`);
  console.log(`  repas dès J0 ou J1      ${percent(count(totals?.meal_first_day), accounts)}`);

  console.log('\nRétention (revenu le jour n après l\'inscription)');
  for (const n of [1, 7, 30]) {
    const [row] = await sql`
      select
        count(*) as eligible,
        count(*) filter (where exists (
          select 1 from usage_days d where d.user_id = u.id and d.day = (u.created_at at time zone 'Europe/Paris')::date + ${n}::int)) as returned
      from users u
      where (u.created_at at time zone 'Europe/Paris')::date + ${n}::int < (now() at time zone 'Europe/Paris')::date`;
    const eligible = count(row?.eligible);
    console.log(`  J${String(n).padEnd(3)} ${percent(count(row?.returned), eligible).padStart(6)}  (sur ${eligible} comptes)`);
  }

  const weeks = await sql`
    select
      date_trunc('week', day)::date as week,
      count(distinct user_id) filter (where event like 'meal\\_%') as loggers,
      coalesce(sum(count) filter (where event like 'meal\\_%'), 0) as meals,
      count(distinct user_id) as active
    from usage_days
    where day >= (now() at time zone 'Europe/Paris')::date - 28
    group by 1
    order by 1`;
  console.log('\nSemaines récentes');
  console.log('  semaine      actifs  ajouts  ajouts par compte qui note');
  for (const week of weeks) {
    const loggers = count(week.loggers);
    const meals = count(week.meals);
    const perLogger = loggers === 0 ? '—' : (meals / loggers).toFixed(1);
    console.log(`  ${String(week.week).slice(0, 10)}  ${String(count(week.active)).padStart(6)}  ${String(meals).padStart(6)}  ${perLogger.padStart(6)}`);
  }

  const methods = await sql`
    select substr(event, 6) as method, sum(count) as meals
    from usage_days
    where event like 'meal\\_%' and day >= (now() at time zone 'Europe/Paris')::date - ${RECENT_DAYS}::int
    group by 1
    order by 2 desc`;
  const allMeals = methods.reduce((sum, row) => sum + count(row.meals), 0);
  console.log(`\nMoyens de saisie (${RECENT_DAYS} derniers jours, ${allMeals} ajouts)`);
  for (const row of methods) {
    console.log(`  ${String(row.method).padEnd(10)} ${percent(count(row.meals), allMeals).padStart(6)}`);
  }

  const [recent] = await sql`
    select
      count(distinct user_id) as active,
      count(distinct user_id) filter (where event = 'activity_synced') as synced,
      count(distinct user_id) filter (where event = 'paywall_hit') as paywalled
    from usage_days
    where day >= (now() at time zone 'Europe/Paris')::date - ${RECENT_DAYS}::int`;
  const active = count(recent?.active);
  console.log(`\nComptes actifs sur ${RECENT_DAYS} jours : ${active}`);
  console.log(`  dépense Santé reçue     ${percent(count(recent?.synced), active)}`);
  console.log(`  limite gratuite atteinte ${percent(count(recent?.paywalled), active)}`);

  const [billing] = await sql`
    select count(distinct user_id) as subscribers
    from store_subscriptions
    -- Même règle que grantsPremium : un abonnement résilié ouvre l'accès jusqu'à son échéance.
    where state in ('active', 'in_grace_period', 'canceled') and expires_at > now()`;
  const subscribers = count(billing?.subscribers);
  console.log('\nConversion');
  console.log(`  abonnés actifs          ${subscribers} (${percent(subscribers, accounts)} des comptes)`);
  console.log('');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
