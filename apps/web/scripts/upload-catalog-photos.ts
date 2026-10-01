/**
 * Envoi des photos du catalogue dans Vercel Blob.
 *
 *   npm run upload:photos -w @nutri/web -- chemin/vers/dossier
 *
 * Le dossier contient une image par plat, nommée d'après son slug :
 * `lose-avoine-fruits-rouges.png` (ou .jpg, .jpeg, .webp). Chaque image est
 * ramenée à 1200 px de côté au plus et convertie en WebP avant l'envoi : c'est
 * ce fichier, déjà à la bonne taille, que l'app affiche tel quel, sans passer
 * par l'optimiseur d'images de Vercel, facturé au-delà de son quota gratuit.
 *
 * Chaque envoi reçoit une URL neuve, et l'ancienne photo du plat est supprimée.
 * Écraser le même chemin laisserait le CDN servir l'ancienne image pendant des
 * jours ; changer d'URL rend le remplacement immédiat. Rejouer le script sur
 * le même dossier est donc sans danger.
 *
 * Exige BLOB_READ_WRITE_TOKEN (dans `.env.local`), qui ne sert qu'ici : l'app
 * ne fait que lire des URL publiques.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const { del, put } = await import('@vercel/blob');
const { default: sharp } = await import('sharp');
const { db, schema } = await import('../src/server/db/client');
const { eq } = await import('drizzle-orm');

const MAX_SIDE = 1200;
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN manque dans .env.local.');
  process.exit(1);
}

const argument = process.argv[2];
if (argument === undefined) {
  console.error('Usage : npm run upload:photos -w @nutri/web -- chemin/vers/dossier');
  process.exit(1);
}

// npm lance le script depuis apps/web : un chemin relatif s'entend depuis le
// dossier où la commande a été tapée, que npm garde dans INIT_CWD.
const folder = resolve(process.env.INIT_CWD ?? process.cwd(), argument);

const meals = await db()
  .select({ slug: schema.catalogMeals.slug, imageUrl: schema.catalogMeals.imageUrl })
  .from(schema.catalogMeals);
const current = new Map(meals.map((meal) => [meal.slug, meal.imageUrl]));

const files = readdirSync(folder).filter((name) => EXTENSIONS.has(extname(name).toLowerCase()));
const unknown: string[] = [];
const duplicates: string[] = [];
const failed: string[] = [];
const done = new Set<string>();

for (const name of files) {
  const slug = name.slice(0, -extname(name).length);
  if (!current.has(slug)) {
    unknown.push(name);
    continue;
  }
  // Deux fichiers pour un même plat : le premier gagne, le second est signalé
  // plutôt que d'envoyer deux photos dont une resterait orpheline.
  if (done.has(slug)) {
    duplicates.push(name);
    continue;
  }

  // Un fichier illisible ou une coupure réseau n'arrête pas les autres : le
  // plat garde sa photo précédente, et l'échec est dit à la fin.
  try {
    const webp = await sharp(readFileSync(join(folder, name)))
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const blob = await put(`catalog/${slug}.webp`, webp, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/webp',
    });

    try {
      await db()
        .update(schema.catalogMeals)
        .set({ imageUrl: blob.url })
        .where(eq(schema.catalogMeals.slug, slug));
    } catch (error) {
      // La base n'a pas suivi : la photo neuve ne servirait à personne.
      await del(blob.url);
      throw error;
    }

    // L'ancienne photo ne part qu'une fois la nouvelle en place : en cas
    // d'échec entre les deux, le plat garde une image valide.
    const previous = current.get(slug);
    if (previous) {
      await del(previous).catch(() => console.warn(`  ancienne photo non supprimée : ${previous}`));
    }

    done.add(slug);
    console.log(`  ${slug}  ${Math.round(webp.length / 1024)} Ko`);
  } catch (error) {
    failed.push(`${name} (${error instanceof Error ? error.message : String(error)})`);
  }
}

console.log(`\n${done.size} photos envoyées.`);
if (unknown.length > 0) {
  console.log(`Ignorées, aucun plat ne porte ce nom : ${unknown.join(', ')}`);
}
if (duplicates.length > 0) {
  console.log(`Ignorées, plat déjà servi par un autre fichier : ${duplicates.join(', ')}`);
}
if (failed.length > 0) {
  console.log(`Échecs :\n  ${failed.join('\n  ')}`);
}
const missing = meals.filter((meal) => meal.imageUrl === null && !done.has(meal.slug));
if (missing.length > 0) {
  console.log(`${missing.length} plats encore sans photo.`);
}
process.exit(failed.length > 0 ? 1 : 0);
