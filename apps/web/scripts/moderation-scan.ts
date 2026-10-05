/**
 * Passe de rattrapage : revoit les textes publics écrits avant la modération.
 *
 *   npm run moderation:scan -w @nutri/web              aperçu, rien n'est écrit
 *   npm run moderation:scan -w @nutri/web -- --apply   ouvre les dossiers
 *
 * Revoit les pseudos et noms affichés, les noms des modèles dont une séance
 * est partagée, et les exercices saisis à l'import encore visibles. En mode
 * `--apply`, un texte qui pose problème ouvre un dossier pour l'équipe, sans
 * rien masquer ni sanctionner : la règle n'existait pas quand il a été écrit.
 * L'aperçu n'affiche que des numéros et des catégories, jamais le texte.
 *
 * À lancer une fois, après la migration 0026 appliquée sur la base.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const apply = process.argv.includes('--apply');
const { db } = await import('../src/server/db/client');
const { sql } = await import('drizzle-orm');
const { classifyLocally } = await import('../src/lib/moderation/rules');
const { checkContent } = await import('../src/server/moderation/pipeline');

type Field = 'identity' | 'template_name' | 'exercise_name';
interface Item {
  userId: number;
  targetKind: 'user' | 'template_name' | 'exercise_name';
  targetId: number;
  text: string;
  field: Field;
}

const identities = await db().execute<{ id: number; handle: string; display_name: string | null }>(sql`
  select id::int as id, handle, display_name from users where handle is not null`);
const templates = await db().execute<{ id: number; user_id: number; name: string }>(sql`
  select distinct t.id::int as id, t.user_id::int as user_id, t.name
  from workout_templates t join workout_sessions s on s.template_id = t.id
  where s.visibility <> 'private' and t.kind <> 'program' and t.name_reviewed_at is null`);
// Un exercice importé n'a pas d'auteur en base : le dossier vise le premier
// compte qui l'a utilisé dans une séance.
const exercises = await db().execute<{ id: number; name: string; user_id: number | null }>(sql`
  select e.id::int as id, e.name,
         (select ws.user_id::int from workout_sets ws where ws.exercise_id = e.id order by ws.done_at limit 1) as user_id
  from exercises e where e.source = 'manual' and e.hidden_at is null`);

const items: Item[] = [
  ...identities.rows.map((row) => ({
    userId: row.id,
    targetKind: 'user' as const,
    targetId: row.id,
    text: `${row.handle} ${row.display_name ?? ''}`.trim(),
    field: 'identity' as const,
  })),
  ...templates.rows.map((row) => ({
    userId: row.user_id,
    targetKind: 'template_name' as const,
    targetId: row.id,
    text: row.name,
    field: 'template_name' as const,
  })),
  ...exercises.rows.flatMap((row) =>
    row.user_id === null
      ? []
      : [{ userId: row.user_id, targetKind: 'exercise_name' as const, targetId: row.id, text: row.name, field: 'exercise_name' as const }],
  ),
];

let flagged = 0;
for (const item of items) {
  const { detections } = classifyLocally(item.text, item.field);
  if (detections.length === 0) {
    continue;
  }
  flagged += 1;
  const categories = detections.map((detection) => `${detection.category} ${detection.confidence}`).join(', ');
  if (!apply) {
    console.log(`${item.targetKind} n° ${item.targetId} (compte ${item.userId}) : ${categories}`);
    continue;
  }
  const verdict = await checkContent({
    subjectUserId: item.userId,
    targetKind: item.targetKind,
    targetId: item.targetId,
    text: item.text,
    field: item.field,
    preExposure: false,
    scan: true,
  });
  console.log(`${item.targetKind} n° ${item.targetId} : ${verdict.caseId === null ? 'rien à revoir' : `dossier n° ${verdict.caseId}`}`);
}

console.log(
  `${items.length} textes revus, ${flagged} avec une détection.${apply ? '' : ' Aperçu seulement : relancer avec --apply pour ouvrir les dossiers.'}`,
);
