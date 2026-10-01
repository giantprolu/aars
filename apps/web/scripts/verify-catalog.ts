/**
 * Vérification du catalogue de repas contre CIQUAL.
 *
 * Le catalogue décrit ses ingrédients par un terme de recherche et non par un
 * code, pour que les changements de millésime de l'ANSES ne le figent pas
 * (voir `src/lib/meal-catalog.ts`). Le prix de ce choix est qu'un terme peut
 * cesser de résoudre sans que rien ne le dise : le plat s'installerait alors
 * amputé d'un ingrédient, et son total serait silencieusement trop bas.
 *
 * Ce script résout chaque terme distinct du catalogue et rend compte :
 *   - des termes qui ne trouvent plus rien,
 *   - de la fiche que chaque terme ramène, pour qu'on puisse la relire,
 *   - des estimations par part qui ont dérivé de ce que CIQUAL dit aujourd'hui.
 *
 *   npm run verify:catalog            vérifie et rend compte
 *   npm run verify:catalog -- --write réécrit les estimations en base
 *
 * Le code de sortie vaut 1 si un terme ne résout pas : c'est la seule
 * anomalie qui rend un plat faux plutôt qu'imprécis.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

// Importés après le chargement des variables : la connexion se crée au premier
// appel et exige DATABASE_URL, que `.env.local` vient tout juste de poser.
const { searchReferenceFoods } = await import('../src/server/db/queries/search');
const { allCatalogMealsWithGoal } = await import('../src/server/db/queries/catalog');
const { db, schema } = await import('../src/server/db/client');
const { eq } = await import('drizzle-orm');
const { scaleMacros, sumMacros } = await import('../src/lib/nutrition');
import type { Macros } from '../src/lib/types';
import type { CatalogMeal } from '../src/lib/meal-catalog';

/** Écart relatif toléré entre l'estimation écrite et le calcul du jour. */
const TOLERANCE = 0.05;

const write = process.argv.includes('--write');

/** Les fiches déjà résolues, pour ne pas rechercher trois fois « huile d olive ». */
const resolved = new Map<string, { name: string; per100g: Macros } | null>();

async function resolve(term: string) {
  const cached = resolved.get(term);
  if (cached !== undefined) {
    return cached;
  }
  const [best] = await searchReferenceFoods(term, 1);
  const hit = best ? { name: best.name, per100g: best.per100g } : null;
  resolved.set(term, hit);
  return hit;
}

interface MealReport {
  meal: CatalogMeal;
  missing: string[];
  kcal: number;
  proteinG: number;
}

async function inspect(meal: CatalogMeal): Promise<MealReport> {
  const missing: string[] = [];
  const parts: Macros[] = [];

  for (const ingredient of meal.ingredients) {
    const hit = await resolve(ingredient.searchTerm);
    if (hit === null) {
      missing.push(`${ingredient.label} (« ${ingredient.searchTerm} »)`);
      continue;
    }
    parts.push(scaleMacros(hit.per100g, ingredient.quantityG));
  }

  const total = sumMacros(parts);
  return {
    meal,
    missing,
    kcal: Math.round(total.kcal / meal.servings),
    proteinG: Math.round(total.proteinG / meal.servings),
  };
}

function drifted(written: number, computed: number): boolean {
  if (computed === 0) {
    return written !== 0;
  }
  return Math.abs(written - computed) / computed > TOLERANCE;
}

/** Réécrit l'estimation d'un plat en base, à partir du calcul du jour. */
async function rewrite(report: MealReport): Promise<void> {
  await db()
    .update(schema.catalogMeals)
    .set({ estimateKcal: report.kcal, estimateProteinG: report.proteinG })
    .where(eq(schema.catalogMeals.slug, report.meal.slug));
}

let missingTerms = 0;
let drifts = 0;

const catalog = await allCatalogMealsWithGoal();

// Un objectif sans plat est l'état d'une base migrée mais jamais remplie :
// l'écran de choix serait vide, et c'est une anomalie, pas un succès.
const goals = ['lose', 'maintain', 'gain'] as const;
const emptyGoals = goals.filter((goal) => !catalog.some((meal) => meal.goal === goal));
if (emptyGoals.length > 0) {
  console.error(`Aucun plat pour : ${emptyGoals.join(', ')}. Lancer npm run seed:catalog.`);
  process.exit(1);
}

for (const goal of goals) {
  const meals = catalog.filter((meal) => meal.goal === goal);
  console.log(`\n=== ${goal} — ${meals.length} plats ===`);

  const reports: MealReport[] = [];
  for (const meal of meals) {
    reports.push(await inspect(meal));
  }

  for (const report of reports) {
    const flags: string[] = [];
    if (report.missing.length > 0) {
      missingTerms += report.missing.length;
      flags.push(`INTROUVABLE: ${report.missing.join(', ')}`);
    }
    if (
      drifted(report.meal.estimate.kcal, report.kcal) ||
      drifted(report.meal.estimate.proteinG, report.proteinG)
    ) {
      drifts += 1;
      flags.push(
        `écrit ${report.meal.estimate.kcal} kcal / ${report.meal.estimate.proteinG} g P`,
      );
    }

    console.log(
      `${flags.length === 0 ? '  ' : '! '}${report.meal.slug.padEnd(38)} ` +
        `${String(report.kcal).padStart(4)} kcal ${String(report.proteinG).padStart(3)} g P` +
        (flags.length === 0 ? '' : `  ${flags.join(' | ')}`),
    );
  }

  if (write) {
    // Un plat dont un terme ne résout plus aurait un total amputé : on garde
    // son estimation écrite plutôt que d'en publier une fausse.
    const sound = reports.filter((report) => report.missing.length === 0);
    for (const report of sound) {
      await rewrite(report);
    }
    console.log(`  → ${sound.length} estimations réécrites en base.`);
  }
}

console.log(`\n${resolved.size} termes distincts, ${missingTerms} introuvables.`);
if (!write && drifts > 0) {
  console.log(`${drifts} estimations à rafraîchir : npm run verify:catalog -- --write`);
}

process.exit(missingTerms > 0 ? 1 : 0);
