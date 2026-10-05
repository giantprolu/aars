# Publication sur Google Play

Ce qui est prêt dans le dépôt, et ce qui reste à faire dans la Play Console.
Les réponses ci-dessous décrivent ce que le code fait réellement : si une
donnée ou un sous-traitant change, mettre à jour ce fichier **et**
`apps/web/src/app/legal/privacy/page.tsx` dans le même commit.

## Prêt dans le dépôt

| Exigence | Où |
|---|---|
| `targetSdk` 36, `compileSdk` 37, bord à bord | `app/build.gradle.kts`, `MainActivity` |
| Bundle signé par la clé d'envoi, hors dépôt | `signingConfigs.upload`, `keystore.properties` |
| `versionCode` croissant | `-Paars.versionCode=N` |
| Minification et réduction des ressources | `isMinifyEnabled`, `isShrinkResources` |
| Aucune sauvegarde des données de l'app | `allowBackup=false`, `data_extraction_rules.xml` |
| HTTP en clair interdit en release | config réseau en debug seulement |
| Suppression du compte dans l'app | Moi › Compte et données |
| Suppression du compte sans l'app | `https://nutri-rosy-one.vercel.app/legal/account-deletion` |
| Politique de confidentialité publique | `https://nutri-rosy-one.vercel.app/legal/privacy` |
| Health Connect : permissions, écran d'explication | `AndroidManifest.xml`, `HealthRationaleActivity` |
| Icône 512 et bannière 1024 × 500 | `store/` |

## Construire le bundle

1. Une fois, créer la clé d'envoi (à garder hors du dépôt, avec une copie de
   sauvegarde : la perdre oblige à une procédure de réinitialisation auprès de
   Google) :

   ```
   keytool -genkeypair -v -keystore aars-upload.jks -alias upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. `apps/android/keystore.properties` (ignoré par git) :

   ```
   storeFile=../aars-upload.jks
   storePassword=…
   keyAlias=upload
   keyPassword=…
   ```

   En CI : `NUTRI_UPLOAD_STORE_FILE`, `NUTRI_UPLOAD_STORE_PASSWORD`,
   `NUTRI_UPLOAD_KEY_ALIAS`, `NUTRI_UPLOAD_KEY_PASSWORD`.

3. Android Studio › *Build* › *Generate Signed App Bundle*, ou :

   ```
   ./gradlew :app:bundleRelease -Paars.versionCode=1 -Paars.versionName=1.0.0
   ```

   Le bundle sort dans `app/build/outputs/bundle/release/app-release.aab`.

4. Avant d'envoyer : installer la release sur un vrai téléphone
   (`./gradlew :app:installRelease`) et dérouler connexion, + Repas, scanner,
   séance, Santé. La minification ne pardonne pas une classe sérialisée oubliée.

## Play Console, dans l'ordre

1. **Créer l'app** : nom « Aars », langue par défaut français, App,
   Gratuite. Activer la signature d'apps par Google Play (proposée par défaut).
2. **Compte personnel récent** : Google exige un test fermé avec au moins
   12 testeurs pendant 14 jours avant d'ouvrir la production. Prévoir cette
   attente : piste *Test fermé*, liste de testeurs par adresses Gmail.
3. **Contenu de l'app** (menu *Règles et programmes*) : voir les sections
   ci-dessous.
4. **Fiche principale** : textes ci-dessous, `store/icon-512.png`,
   `store/feature-graphic-1024x500.png`, et au moins deux captures de
   téléphone (1080 × 1920 conseillé) prises sur l'émulateur : Aujourd'hui,
   Cuisine, Sport, Communauté.

## Fiche

**Titre** (30 car.) : `Aars`

**Description courte** (80 car.) :
`Journal alimentaire, cible calorique, séances de sport et liste de courses.`

**Description complète** :

```
Aars tient ton journal alimentaire et calcule ta cible calorique à partir de ton profil, de ton objectif et de ta dépense réelle.

• Aujourd'hui : calories et macros du jour, repas dépliables, pesée en un geste.
• Ajouter un repas : recherche dans la table CIQUAL et Open Food Facts, scanner de code-barres, repas récents et favoris.
• Cuisine : plan de la semaine midi et soir, recettes dont les parts suivent ta cible, liste de courses générée et cochable au scanner.
• Sport : programme de la semaine, séance en cours plein écran, records et progression.
• Communauté : suis tes amis, partage tes séances, classement de la semaine.
• Santé : avec ton accord, l'app lit ta dépense active dans Health Connect pour ajuster ta cible.

