/**
 * Copie le wasm du lecteur zxing dans public/, d'où le navigateur le charge.
 * Le laisser dans node_modules obligerait à le servir par un import bundlé,
 * ce que Next ne fait pas pour un .wasm chargé dynamiquement par Emscripten.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Le paquet expose le wasm par un sous-chemin dedie : c'est le seul point
// d'entree stable, package.json n'etant pas exporte.
const require = createRequire(import.meta.url);
const source = require.resolve('zxing-wasm/reader/zxing_reader.wasm');

const targetDir = join(process.cwd(), 'public', 'zxing');
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, 'zxing_reader.wasm'));
console.log('zxing_reader.wasm copie dans public/zxing/');
