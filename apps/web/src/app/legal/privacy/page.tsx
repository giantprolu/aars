import type { Metadata } from 'next';
import { env } from '@/server/env';
import { Contact, LegalPage } from '../LegalPage';

export const metadata: Metadata = { title: 'Confidentialité · Aars' };

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
    <LegalPage title="Politique de confidentialité" updated="5 octobre 2026">
      <p>
        Aars est un journal alimentaire et sportif. Cette page dit quelles données
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
        <li>Photos de recettes : l&apos;équipe peut ajouter une photo à une recette que tu as écrite ou importée, pour qu&apos;elle ait une image comme celles du catalogue. Elle voit alors le nom du plat et ses ingrédients, jamais à qui il appartient. La photo est rangée chez Vercel (Blob) et s&apos;efface avec la recette.</li>
        <li>Sport : programmes, séances, séries, charges et répétitions.</li>
        <li>Activité physique : l&apos;énergie active dépensée par jour (kilocalories), lue avec ton accord dans Health Connect sur Android ou dans Santé sur iPhone, ou envoyée par un raccourci iOS.</li>
        <li>Communauté : pseudonyme, nom affiché, abonnements, les séances que tu choisis de partager, les comptes que tu bloques et les signalements que tu fais (motif, note facultative). Un signalement est lu par l&apos;équipe qui modère, qui peut rendre une séance privée ou supprimer un compte qui enfreint les règles ; la personne signalée ne sait pas qui l&apos;a signalée. Voir aussi « Modération de la Communauté ».</li>
        <li>Notifications : l&apos;adresse d&apos;abonnement du navigateur si tu actives le rappel du déjeuner sur le web. Sur Android et iPhone, le rappel est programmé sur le téléphone : rien n&apos;est envoyé au serveur ni conservé par lui.</li>
        <li>Mesure d&apos;usage : pour chaque jour, combien de fois tu as ouvert l&apos;accueil, ajouté un repas (et par quel moyen : recherche, scan, favori…), enregistré ton profil, synchronisé ta dépense ou atteint une limite de la version gratuite. Rien sur ce que tu manges. Ces compteurs servent seulement à savoir ce qui est utilisé et ce qui ne l&apos;est pas, restent dans notre base (aucun outil d&apos;analyse externe), et sont effacés au bout de treize mois.</li>
        <li>Abonnement et achats, si tu en fais : l&apos;offre choisie (abonnement mensuel ou achat unique), son état, sa date d&apos;échéance et la référence d&apos;achat de Google Play ou de l&apos;App Store. Aucune donnée de paiement : la carte et l&apos;adresse de facturation restent chez Google ou chez Apple.</li>
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

      <h2>Import de recette</h2>
      <p>
        Avec Cuisine+, tu peux importer une recette depuis un lien. Notre serveur lit alors la
        page à cette adresse, comme le ferait un navigateur, pour en tirer le nom, les ingrédients
        et les étapes : le site voit une visite de notre serveur, pas la tienne. L&apos;adresse
        n&apos;est pas conservée, et la recette n&apos;est enregistrée que si tu la valides dans
        l&apos;éditeur, comme une recette écrite à la main.
      </p>

      <h2>Modération de la Communauté</h2>
      <p>
        Les textes que les autres peuvent voir — ton pseudonyme, ton nom affiché, le nom d&apos;une
        séance que tu partages et le nom d&apos;un exercice que tu ajoutes en important une séance
        — sont vérifiés automatiquement au moment où ils deviennent visibles, pour écarter
        insultes, propos haineux, menaces, contenus sexuels, arnaques et publicité. La vérification
        se fait sur notre serveur, avec des règles et des listes de mots : aucune intelligence
        artificielle, aucun service tiers. Ton journal, tes pesées, tes repas et tes séances privées
        ne sont jamais examinés.
      </p>
      <p>
        Un texte refusé n&apos;est pas affiché, et l&apos;équipe peut le revoir. Nous conservons
        alors un dossier : le texte en cause, ce qui a été détecté, la décision et les
        signalements qui s&apos;y rapportent. Les sanctions ne portent que sur la Communauté
        (partage, demandes de suivi, bravos, visibilité) : ton journal et tes données restent
        accessibles et exportables. Une suspension ou une exclusion de la Communauté est
        toujours décidée par une personne de l&apos;équipe, jamais par l&apos;automatisme seul.
        Tu peux contester une décision en écrivant à <Contact email={contact} />.
      </p>
      <p>
        Pour freiner les créations de comptes en série, le serveur compte les inscriptions par
        connexion à partir d&apos;une empreinte de l&apos;adresse IP (un condensat chiffré qui ne
        permet pas de la retrouver), effacée sous deux jours. L&apos;adresse elle-même n&apos;est
        pas conservée.
      </p>
      <p>
        Durées : le texte d&apos;un dossier est effacé six mois après sa clôture, le dossier
        deux ans après, un signalement clos un an après. Un journal des décisions, réduit à des
        numéros (jamais de texte), est gardé deux ans pour pouvoir rendre compte de chaque
        décision, y compris après la suppression d&apos;un compte.
      </p>

      <h2>Sous-traitants</h2>
      <ul>
        <li>Vercel (hébergement de l&apos;application et de l&apos;API).</li>
        <li>Neon (base de données Postgres).</li>
        <li>Mistral AI ou Google (reconnaissance d&apos;une photo d&apos;assiette, seulement quand tu en envoies une).</li>
        <li>Resend (envoi du courriel de réinitialisation du mot de passe, si tu le demandes, et de l&apos;alerte qui prévient l&apos;équipe d&apos;un signalement : identifiants publics, motif et note, jamais d&apos;adresse).</li>
        <li>Google (Google Play encaisse l&apos;abonnement et les achats sur Android ; le serveur lui demande l&apos;état d&apos;un achat à partir de son jeton, avec un identifiant de compte opaque qui ne contient ni ton adresse ni ton nom).</li>
        <li>Apple (l&apos;App Store encaisse l&apos;abonnement et les achats sur iPhone ; le serveur lui demande l&apos;état d&apos;un achat à partir de sa référence, avec un identifiant de compte opaque, sans ton adresse ni ton nom).</li>
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
        suppression efface immédiatement et définitivement toutes les données listées ici, à
        l&apos;exception du journal des décisions de modération, réduit à des numéros. Voir
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