Tes données restent les tiennes : export à tout moment, suppression du compte depuis l'app.
```

**Catégorie** : Santé et remise en forme. **Adresse de contact** : obligatoire,
la même que `LEGAL_CONTACT_EMAIL` côté serveur.

## Contenu de l'app

- **Politique de confidentialité** : `https://nutri-rosy-one.vercel.app/legal/privacy`
- **Accès à l'app** : la connexion est requise. Fournir un compte de test
  (adresse et mot de passe) avec un profil déjà rempli, sinon l'examen échoue.
- **Annonces** : non.
- **Classification du contenu** : questionnaire IARC, pas de violence. Répondre
  oui à « achats numériques » (l'abonnement) et à « partage de contenu entre
  utilisateurs » (la Communauté). Google demande, pour ce contenu, de quoi
  signaler et bloquer depuis l'app : « … » sur une séance du fil ou une
  personne (Signaler, Bloquer), Communauté › Personnes › Bloqués pour
  débloquer, et `npm run moderation` côté équipe.
- **Public cible** : 16 ans et plus (aligné sur la politique). Pas destinée
  aux enfants.
- **Applications de santé** (déclaration obligatoire depuis 2025) : cocher
  « Nutrition et alimentation » et « Activité physique et remise en forme ».
  Pas d'appareil médical.
- **Suppression des données** : URL `https://nutri-rosy-one.vercel.app/legal/account-deletion`,
  suppression depuis l'app : oui.
- **Health Connect** : formulaire de déclaration des types de données, voir
  ci-dessous. Sans validation de Google, les permissions ne sont pas
  accordées en production.
- **Pays** : France (et autres pays francophones au choix).

### Sécurité des données

Collecte : oui. Chiffrement en transit : oui. Suppression à la demande : oui.
Aucune donnée partagée avec un tiers au sens de Google (les sous-traitants
agissant pour notre compte ne comptent pas comme un partage).

| Catégorie Google | Type | Collectée | Obligatoire | Finalité |
|---|---|---|---|---|
| Infos personnelles | Adresse e-mail | Oui | Oui | Gestion du compte |
| Infos personnelles | Nom (pseudonyme, nom affiché) | Oui | Non | Fonctionnalités de l'app (Communauté) |
| Infos personnelles | Autres (date de naissance, sexe) | Oui | Oui | Fonctionnalités de l'app (cible calorique) |
| Santé et remise en forme | Informations sur la santé (poids, taille, masse grasse, repas) | Oui | Oui | Fonctionnalités de l'app |
| Santé et remise en forme | Informations sur la remise en forme (séances, énergie active) | Oui | Non | Fonctionnalités de l'app |
| Activité dans l'app | Autre contenu généré (recettes, listes de courses, signalements et leur note) | Oui | Non | Fonctionnalités de l'app, sécurité et conformité (modération) |
| Activité dans l'app | Interactions avec l'appli (compteurs par jour : ouvertures, repas ajoutés et leur moyen de saisie, limites gratuites atteintes) | Oui | Oui | Analyses |
| Infos financières | Historique des achats (offre, état, échéance de l'abonnement ou de l'achat unique Cuisine+) | Oui | Non | Fonctionnalités de l'app, gestion du compte |

Photos : l'app Android n'envoie pas encore de photo d'assiette (le scanner
lit le code-barres sur le téléphone, sans rien envoyer). Le jour où
`/api/recognize` y sera branché, ajouter « Photos, traitées de façon
éphémère, facultatives ».

Non collectés : position, contacts, identifiants publicitaires, données
de paiement (carte, facturation : elles restent chez Google Play), historique de navigation, fichiers audio, journaux de plantage
(aucun SDK d'analyse ni de crash n'est embarqué : la mesure d'usage est
comptée par notre serveur, dans notre base, et effacée après treize mois).

### Health Connect

Formulaire *Health Connect* de la Play Console :

| Permission | Justification à saisir |
|---|---|
| `READ_ACTIVE_CALORIES_BURNED` | Ajuster la cible calorique quotidienne à l'énergie active réellement dépensée, au lieu d'un niveau d'activité déclaré. Seul un total par jour est envoyé à notre serveur. |
| `READ_TOTAL_CALORIES_BURNED` | Même usage, pour les sources qui n'écrivent que la dépense totale : l'énergie active en est déduite en retirant le métabolisme de base. |
| `READ_BASAL_METABOLIC_RATE` | Retirer le métabolisme de base de la dépense totale, pour obtenir l'énergie active quand la source ne la fournit pas. |

