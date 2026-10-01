import { todayInParis } from '@/lib/date';
import { requireUserId } from '@/server/guard';
import { LogImport } from './LogImport';

export const dynamic = 'force-dynamic';

/**
 * Saisie d'une séance déjà faite.
 *
 * Composant serveur, aucun import client (AD-10). Rien n'est lu en base ici :
 * l'analyse du texte est une route à part, appelée à la demande, et charger le
 * catalogue à l'ouverture de l'écran retarderait l'affichage d'un champ de
 * saisie vide.
 */
export default async function TrainingImportPage() {
  await requireUserId();
  return <LogImport today={todayInParis()} />;
}
