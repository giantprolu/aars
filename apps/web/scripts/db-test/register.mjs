// Redirige `../client` (importé par les requêtes de l'app) vers le client PGlite du banc.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const testClient = pathToFileURL(join(here, 'client.ts')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    // tsx réécrit l'import avec son extension : « ../client » arrive en « ../client.ts ».
    if ((specifier === '../client' || specifier === '../client.ts') && context.parentURL?.includes('/src/server/db/queries/')) {
      return nextResolve(testClient, context);
    }
    return nextResolve(specifier, context);
  },
});