Ni écriture, ni lecture en arrière-plan, ni lecture de l'historique au-delà
de 30 jours. L'écran d'explication (`HealthRationaleActivity`) répond aux
deux intentions exigées (`ACTION_SHOW_PERMISSIONS_RATIONALE`,
`VIEW_PERMISSION_USAGE`).

## Abonnement (freemium)

Le serveur décide seul de qui est abonné : l'app envoie le jeton d'achat à
`POST /api/billing/google` (avec `productId` pour un achat unique), le serveur
le fait lire à Google, puis confirme l'achat (sans confirmation sous trois
jours, Google rembourse). Gratuit pour toujours : le journal, l'export et la
suppression du compte.

Deux façons de payer (décision du 05/10/2026), les mêmes que sur iPhone :

- l'abonnement mensuel `aars_premium`, qui ouvre tout : recettes et
  favoris au-delà de 10, et Cuisine+ ;
- l'achat unique `aars_cuisine_plus` (produit intégré, non
  consommable) : le plan automatique de la semaine (« Remplir la semaine »)
  et l'import de recette depuis un lien, à vie. En vente
  (`KITCHEN_PLUS_ON_SALE`, `apps/web/src/lib/premium.ts`) : l'offre s'affiche
  dès que le produit existe dans la Play Console.

L'écran d'achat (Moi › Abonnement, ou toute limite gratuite atteinte) passe
par Google Play Billing 9 (`data/Purchases.kt`) : l'achat porte l'`accountRef`
du compte (`setObfuscatedAccountId`), l'app n'en confirme aucun elle-même, et
rattache au démarrage ce qui serait resté non confirmé. Les notifications
Pub/Sub relisent aussi les achats uniques (`oneTimeProductNotification`).

L'import de recette fait lire au serveur la page dont on donne le lien ;
l'adresse n'est pas conservée et rien n'est enregistré avant validation dans
l'éditeur : rien à déclarer de plus dans la Sécurité des données.

1. **Profil de paiement** : Play Console › *Paramètres* › *Profil de
   paiement*, avec le SIRET. Sans lui, aucun produit payant ne se crée.
2. **Produits** : *Monétiser* › *Abonnements* › créer `aars_premium`,
   avec un forfait de base mensuel (l'app prend l'offre de base, sans offre
   promotionnelle). L'essai gratuit se règle ici, comme offre sur le forfait,
   sans rien changer au code. Puis *Monétiser* › *Produits intégrés* › créer
   `aars_cuisine_plus`, achat unique, avec son prix.
3. **Compte de service** : Google Cloud › *IAM* › *Comptes de service*, en
   créer un et télécharger sa clé JSON. Play Console › *Utilisateurs et
   autorisations* › l'inviter avec les droits « Afficher les données
   financières » et « Gérer les commandes et les abonnements ». Activer l'API
   *Google Play Android Developer* sur le projet Cloud.
4. **Notifications** : Google Cloud › *Pub/Sub*, créer un sujet, donner le rôle
   *Éditeur Pub/Sub* à `google-play-developer-notifications@system.gserviceaccount.com`,
   puis un abonnement *push* vers
   `https://nutri-rosy-one.vercel.app/api/billing/google/notify?secret=<GOOGLE_PLAY_RTDN_SECRET>`.
   Play Console › *Monétiser* › *Configuration de la monétisation* : nommer le
   sujet, puis *Envoyer une notification de test*.
5. **Vercel** : `GOOGLE_PLAY_SERVICE_ACCOUNT` (la clé JSON entière, sur une
   ligne), `GOOGLE_PLAY_RTDN_SECRET` (32 caractères aléatoires, le même que
   dans l'URL), et `GOOGLE_PLAY_PACKAGE_NAME` si le paquet n'est pas
   `fr.aars.app`. Puis `npm run db:migrate` pour la table
   `store_subscriptions`.
6. **Testeurs de licence** : Play Console › *Paramètres* › *Test de licence*,
   ajouter ses adresses Gmail. Leurs achats sont gratuits et les abonnements
   s'y renouvellent en quelques minutes, ce qui permet de tester l'expiration.
