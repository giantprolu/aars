/**
 * Import de plats dans le catalogue, depuis un fichier JSON.
 *
 *   npm run seed:catalog -w @nutri/web -- chemin/vers/plats.json
 *
 * Le fichier range les plats par objectif :
 *
 *   { "lose": [ { "slug": "…", "name": "…", "slot": "dinner", "servings": 2,
 *                 "prepMinutes": 20, "steps": ["…"],
 *                 "ingredients": [{ "label": "…", "searchTerm": "…", "quantityG": 120 }],
 *                 "estimate": { "kcal": 420, "proteinG": 35 } } ],
 *     "maintain": [], "gain": [] }
 *
 * L'import est un upsert sur le `slug` : le rejouer met les plats à jour sans
 * en créer de second exemplaire. Un plat déjà présent garde son rang ; un plat
 * nouveau, ou qui change d'objectif, se range après les autres de son
 * objectif, dans l'ordre du fichier.
 * Rien n'est supprimé : retirer un plat reste un geste explicite, en SQL.
 *
 * Les estimations écrites dans le fichier sont un point de départ ; lancer
 * ensuite `npm run verify:catalog -- --write` pour les recaler sur CIQUAL.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: '.env.local' });
config({ path: '.env' });

// Importés après le chargement des variables : la connexion se crée au premier
// appel et exige DATABASE_URL.
const { db, schema } = await import('../src/server/db/client');
const { sql } = await import('drizzle-orm');

const positiveInt = z.number().int().positive();

const ingredientSchema = z
  .object({
    label: z.string().min(1),
    searchTerm: z.string().min(1),
    quantityG: z.number().positive(),
    unitName: z.string().min(1).optional(),
    unitGrams: z.number().positive().optional(),
  })
  .strict();

const mealSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    servings: positiveInt,
    prepMinutes: positiveInt,
    steps: z.array(z.string().min(1)).min(1),
    ingredients: z.array(ingredientSchema).min(1),
    estimate: z.object({ kcal: z.number().int().nonnegative(), proteinG: z.number().int().nonnegative() }),
  })
  .strict();

const fileSchema = z
  .object({
    lose: z.array(mealSchema).default([]),
    maintain: z.array(mealSchema).default([]),
    gain: z.array(mealSchema).default([]),
  })
  .strict();

const path = process.argv[2];
if (path === undefined) {
  console.error('Usage : npm run seed:catalog -- chemin/vers/plats.json');
  process.exit(1);
}

// npm lance le script depuis apps/web : un chemin relatif s'entend depuis le
// dossier où la commande a été tapée, que npm garde dans INIT_CWD.
const file = resolve(process.env.INIT_CWD ?? process.cwd(), path);
const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
if (!parsed.success) {
  console.error(parsed.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`).join('\n'));
  process.exit(1);
}

// Un même slug sous deux objectifs ferait gagner le dernier en silence : refusé.
const seen = new Set<string>();
for (const meal of Object.values(parsed.data).flat()) {
  if (seen.has(meal.slug)) {
    console.error(`Slug en double dans le fichier : ${meal.slug}`);
    process.exit(1);
  }
  seen.add(meal.slug);
}

const existing = await db()
  .select({ slug: schema.catalogMeals.slug, goal: schema.catalogMeals.goal, position: schema.catalogMeals.position })
  .from(schema.catalogMeals);
const stored = new Map(existing.map((row) => [row.slug, row]));

let inserted = 0;
let updated = 0;

for (const [goal, meals] of Object.entries(parsed.data)) {
  let next =
    Math.max(-1, ...existing.filter((row) => row.goal === goal).map((row) => row.position)) + 1;

  for (const meal of meals) {
    const known = stored.get(meal.slug);
    // Un plat qui change d'objectif repart en fin de liste : son ancien rang
    // n'a pas de sens dans l'autre objectif.
    const keepsRank = known !== undefined && known.goal === goal;
    // `image_url` n'y figure pas, et c'est voulu : `values` sert aussi de `set`
    // à l'upsert, et un import ne doit jamais effacer une photo envoyée.
    const values = {
      goal,
      position: keepsRank ? known.position : next,
      name: meal.name,
      slot: meal.slot,
      servings: meal.servings,
      prepMinutes: meal.prepMinutes,
      steps: meal.steps,
      ingredients: meal.ingredients,
      estimateKcal: meal.estimate.kcal,
      estimateProteinG: meal.estimate.proteinG,
    };
    if (!keepsRank) {
      next += 1;
    }
    if (known === undefined) {
      inserted += 1;
    } else {
      updated += 1;
    }

    await db()
      .insert(schema.catalogMeals)
      .values({ slug: meal.slug, ...values })
      .onConflictDoUpdate({ target: schema.catalogMeals.slug, set: values });
  }
}

const counts = await db()
  .select({ goal: schema.catalogMeals.goal, n: sql<number>`count(*)::int` })
  .from(schema.catalogMeals)
  .groupBy(schema.catalogMeals.goal);

console.log(`${inserted} plats ajoutés, ${updated} mis à jour.`);
for (const row of counts) {
  console.log(`  ${row.goal} : ${row.n} plats`);
}
