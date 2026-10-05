/**
 * Modération de la Communauté (règle 1.2 de l'App Store : un signalement se
 * traite sous 24 heures, en retirant le contenu et en écartant son auteur).
 *
 *   npm run moderation                          signalements ouverts
 *   npm run moderation -- cases                  dossiers ouverts, par priorité
 *   npm run moderation -- resolve <n°>           clore un signalement
 *   npm run moderation -- hide-session <n°>      rendre une séance privée
 *   npm run moderation -- delete-user <n°> --yes supprimer un compte
 *   npm run moderation -- verify-audit           vérifier la chaîne du journal d'audit
 *
 * Les comptes sont désignés par leur identifiant public et leur numéro,
 * jamais par leur adresse. Supprimer un compte emporte tout ce qu'il porte,
 * comme la suppression demandée par la personne : c'est le dernier recours.
 * Chaque geste est inscrit au journal d'audit de la modération, au nom `cli`.
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

const REASONS: Record<string, string> = {
  inappropriate: 'Contenu inapproprié',
  harassment: 'Harcèlement',
  spam: 'Spam ou faux compte',
  other: 'Autre',
};

function id(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.error('Un numéro est attendu.');
    process.exit(1);
  }
  return value;
}

async function list(): Promise<void> {
  const rows = await sql`
    select r.id, r.reason, r.note, r.created_at, r.session_id,
           reported.id as reported_id, reported.handle as reported_handle,
           reporter.handle as reporter_handle,
           s.visibility as session_visibility, t.name as session_name,
           (select count(*) from social_reports o
             where o.reported_user_id = r.reported_user_id and o.resolved_at is null) as open_on_person
    from social_reports r
    join users reported on reported.id = r.reported_user_id
    join users reporter on reporter.id = r.reporter_id
    left join workout_sessions s on s.id = r.session_id
    left join workout_templates t on t.id = s.template_id
    where r.resolved_at is null
    order by r.created_at asc`;
  if (rows.length === 0) {
    console.log('Aucun signalement ouvert.');
    return;
  }
  for (const row of rows) {
    const age = Math.round((Date.now() - new Date(String(row.created_at)).getTime()) / 3_600_000);
    console.log(`n° ${row.id} · il y a ${age} h · ${REASONS[String(row.reason)] ?? row.reason}`);
    console.log(`  signalé : @${row.reported_handle} (compte ${row.reported_id}), ${row.open_on_person} signalement(s) ouvert(s)`);
    console.log(`  par     : @${row.reporter_handle ?? '?'}`);
    if (row.session_id !== null) {
      console.log(`  séance  : « ${row.session_name ?? 'Séance'} » (n° ${row.session_id}, ${row.session_visibility})`);
    }
    if (row.note) {
      console.log(`  note    : ${row.note}`);
    }
  }
}

/** Inscrit un geste au journal d'audit ; le déclencheur le numérote et le chaîne. */
async function audit(event: string, caseId: number | null, userId: number | null, details: Record<string, unknown>): Promise<void> {
  await sql`insert into moderation_audit (actor, event, case_id, user_id, details)
            values ('cli', ${event}, ${caseId}, ${userId}, ${JSON.stringify(details)}::jsonb)`;
}

async function cases(): Promise<void> {
  const rows = await sql`
    select c.id, c.priority, c.status, c.category, c.level, c.risk_score, c.flags, c.recommended_action,
           c.target_kind, c.target_id, c.created_at, u.id as user_id, u.handle,
           (select count(*) from social_reports r where r.case_id = c.id) as reports
    from moderation_cases c join users u on u.id = c.subject_user_id
    where c.status in ('open', 'triaged', 'under_review', 'appealed')
    order by c.priority asc, c.created_at asc`;
  if (rows.length === 0) {
    console.log('Aucun dossier ouvert.');
    return;
  }
  for (const row of rows) {
    const age = Math.round((Date.now() - new Date(String(row.created_at)).getTime()) / 3_600_000);
    const flags = Array.isArray(row.flags) && row.flags.length > 0 ? ` [${row.flags.join(', ')}]` : '';
    console.log(`P${row.priority} · dossier n° ${row.id} · il y a ${age} h · ${row.status}${flags}`);
    console.log(`  cible   : ${row.target_kind} n° ${row.target_id}, @${row.handle ?? '?'} (compte ${row.user_id})`);
    console.log(`  risque  : ${row.category ?? '—'} · ${row.level} (${row.risk_score}) · ${row.reports} signalement(s)`);
    if (row.recommended_action) {
      console.log(`  proposé : ${row.recommended_action} (à décider par un humain)`);
    }
  }
}

async function main(): Promise<void> {
  const [command, argument, flag] = process.argv.slice(2);
  switch (command ?? 'list') {
    case 'list':
      await list();
      return;
    case 'cases':
      await cases();
      return;
    case 'resolve': {
      const reportId = id(argument);
      const rows = await sql`update social_reports set resolved_at = now(), status = 'resolved'
                             where id = ${reportId} and resolved_at is null
                             returning case_id, reported_user_id`;
      const row = rows[0];
      if (row !== undefined) {
        await audit('REPORT_RESOLVED', row.case_id === null ? null : Number(row.case_id), Number(row.reported_user_id), { reportId });
      }
      console.log(rows.length === 0 ? 'Signalement introuvable ou déjà clos.' : 'Signalement clos.');
      return;
    }
    case 'hide-session': {
      const sessionId = id(argument);
      const rows = await sql`update workout_sessions set visibility = 'private' where id = ${sessionId} returning user_id`;
      const row = rows[0];
      if (row !== undefined) {
        await audit('CONTENT_HIDDEN', null, Number(row.user_id), { targetKind: 'session', targetId: sessionId });
      }
      console.log(rows.length === 0 ? 'Séance introuvable.' : 'Séance rendue privée : plus personne ne la voit.');
      return;
    }
    case 'delete-user': {
      const userId = id(argument);
      if (flag !== '--yes') {
        console.error(`Supprimer le compte ${userId} et tout ce qu'il porte : relancer avec --yes.`);
        process.exit(1);
      }
      const rows = await sql`delete from users where id = ${userId} returning handle`;
      if (rows.length > 0) {
        await audit('ACCOUNT_DELETED_BY_MODERATION', null, userId, {});
      }
      console.log(rows.length === 0 ? 'Compte introuvable.' : `Compte @${rows[0]?.handle ?? '?'} supprimé.`);
      return;
    }
    case 'verify-audit': {
      const rows = await sql`
        select id from (
          select id, hash, prev_hash, lag(hash) over (order by id) as expected_prev,
                 row_number() over (order by id) as position,
                 encode(sha256(convert_to(concat_ws('|', coalesce(prev_hash, ''), id::text,
                   to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), actor, event,
                   coalesce(case_id::text, ''), coalesce(user_id::text, ''), details::text), 'UTF8')), 'hex') as expected_hash
          from moderation_audit) chain
        where hash <> expected_hash or (position > 1 and prev_hash is distinct from expected_prev)
        order by id`;
      console.log(
        rows.length === 0
          ? 'Journal d’audit intact.'
          : `Chaîne rompue aux lignes : ${rows.map((row) => String(row.id)).join(', ')}.`,
      );
      return;
    }
    default:
      console.error(`Commande inconnue : ${command}. Voir l'en-tête de scripts/moderation.ts.`);
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
