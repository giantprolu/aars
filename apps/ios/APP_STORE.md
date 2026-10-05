# Publication sur l'App Store

Ce qui est prêt dans le dépôt, et ce qui reste à faire dans App Store Connect.
Les réponses ci-dessous décrivent ce que le code fait réellement : si une
donnée ou un sous-traitant change, mettre à jour ce fichier **et**
`apps/web/src/app/legal/privacy/page.tsx` dans le même commit, comme
`apps/android/PLAY_STORE.md`.

## Prêt dans le dépôt

| Exigence | Où |
|---|---|
| iOS 17 et plus, iPhone, portrait | `project.pbxproj` |
| Identifiant de bundle `fr.aars.app` | `project.pbxproj` |
| Version et numéro de build | `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` |
| Jeton de session dans le trousseau, ni sauvegardé ni migré | `Data/TokenStore.swift` |
| HTTPS seul, HTTP en clair vers le réseau local uniquement | `Config/Info.plist` (`NSAllowsLocalNetworking`) |
| Chiffrement standard seulement (HTTPS) | `ITSAppUsesNonExemptEncryption` à `NO` |
| Caméra : texte d'usage | `NSCameraUsageDescription` |
| HealthKit : capacité et texte d'usage, lecture seule | `Config/Aars.entitlements`, `NSHealthShareUsageDescription` |
| Suppression du compte dans l'app | Moi › Compte et données |
| Politique de confidentialité publique | `https://aars-app.vercel.app/legal/privacy` |
| Icône 1024 | `Resources/Assets.xcassets/AppIcon.appiconset` |
| Aucun SDK tiers (analyse, publicité, plantages) | aucune dépendance |

## Construire et envoyer

1. **Compte** : Apple Developer Program, au nom de la personne ou de
   l'entreprise qui publie.
2. **Signature** : dans `Config/Local.xcconfig` (non versionné),
   `DEVELOPMENT_TEAM = XXXXXXXXXX`, ou Xcode › cible › *Signing &
   Capabilities* › *Team*. La signature automatique crée l'identifiant d'app
   avec la capacité HealthKit.
3. **App Store Connect** › *Apps* › *Nouvelle app* : iOS, nom « Aars »,
   langue principale français, bundle `fr.aars.app`, SKU au choix.
4. **Archive** : Xcode › destination *Any iOS Device* › *Product* ›
   *Archive*, puis *Distribute App* › *App Store Connect*. Chaque envoi
   demande un `CURRENT_PROJECT_VERSION` plus grand que le précédent.
