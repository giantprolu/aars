import 'server-only';

/**
 * Journaux structurés de la modération, une ligne JSON par événement, lus
 * dans Vercel › Logs. Ils disent ce qui a été décidé et en combien de temps,
 * jamais sur quoi : ni texte, ni pseudo, ni note. Les numéros de dossier
 * suffisent à retrouver le reste dans le tableau de bord.
 */
export function logModeration(
  event: string,
  fields: Record<string, string | number | boolean | null | readonly string[]>,
): void {
  console.info(JSON.stringify({ scope: 'moderation', event, ...fields }));
}
