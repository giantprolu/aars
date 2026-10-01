/**
 * Récupère les illustrations des exercices depuis `free-exercise-db`.
 *
 *   npm run images:exercises            télécharge ce qui manque
 *   npm run images:exercises -- --force retélécharge tout
 *
 * Le jeu de données est en domaine public (Unlicense) :
 * https://github.com/yuhonas/free-exercise-db
 *
 * Deux images par exercice, début et fin du mouvement. Alternées à l'écran,
 * elles suffisent à reconnaître un exercice dont on ne connaît que le nom, ce
 * qui est exactement le besoin : « chest press » ne dit rien tant qu'on n'a
 * pas vu la machine.
 *
 * Les fichiers obtenus sont versionnés, contrairement au WASM du scanner que
 * `prebuild` recopie depuis `node_modules`. La raison est qu'ils viennent du
 * réseau : faire dépendre chaque déploiement Vercel de la disponibilité de
 * GitHub échangerait quelques mégaoctets de dépôt contre une panne de
 * construction possible, ce qui est un mauvais marché. Ce script ne tourne
 * donc qu'à la main, quand le catalogue s'enrichit.
 *
 * La correspondance vit dans `src/lib/exercise-media.ts` et non ici :
 * l'application doit savoir quels exercices ont une illustration, et deux
 * listes finiraient par diverger.
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ILLUSTRATION_SOURCES } from '../src/lib/exercise-media';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'exercices');
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

const force = process.argv.includes('--force');

/** Largeur retenue : le double d'une feuille modale sur un écran de 400 px. */
const WIDTH = 700;

/**
 * Réduit l'image si `sharp` est là, la garde telle quelle sinon.
 *
 * `sharp` arrive avec Next et n'est pas déclaré en dépendance directe : le
 * script ne doit donc pas en dépendre pour fonctionner. Sans lui les fichiers
 * pèsent le double, ce qui se voit dans le dépôt et pas à l'écran — un défaut
 * acceptable, contrairement à un script qui refuse de tourner.
 */
async function shrink(buffer: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(buffer)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch {
    return buffer;
  }
}

mkdirSync(OUT, { recursive: true });

let written = 0;
let skipped = 0;
const failed: string[] = [];

for (const [slug, id] of Object.entries(ILLUSTRATION_SOURCES)) {
  mkdirSync(join(OUT, slug), { recursive: true });

  for (const frame of [0, 1]) {
    const target = join(OUT, slug, `${frame}.jpg`);
    if (!force && existsSync(target)) {
      skipped += 1;
      continue;
    }

    try {
      const response = await fetch(`${BASE}/${id}/${frame}.jpg`);
      if (!response.ok) {
        failed.push(`${slug} (${frame}) : HTTP ${response.status}`);
        continue;
      }
      writeFileSync(target, await shrink(Buffer.from(await response.arrayBuffer())));
      written += 1;
    } catch (error) {
      failed.push(`${slug} (${frame}) : ${String(error)}`);
    }
  }
}

console.log(`${written} image(s) écrite(s), ${skipped} déjà présente(s).`);
if (failed.length > 0) {
  console.error(`${failed.length} échec(s) :\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
