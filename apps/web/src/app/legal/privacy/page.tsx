import type { Metadata } from 'next';
import { env } from '@/server/env';
import { Contact, LegalPage } from '../LegalPage';

export const metadata: Metadata = { title: 'Confidentialité · NutriPerso' };

/**
 * Politique de confidentialité, publique (fiche Google Play, Health Connect).
 *
 * Elle décrit ce que le code fait réellement : toute nouvelle donnée stockée
 * ou nouveau sous-traitant doit apparaître ici dans le même commit, faute de
 * quoi la déclaration « Sécurité des données » de la fiche devient fausse.
 */
export default function PrivacyPage() {
  const contact = env.legalContactEmail;
  return (
    <LegalPage title="Politique de confidentialité" updated="4 octobre 2026">
      <p>
        NutriPerso est un journal alimentaire et sportif. Cette page dit quelles données
        l&apos;application (web, Android et iOS) conserve, pourquoi, avec qui elles sont partagées et
        comment les effacer. Certaines sont des données de santé : elles ne servent qu&apos;à te
        rendre le service, ne sont jamais vendues, jamais utilisées pour de la publicité et
        jamais cédées à des courtiers en données.
      </p>

      <h2>Données conservées</h2>
      <ul>
        <li>Compte : adresse électronique, empreinte du mot de passe (PBKDF2, jamais le mot de passe lui-même), empreinte du code de secours.</li>
        <li>Profil corporel : sexe, date de naissance, taille, poids, taux de masse grasse s&apos;il est saisi, niveau d&apos;activité et objectif, pour calculer ta cible calorique.</li>
        <li>Journal : repas, aliments, quantités, plats planifiés, recettes, liste de courses, pesées.</li>
        <li>Sport : programmes, séances, séries, charges et répétitions.</li>
        <li>Activité physique : l&apos;énergie active dépensée par jour (kilocalories), lue avec ton accord dans Health Connect sur Android ou dans Santé sur iPhone, ou envoyée par un raccourci iOS.</li>
        <li>Communauté : pseudonyme, nom affiché, abonnements, et les séances que tu choisis de partager.</li>
        <li>Notifications : l&apos;adresse d&apos;abonnement du navigateur si tu actives le rappel du déjeuner.</li>
        <li>Mesure d&apos;usage : pour chaque jour, combien de fois tu as ouvert l&apos;accueil, ajouté un repas (et par quel moyen : recherche, scan, favori…), enregistré ton profil, synchronisé ta dépense ou atteint une limite de la version gratuite. Rien sur ce que tu manges. Ces compteurs servent seulement à savoir ce qui est utilisé et ce qui ne l&apos;est pas, restent dans notre base (aucun outil d&apos;analyse externe), et sont effacés au bout de treize mois.</li>
        <li>Abonnement, si tu en prends un : l&apos;offre choisie, son état, sa date d&apos;échéance et le jeton d&apos;achat de Google Play. Aucune donnée de paiement : la carte et l&apos;adresse de facturation restent chez Google.</li>
      </ul>

      <h2>Health Connect</h2>
      <p>
        Sur Android, l&apos;application demande la lecture de trois types de données Health
        Connect : calories actives brûlées, calories totales brûlées et métabolisme de base. Elle
        n&apos;en tire qu&apos;un nombre par jour, l&apos;énergie active, sur les trente derniers
        jours au plus, qu&apos;elle envoie à notre serveur pour ajuster ta cible calorique à ta
        dépense réelle. Elle n&apos;écrit rien dans Health Connect, ne lit rien en arrière-plan, et
        ces données ne servent à aucune autre fin. L&apos;usage des informations reçues de Health
        Connect respecte la politique d&apos;utilisation des données de Health Connect, y compris
        ses exigences d&apos;usage limité. Tu peux retirer l&apos;accès à tout moment dans les
        réglages de Health Connect.
      </p>

      <h2>Santé d&apos;Apple</h2>
      <p>
        Sur iPhone, l&apos;application demande la lecture d&apos;un seul type de données de Santé
        (HealthKit) : l&apos;énergie active. Elle n&apos;en tire qu&apos;un total par jour, sur les
        trente derniers jours au plus, qu&apos;elle envoie à notre serveur pour ajuster ta cible
        calorique à ta dépense réelle. Elle n&apos;écrit rien dans Santé, ne lit rien en
        arrière-plan, et ces données ne servent à aucune autre fin : ni publicité, ni revente, ni
        partage avec des tiers. Tu peux retirer l&apos;accès à tout moment dans Réglages › Santé ›
        Accès aux données et appareils.
      </p>

      <h2>Photos et appareil photo</h2>
      <p>
        L&apos;appareil photo sert à lire un code-barres, analysé sur le téléphone. Une photo
        d&apos;assiette, si tu en envoies une, est transmise au modèle de reconnaissance pour en
        estimer le contenu, puis oubliée : elle n&apos;est pas conservée.
      </p>

      <h2>Sous-traitants</h2>
      <ul>
        <li>Vercel (hébergement de l&apos;application et de l&apos;API).</li>
        <li>Neon (base de données Postgres).</li>
        <li>Mistral AI ou Google (reconnaissance d&apos;une photo d&apos;assiette, seulement quand tu en envoies une).</li>
        <li>Resend (envoi du courriel de réinitialisation du mot de passe, si tu le demandes).</li>
        <li>Google (Google Play encaisse l&apos;abonnement ; le serveur lui demande l&apos;état d&apos;un achat à partir de son jeton, avec un identifiant de compte opaque qui ne contient ni ton adresse ni ton nom).</li>
        <li>Open Food Facts reçoit seulement le code-barres d&apos;un produit, jamais ton identité.</li>
      </ul>

      <h2>Sécurité</h2>
      <p>
        Tous les échanges sont chiffrés (HTTPS). Sur Android, le jeton de session est chiffré
        par une clé du Keystore qui ne quitte pas le téléphone. Sur iOS, il est rangé dans le
        trousseau, lisible sur cet iPhone seulement et exclu des sauvegardes. Chaque lecture en base est
        restreinte au compte connecté.
      </p>

      <h2>Durée de conservation et effacement</h2>
      <p>
        Les données sont gardées tant que le compte existe. Tu peux les exporter (format JSON)
        et supprimer ton compte depuis l&apos;application, rubrique Compte et données : la
        suppression efface immédiatement et définitivement toutes les données listées ici. Voir
        aussi <a href="/legal/account-deletion">la page de suppression du compte</a>.
      </p>

      <h2>Tes droits</h2>
      <p>
        Tu disposes d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de
        portabilité et d&apos;opposition (RGPD). Pour toute question : <Contact email={contact} />.
        Tu peux aussi saisir la CNIL.
      </p>

      <h2>Mineurs</h2>
      <p>L&apos;application ne s&apos;adresse pas aux personnes de moins de 16 ans.</p>
    </LegalPage>
  );
}
