import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * Configuration de drizzle-kit.
 *
 * Les variables sont chargées ici explicitement : drizzle-kit tourne hors de
 * Next, qui est le seul à lire `.env.local` tout seul. Sans cela `db:migrate`
 * échoue sur une URL vide alors que l'application, elle, démarre très bien —
 * une divergence qui se paie au moment précis où l'on migre une base.
 *
 * `.env.local` d'abord, `.env` ensuite : dotenv ne réécrit jamais une variable
 * déjà posée, donc le fichier local l'emporte, comme chez Next.
 */
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
