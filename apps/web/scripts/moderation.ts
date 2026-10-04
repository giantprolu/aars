/**
 * Modération de la Communauté (règle 1.2 de l'App Store : un signalement se
 * traite sous 24 heures, en retirant le contenu et en écartant son auteur).
 *
 *   npm run moderation                          signalements ouverts
 *   npm run moderation -- resolve <n°>           clore un signalement
 *   npm run moderation -- hide-session <n°>      rendre une séance privée
 *   npm run moderation -- delete-user <n°> --yes supprimer un compte
 *
 * Les comptes sont désignés par leur identifiant public et leur numéro,
 * jamais par leur adresse. Supprimer un compte emporte tout ce qu'il porte,
 * comme la suppression demandée par la personne : c'est le dernier recours.
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

async function main(): Promise<void> {
  const [command, argument, flag] = process.argv.slice(2);
  switch (command ?? 'list') {
    case 'list':
      await list();
      return;
    case 'resolve': {
      const rows = await sql`update social_reports set resolved_at = now() where id = ${id(argument)} returning id`;
      console.log(rows.length === 0 ? 'Signalement introuvable.' : 'Signalement clos.');
      return;
    }
    case 'hide-session': {
      const rows = await sql`update workout_sessions set visibility = 'private' where id = ${id(argument)} returning id`;
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
      console.log(rows.length === 0 ? 'Compte introuvable.' : `Compte @${rows[0]?.handle ?? '?'} supprimé.`);
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
