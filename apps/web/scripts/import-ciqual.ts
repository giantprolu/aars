/**
 * Import de la table CIQUAL de l'ANSES (FR-6).
 *
 * Idempotent : relancer le script ne crée aucun doublon et met à jour les
 * lignes existantes sur le code CIQUAL.
 *
 * Le CSV de l'ANSES a trois particularités qui font échouer un import naïf :
 * la virgule décimale, les valeurs de trace (« traces », « < 0,1 ») et les
 * valeurs absentes (« - »). Elles sont normalisées ici, jamais à la lecture.
 *
 * Lancement : npm run import:ciqual -- data/ciqual.csv
 * Voir B-4 de BLOCKERS.md : le fichier n'est pas versionné.
 */
import { readFileSync, existsSync } from 'node:fs';
import { config } from 'dotenv';
import { parse } from 'csv-parse/sync';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

import {
  mapColumns,
  parseNutrient,
  isCompleteRow,
  findOptionalColumn,
  parseGroupCode,
  GROUP_COLUMN_ALIASES,
} from './ciqual-parse';

/**
 * Les variables sont chargées ici explicitement, comme dans `drizzle.config.ts`
 * et pour la même raison : ce script tourne hors de Next, seul à lire
 * `.env.local` de lui-même. Sans cela l'import échoue sur une URL vide alors
 * que l'application, elle, démarre très bien.
 *
 * `.env.local` d'abord, `.env` ensuite : dotenv ne réécrit jamais une variable
 * déjà posée, donc le fichier local l'emporte, comme chez Next.
 */
config({ path: '.env.local' });
config({ path: '.env' });

const DEFAULT_PATH = 'data/ciqual.csv';

/**
 * Les libellés de l'ANSES sont coupés par des retours à la ligne dans le
 * tableur d'origine. Ils sont ramenés à une seule ligne : le nom sert à
 * l'affichage et à la recherche trigramme, où un saut de ligne fausse tout.
 */
function cleanLabel(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Le séparateur majoritaire sur la première ligne, hors champs entre guillemets. */
function detectDelimiter(content: Buffer): ';' | ',' {
  const header = content.toString('utf8').split(/\r?\n/)[0] ?? '';
  let inQuotes = false;
  let semicolons = 0;
  let commas = 0;
  for (const char of header) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === ';') {
      semicolons += 1;
    } else if (!inQuotes && char === ',') {
      commas += 1;
    }
  }
  return commas > semicolons ? ',' : ';';
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_PATH;

  if (!existsSync(path)) {
    console.error(
      `Fichier introuvable : ${path}\n` +
        'Telecharge la table de composition depuis ciqual.anses.fr, place-la ' +
        `dans ${DEFAULT_PATH}, puis relance. Voir B-4 de BLOCKERS.md.`,
    );
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL n'est pas configuree. Voir B-2 de BLOCKERS.md.");
    process.exitCode = 1;
    return;
  }

  // Le CSV de l'ANSES est publié en séparateur point-virgule, mais un export
  // retraité peut arriver en virgule. Le séparateur est déduit de l'en-tête
  // plutôt qu'accepté au choix : les libellés de l'ANSES contiennent des
  // virgules (« Lait, demi-écrémé ») qui découperaient les lignes à tort.
  const content = readFileSync(path);
  const delimiter = detectDelimiter(content);

  const rows = parse(content, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const first = rows[0];
  if (!first) {
    console.error('Le fichier ne contient aucune ligne.');
    process.exitCode = 1;
    return;
  }

  const mapping = mapColumns(Object.keys(first));
  if (!mapping.ok) {
    console.error(`Colonnes introuvables dans le CSV : ${mapping.missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const columns = mapping.columns;

  // Facultative : elle ne sert qu'au rangement de la liste de courses, et son
  // absence ne doit pas faire échouer l'import de la table entière.
  const groupColumn = findOptionalColumn(Object.keys(first), GROUP_COLUMN_ALIASES);
  if (groupColumn === null) {
    console.warn(
      'Colonne de groupe alimentaire absente : les ingredients seront ranges ' +
        'au rayon « Divers » de la liste de courses.',
    );
  }

  const db = drizzle(neon(databaseUrl), { schema });
  let imported = 0;
  let incomplete = 0;
  const batch: (typeof schema.ciqualFoods.$inferInsert)[] = [];

  for (const row of rows) {
    const code = row[columns.code]?.trim();
    const name = cleanLabel(row[columns.name]);
    if (!code || !name) {
      continue;
    }

    const kcal = parseNutrient(row[columns.kcal]);
    const protein = parseNutrient(row[columns.protein]);
    const carbs = parseNutrient(row[columns.carbs]);
    const fat = parseNutrient(row[columns.fat]);
    const isComplete = isCompleteRow({ kcal, protein, carbs, fat });

    if (!isComplete) {
      incomplete += 1;
    }

    batch.push({
      ciqualCode: code,
      name,
      groupCode: groupColumn === null ? null : parseGroupCode(row[groupColumn]),
      kcal100g: kcal === null ? null : String(kcal),
      protein100g: protein === null ? null : String(protein),
      carbs100g: carbs === null ? null : String(carbs),
      fat100g: fat === null ? null : String(fat),
      isComplete,
      updatedAt: new Date(),
    });
  }

  // Par lots : une seule requête par ligne saturerait la connexion HTTP Neon.
  const CHUNK = 200;
  for (let index = 0; index < batch.length; index += CHUNK) {
    const chunk = batch.slice(index, index + CHUNK);
    await db
      .insert(schema.ciqualFoods)
      .values(chunk)
      .onConflictDoUpdate({
        target: schema.ciqualFoods.ciqualCode,
        set: {
          name: sql`excluded.name`,
          groupCode: sql`excluded.group_code`,
          kcal100g: sql`excluded.kcal_100g`,
          protein100g: sql`excluded.protein_100g`,
          carbs100g: sql`excluded.carbs_100g`,
          fat100g: sql`excluded.fat_100g`,
          isComplete: sql`excluded.is_complete`,
          updatedAt: sql`now()`,
        },
      });
    imported += chunk.length;
  }

  console.log(
    `${imported} aliments importes depuis ${path}` +
      (incomplete > 0 ? `, dont ${incomplete} incomplets exclus de la recherche` : ''),
  );
}

await main();
