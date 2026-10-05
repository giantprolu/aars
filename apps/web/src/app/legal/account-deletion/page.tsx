import type { Metadata } from 'next';
import { env } from '@/server/env';
import { Contact, LegalPage } from '../LegalPage';

export const metadata: Metadata = { title: 'Supprimer son compte · Aars' };

/**
 * Page publique de suppression du compte, exigée par Google Play pour toute
 * application qui permet d'en créer un. Elle doit être lisible sans session
 * ni installation de l'app.
 */
export default function AccountDeletionPage() {
  const contact = env.legalContactEmail;
  return (
    <LegalPage title="Supprimer ton compte Aars" updated="1er octobre 2026">
      <h2>Depuis l&apos;application Android</h2>
      <ul>
        <li>Touche ton avatar en haut à droite, puis l&apos;engrenage.</li>
        <li>Ouvre « Compte et données » et touche « Supprimer mon compte ».</li>
        <li>Confirme avec ton mot de passe.</li>
      </ul>

      <h2>Depuis le site</h2>
      <ul>
        <li>Connecte-toi sur <a href="/unlock">la page de connexion</a>.</li>
        <li>Ouvre Moi, puis Réglages, puis « Supprimer mon compte », et confirme avec ton mot de passe.</li>
      </ul>

      <h2>Sans accès à ton compte</h2>
      <p>
        Si tu as perdu ton mot de passe, récupère-le d&apos;abord avec ton code de secours sur{' '}
        <a href="/recover">la page de récupération</a>. Sinon, écris-nous depuis l&apos;adresse du
        compte : <Contact email={contact} />. La demande est traitée sous trente jours.
      </p>

      <h2>Ce qui est effacé</h2>
      <p>
        Tout, immédiatement et définitivement : compte, profil corporel, journal, pesées,
        séances, recettes, listes de courses, activité reçue de Health Connect, identité et
        abonnements de la Communauté. Rien n&apos;est conservé après la suppression, à
        l&apos;exception des journaux techniques de l&apos;hébergeur, effacés sous trente jours.
        Pense à exporter tes données avant si tu veux les garder.
      </p>
    </LegalPage>
  );
}
