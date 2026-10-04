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
| Identifiant de bundle `fr.nutriperso.app` | `project.pbxproj` |
| Version et numéro de build | `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` |
| Jeton de session dans le trousseau, ni sauvegardé ni migré | `Data/TokenStore.swift` |
| HTTPS seul, HTTP en clair vers le réseau local uniquement | `Config/Info.plist` (`NSAllowsLocalNetworking`) |
| Chiffrement standard seulement (HTTPS) | `ITSAppUsesNonExemptEncryption` à `NO` |
| Caméra : texte d'usage | `NSCameraUsageDescription` |
| HealthKit : capacité et texte d'usage, lecture seule | `Config/NutriPerso.entitlements`, `NSHealthShareUsageDescription` |
| Suppression du compte dans l'app | Moi › Compte et données |
| Politique de confidentialité publique | `https://nutri-rosy-one.vercel.app/legal/privacy` |
| Icône 1024 | `Resources/Assets.xcassets/AppIcon.appiconset` |
| Aucun SDK tiers (analyse, publicité, plantages) | aucune dépendance |

## Construire et envoyer

1. **Compte** : Apple Developer Program, au nom de la personne ou de
   l'entreprise qui publie.
2. **Signature** : dans `Config/Local.xcconfig` (non versionné),
   `DEVELOPMENT_TEAM = XXXXXXXXXX`, ou Xcode › cible › *Signing &
   Capabilities* › *Team*. La signature automatique crée l'identifiant d'app
   avec la capacité HealthKit.
3. **App Store Connect** › *Apps* › *Nouvelle app* : iOS, nom « NutriPerso »,
   langue principale français, bundle `fr.nutriperso.app`, SKU au choix.
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

**Nom** (30 car.) : `NutriPerso`

**Sous-titre** (30 car.) : `Journal, cible calorique, sport`

**Mots-clés** (100 car.) :
`calories,macros,nutrition,régime,journal alimentaire,musculation,recettes,courses,poids,CIQUAL`

**Description** : celle de `PLAY_STORE.md`, en remplaçant la ligne Santé par
« Santé : avec ton accord, l'app lit ton énergie active dans Santé pour
ajuster ta cible. »

**Catégorie** : Santé et forme (secondaire : Forme et alimentation selon ce
que propose App Store Connect). **URL d'assistance** : obligatoire, une page
qui donne l'adresse `LEGAL_CONTACT_EMAIL`. **URL de confidentialité** :
`https://nutri-rosy-one.vercel.app/legal/privacy`.

## Examen (App Review)

- **Compte de démonstration** : obligatoire, la connexion étant requise. Un
  compte dont l'onboarding est fini, avec quelques jours de journal, une
  recette et une séance.
- **Notes pour l'examen** : « HealthKit sert uniquement à lire l'énergie
  active (un total par jour, trente jours au plus) pour ajuster la cible
  calorique. Rien n'est écrit dans Santé, rien n'est lu en arrière-plan, ces
  données ne servent ni à la publicité ni à des tiers. Accès depuis
  Moi › Santé. Suppression du compte : Moi › Compte et données. »
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
| Contenu utilisateur | Autre contenu | recettes, plans, listes de courses | Fonctionnalités de l'app |
| Données d'utilisation | Interactions avec le produit | compteurs par jour (ouvertures, repas ajoutés et leur moyen, limites atteintes), effacés après treize mois | Analyses |
| Autres données | Autres types de données | date de naissance, sexe (calcul de la cible) | Fonctionnalités de l'app |

Non collectés : position, contacts, historique de recherche ou de navigation
(une recherche d'aliment n'est pas conservée), photos (le scanner lit le
code-barres sur le téléphone et n'envoie que le nombre), achats, diagnostics
et plantages, identifiants publicitaires.

## Points ouverts, à trancher avant l'envoi

1. **Abonnement** : l'app iOS n'a pas d'achat intégré. Le serveur applique les
   limites gratuites (10 recettes, 10 favoris, réponse « Réservé aux
   abonnés. ») sans renvoyer vers un achat ailleurs, ce qui reste conforme. Mais
   un abonné Google Play qui se connecte sur iPhone y retrouve ses avantages :
   la règle 3.1.3 (b) d'Apple ne l'admet que si l'abonnement s'achète aussi
   dans l'app iOS. Soit ajouter StoreKit et une vérification serveur
   (`POST /api/billing/apple`, comme `billing/google`), soit publier sans
   avantages hors iOS.
2. **Contenu généré par les utilisateurs** (règle 1.2) : la Communauté a les
   abonnements sur acceptation et « Retirer » un abonné, mais pas de
   signalement ni de blocage explicites. Apple les demande pour une app où des
   utilisateurs voient le contenu d'autres. À ajouter côté serveur et dans
   les trois clients, ou à justifier dans les notes d'examen.
3. **Notifications** : le rappel du déjeuner est en Web Push (VAPID). Sur
   iOS natif, il faudrait APNs : rien n'est branché, la fiche ne doit pas en
   promettre.
