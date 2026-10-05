# NutriPerso iOS

Application native SwiftUI. Elle ne partage aucun code avec `apps/web` : elle
consomme l'API HTTP servie par l'app Next.js (`packages/api-contract`).

C'est un portage de l'app Android (`apps/android`), écran par écran, avec les
mêmes noms de modèles, la même surface d'API et la même interface. La
maquette (`Annexe/mobile`) le demande : une seule UI, identique sur iOS et
Android, faite de composants maison. Aucun composant système visible
(`List`, `NavigationStack`, `TabView`, `.sheet`…) ; seuls les services restent
natifs : trousseau, haptique, caméra, Santé et notifications locales.

## Ouvrir et lancer

1. Xcode › *Open* › `apps/ios/NutriPerso.xcodeproj`.
2. Choisir un simulateur iPhone, puis *Run*.

Aucune dépendance externe. Le projet utilise des dossiers synchronisés : un
fichier ajouté sous `NutriPerso/` entre dans la cible sans toucher au projet.

En ligne de commande, si `xcode-select -p` pointe encore sur les Command Line
Tools, préfixer par `DEVELOPER_DIR` (ou faire une fois
`sudo xcode-select -s /Applications/Xcode.app`) :

```
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project apps/ios/NutriPerso.xcodeproj -scheme NutriPerso \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

## Serveur visé

Par défaut, la production (`https://nutri-rosy-one.vercel.app`). Pour le
serveur de dev, dans `Config/Local.xcconfig` (non versionné) :

```
NUTRI_API_URL = http:/$()/localhost:3000
```

Le simulateur voit le poste sous `localhost`. Le HTTP en clair n'est permis
que vers le réseau local (`NSAllowsLocalNetworking`).

Pour un iPhone réel, poser aussi l'équipe de signature dans ce fichier :
`DEVELOPMENT_TEAM = XXXXXXXXXX`.

## Organisation

- `App/` : point d'entrée, `AppModel` (session, journal du jour, écritures
  suivies d'une relecture : le serveur reste la seule source de vérité).
- `Data/` : client d'API (`Authorization: Bearer`, `X-Client: mobile`),
  modèles, jeton dans le trousseau.
- `Theme/` : tokens de la refonte B v4 palette 2, Instrument Sans (police
  variable embarquée, OFL, `licenses/`), chiffres tabulaires.
- `Components/` : carte, pilules, champ, anneau, barres, feuille du bas,
  toasts. Icônes Lucide en SVG dans `Resources/Assets.xcassets/Lucide`.
- `Screens/` : un fichier par écran ou famille d'écrans, comme sur Android.

Deux écarts entre Codable et kotlinx.serialization sont comblés dans
`Data/Coding.swift` : `@Default` pour un champ que le serveur peut omettre,
`@Nullable` pour écrire `null` plutôt qu'omettre la clé (les schémas Zod en
`.nullable()` refusent une clé absente).

## État

Branché :
- connexion, inscription, récupération par code de secours, déconnexion au
  premier 401 (jeton dans le trousseau, oublié à la réinstallation) ;
- coquille : quatre onglets, bouton + en arc, toasts ;
- Aujourd'hui complet : semaine, jauge, macros, tuiles, journal (retirer un
  aliment, garder un repas en favori), tirer pour relire ;
- feuilles Repas (recherche, récents, favoris, saisie à la main) et Pesée ;
- onboarding O0 à O4 (objectif, profil Communauté, séances), et la
  modification de l'objectif depuis « cible · modifier » ;
- scanner (AVFoundation, EAN-8/13 et UPC-E lus sur l'appareil), saisie du
  code à la main, produit inconnu ou incomplet complété et mis au cache ;
- feuille Séance, séance en cours plein écran (séries, repos, records, fin,
  visibilité, favori, ajout d'exercice), Composer, Déjà faite ;
- Cuisine : plan de la semaine (placer un plat, manger), plats choisis,
  recettes (photo, ajout au panier, création), courses par rayon cochables,
  un article, scanner pour cocher en rayon ;
- Cuisine+ : « Remplir la semaine » sur le Plan, « Importer » une recette
  depuis un lien dans Recettes (brouillon relu dans l'éditeur) ;
- Sport : semaine, séance du jour, programme, dernières séances ;
- Communauté : suivis, classement de la semaine, fil et bravos, identifiant
  à choisir ; Personnes (chercher, suivre, demandes, abonnés, bloqués) ;
  signaler ou bloquer depuis « … » sur une séance ou une personne ;
- Moi, Progression (tonnage, poids, 1RM estimé), Historique et détail d'un
  jour, Compte et données (objectif, code de secours, export vers Fichiers,
  politique de confidentialité, déconnexion, suppression du compte) ;
- Santé : HealthKit lu au premier plan, à chaque retour dans l'app (au plus
  une fois par heure) et à la demande depuis Moi › Santé. Un seul type lu,
  l'énergie active, un total par jour sur trente jours, poussé sur
  `POST /api/activity`. Rien n'est écrit dans Santé. Relié en un toucher
  depuis la tuile Activité d'Aujourd'hui (« Relier Santé ») ;
- rappel du déjeuner (interrupteur dans Moi) : notifications locales posées
  pour quatorze jours à 14 h à Paris, celle du jour retirée dès que l'app voit
  un déjeuner ou un dîner noté. Pas d'APNs. Un repas noté sur un autre
  appareil n'est vu qu'à la prochaine ouverture de l'app iPhone.

Les écrans poussés (Moi, Historique, Personnes…) s'empilent et se ferment
aussi d'un glissé depuis le bord gauche.

Le simulateur n'a pas de caméra : le scanner y affiche « Caméra
indisponible », la saisie à la main reste possible. La lecture se vérifie sur
un iPhone.

HealthKit ne dit pas si la lecture a été accordée : un refus ressemble à
trente jours vides. Sur le simulateur, des journées se saisissent à la main
dans l'app Santé (Parcourir › Activité › Énergie en activité). Sur un
iPhone, l'équipe de signature doit accepter la capacité HealthKit : Xcode le
signale à la signature si ce n'est pas le cas.

## Achats

L'abonnement mensuel et Cuisine+ s'achètent dans
Moi › Abonnement ; l'écran s'ouvre aussi de lui-même dès qu'une action bute
sur une limite gratuite ou sur une fonction de Cuisine+. StoreKit 2, transaction rattachée au compte par le serveur
avant d'être terminée (`Data/PurchaseStore.swift`). Pour essayer sans App
Store Connect : le fichier `Config/NutriPerso.storekit`, à choisir dans le
schéma (voir `APP_STORE.md`, *Achat intégré*).

## Publication

Voir `APP_STORE.md` : signature, envoi, fiche, examen, étiquettes de
confidentialité et achat intégré.
