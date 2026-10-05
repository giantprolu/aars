import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pglite } from './client';

/** Applique toutes les migrations du dépôt, dans l'ordre du journal de drizzle-kit. */
export async function migrate(): Promise<void> {
  const folder = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  for (const entry of journal.entries) {
    const statements = readFileSync(join(folder, `${entry.tag}.sql`), 'utf8').split('--> statement-breakpoint');
    for (const statement of statements) {
      if (statement.trim() !== '') {
        await pglite.exec(statement);
      }
    }
  }
}