5. **TestFlight** avant tout : dérouler sur un vrai iPhone connexion,
   onboarding, + Repas, scanner (le simulateur n'a pas de caméra), séance,
   Cuisine, Moi › Santé (autoriser, synchroniser, vérifier la tuile Activité).
6. **Captures** : au format que demande App Store Connect pour le plus grand
   iPhone, prises sur le simulateur correspondant : Aujourd'hui, Cuisine,
   Sport, Communauté, la séance en cours.

## Fiche

**Nom** (30 car.) : `Aars`

**Sous-titre** (30 car.) : `Journal, cible calorique, sport`

**Mots-clés** (100 car.) :
`calories,macros,nutrition,régime,journal alimentaire,musculation,recettes,courses,poids,CIQUAL`

**Description** : celle de `PLAY_STORE.md`, en remplaçant la ligne Santé par
« Santé : avec ton accord, l'app lit ton énergie active dans Santé pour
ajuster ta cible. »

**Catégorie** : Santé et forme (secondaire : Forme et alimentation selon ce
que propose App Store Connect). **URL d'assistance** : obligatoire, une page
qui donne l'adresse `LEGAL_CONTACT_EMAIL`. **URL de confidentialité** :
`https://aars-app.vercel.app/legal/privacy`.

## Examen (App Review)

- **Compte de démonstration** : obligatoire, la connexion étant requise. Un
  compte dont l'onboarding est fini, avec quelques jours de journal, une
  recette et une séance.
- **Notes pour l'examen** : « HealthKit sert uniquement à lire l'énergie
  active (un total par jour, trente jours au plus) pour ajuster la cible
  calorique. Rien n'est écrit dans Santé, rien n'est lu en arrière-plan, ces
  données ne servent ni à la publicité ni à des tiers. Accès depuis
  Moi › Santé. Suppression du compte : Moi › Compte et données.
  Communauté : on ne voit que les personnes qu'on suit, avec leur accord.
  « … » sur une séance du fil ou une personne permet de la signaler ou de la
  bloquer ; les signalements sont traités sous 24 heures. Les textes publics
  (identifiant, nom affiché, nom de séance partagée) sont filtrés
  automatiquement par des règles locales.
  Abonnement : Moi › Abonnement, ou dès qu'on dépasse 10 recettes ou
  10 favoris. »
- **Classification par âge** : répondre au questionnaire. Contenu généré par
  les utilisateurs : oui (Communauté : noms de séances et identifiants vus par
  les abonnés acceptés). Viser au moins 16 ans, comme la politique.

## Confidentialité de l'app (étiquettes)

Suivi (tracking) : **non**. Aucune donnée n'est utilisée pour de la publicité
ni croisée avec des données d'autres entreprises. Toutes les données ci-dessous
sont **liées à l'identité** de l'utilisateur, faute de quoi le service ne
marche pas.

| Catégorie Apple | Type | Ce que c'est | Finalité |
|---|---|---|---|
| Coordonnées | Adresse e-mail | identifiant de connexion | Fonctionnalités de l'app |
| Coordonnées | Nom | nom affiché, facultatif | Fonctionnalités de l'app |
| Identifiants | Identifiant utilisateur | pseudonyme (`@identifiant`) | Fonctionnalités de l'app |
| Santé et forme | Santé | poids, taille, masse grasse, repas, énergie active lue dans Santé | Fonctionnalités de l'app |
| Santé et forme | Forme | séances, séries, charges | Fonctionnalités de l'app |
| Contenu utilisateur | Autre contenu | recettes, plans, listes de courses, signalements et leur note, dossiers de modération sur les textes publics | Fonctionnalités de l'app |
| Autres données | Autres types de données | empreinte (HMAC) de l'adresse IP à l'inscription, effacée sous deux jours | Fonctionnalités de l'app (sécurité, prévention des abus) |
| Données d'utilisation | Interactions avec le produit | compteurs par jour (ouvertures, repas ajoutés et leur moyen, limites atteintes), effacés après treize mois | Analyses |
| Autres données | Autres types de données | date de naissance, sexe (calcul de la cible) | Fonctionnalités de l'app |
| Achats | Historique des achats | abonnement ou Cuisine+ : offre, état, échéance | Fonctionnalités de l'app |

Non collectés : position, contacts, historique de recherche ou de navigation
(une recherche d'aliment n'est pas conservée), photos (le scanner lit le
code-barres sur le téléphone et n'envoie que le nombre), informations de
paiement (elles restent chez Apple), diagnostics et plantages, identifiants
publicitaires.

## Achat intégré

Deux façons de payer (décision du 05/10/2026), les mêmes que sur Android :

| Produit | Type App Store | Ce qu'il ouvre |
|---|---|---|
| `aars_premium_mensuel` | abonnement renouvelable, 1 mois, groupe « Aars Premium » | tout : recettes et favoris au-delà de 10, et Cuisine+ |
| `aars_cuisine_plus` | non consommable | le plan automatique de la semaine et l'import de recette, à vie |

Cuisine+ est en vente (`KITCHEN_PLUS_ON_SALE`, `apps/web/src/lib/premium.ts`) :
l'offre s'affiche dès que le produit existe dans App Store Connect. Ses deux
fonctions sont dans Cuisine : « Remplir la semaine » sur le Plan, « Importer »
dans Recettes. Pour l'examen, la capture de Cuisine+ montre le Plan rempli.
Les prix se règlent dans App Store Connect, pas dans le code.

**Vente fermée pour l'instant** (`SALES_OPEN = false`, même fichier,
décision du 05/10/2026) : tant que l'éditeur n'est pas immatriculé, l'app ne
montre ni Abonnement ni offre, et tout ce que les achats ouvrent l'est pour
tous, sans limite gratuite. Passer la valeur à `true` et déployer rouvre la
vente, rien d'autre à changer.

Comment ça marche : l'app achète avec StoreKit 2 en passant
l'`appAccountToken` du compte, envoie l'identifiant de transaction à
`POST /api/billing/apple`, et ne termine la transaction qu'une fois le serveur
d'accord. Le serveur relit la transaction chez Apple (production, puis bac à
sable pour TestFlight et l'examen), vérifie l'app et le compte, et range
l'achat. Les renouvellements, expirations et remboursements arrivent par les
notifications App Store Server.

Dans App Store Connect, dans l'ordre :

1. **Accords, taxes et banque** : signer l'accord des apps payantes et
   renseigner le compte bancaire. Sans lui, aucun achat ne se vend.
2. **Produits** : *Abonnements* › groupe « Aars Premium » › produit
   `aars_premium_mensuel`, durée 1 mois, prix, nom et description en
   français, capture de l'écran Premium pour l'examen. Puis *Achats intégrés*
   › `aars_cuisine_plus`, non consommable, prix, capture du Plan.
3. **Clé d'API** : *Utilisateurs et accès* › *Intégrations* › *Achat
   intégré* › générer une clé. Dans Vercel : `APPLE_IAP_KEY_ID`,
   `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY` (le contenu du `.p8`,
   sensible) ; `APPLE_BUNDLE_ID` seulement s'il diffère de
   `fr.aars.app`.
4. **Notifications** : *App* › *Informations sur l'app* › *Notifications du
   serveur App Store*, version 2, production et bac à sable :
   `https://aars-app.vercel.app/api/billing/apple/notify?secret=<APPLE_NOTIFY_SECRET>`,
   avec `APPLE_NOTIFY_SECRET` (32 caractères aléatoires) dans Vercel.
5. **Base** : `npm run db:migrate` pour `store_purchases` (migration 0023).
6. **Essai** : en local, Xcode › *Product* › *Scheme* › *Edit Scheme…* ›
   *Run* › *Options* › *StoreKit Configuration* › `Config/Aars.storekit`
   (prix fictifs). Un achat local n'est pas connu d'Apple : le serveur le
   refuse, c'est normal. Pour le circuit complet, un testeur bac à sable et
   TestFlight.

## Points ouverts, à trancher avant l'envoi

1. ~~**Abonnement**~~ (règle 3.1.3 b) : réglé. L'abonnement s'achète dans
   l'app iOS (voir *Achat intégré*), un abonnement pris sur Android y est donc
   admis. L'écran Premium porte les mentions qu'Apple demande : prix et
   durée, renouvellement et résiliation, conditions d'utilisation (celles
   d'Apple), confidentialité, restauration et gestion de l'abonnement.
2. ~~**Contenu généré par les utilisateurs** (règle 1.2)~~ : réglé.
   - Filtrer : on ne voit que ceux qu'on suit, et suivre s'accepte.
   - Signaler : « … » sur une séance du fil ou une personne, avec un motif
     (`POST /api/social/reports`). L'équipe est prévenue par courriel si
     `RESEND_API_KEY`, `MAIL_FROM` et `LEGAL_CONTACT_EMAIL` sont posées.
   - Bloquer : même menu ; Communauté › Personnes › Bloqués pour débloquer.
   - Traiter sous 24 heures : `npm run moderation` (lister, clore, rendre une
     séance privée, supprimer un compte).
   - Coordonnées publiées : l'URL d'assistance et `LEGAL_CONTACT_EMAIL`.
   Avant l'envoi, prévoir quelqu'un pour lire les alertes chaque jour.
3. ~~**Notifications**~~ : réglé. Le rappel du déjeuner est une notification
   locale (14 h à Paris, sautée si un déjeuner ou un dîner est noté), activée
   dans Moi. Ni APNs ni jeton d'appareil.
