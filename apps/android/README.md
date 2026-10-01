# NutriPerso Android

Application native Kotlin + Jetpack Compose. Elle ne partage aucun code avec
`apps/web` : elle consomme l'API HTTP servie par l'app Next.js
(`packages/api-contract`).

L'interface reprend la refonte B v4 (`Annexe/mobile`) : tokens dans
`ui/theme`, composants maison dans `ui/components`, aucun composant Material.
Icônes Lucide converties en vector drawables, police Instrument Sans embarquée
(OFL, `licenses/`).

## Ouvrir et lancer

1. Android Studio › *Open* › ce dossier `apps/android`.
2. Laisser la synchronisation Gradle télécharger le SDK 36, Gradle 9.8 et les
   dépendances. Le JDK embarqué d'Android Studio suffit.
3. Choisir un émulateur ou un téléphone, puis *Run*.

Le dépôt ne contient pas `gradle-wrapper.jar` : Android Studio n'en a pas
besoin. Pour compiler en ligne de commande, le régénérer une fois avec
`gradle wrapper`.

## Serveur visé

Par défaut, la production (`https://nutri-rosy-one.vercel.app`). Pour le
serveur de dev, dans `local.properties` (non versionné) :

```
nutriperso.apiUrl=http://10.0.2.2:3000
```

`10.0.2.2` est le poste vu depuis l'émulateur. Le HTTP en clair n'est permis
qu'en debug.

L'app s'authentifie par `Authorization: Bearer` : le serveur doit avoir la
prise en charge du jeton (`apps/web/src/server/guard.ts`) et la route
`GET /api/today`. Tant que la production ne les a pas, viser le serveur local.

## État

Branché sur l'API :
- connexion, inscription, déconnexion (jeton chiffré par le Keystore) ;
- onboarding O0 à O4 : profil et cible (`PUT /api/profile`), première pesée,
  identifiant, préférences et génération du programme ;
- Aujourd'hui : semaine, jauge, macros, tuiles séance, plat prévu (« Manger »),
  poids, activité, repas notés ;
- bouton + : feuille Repas (recherche, récents, favoris, saisie à la main,
  code-barres saisi au clavier), Pesée, Séance (affichage) ;
- Moi : identité et poids réels.

Contenus d'exemple (`ui/screens/Demo.kt`), à brancher : Cuisine, Sport hors
séance du jour, Communauté, Progression, records de Moi.

Pas encore faits : séance en cours plein écran, historique, scanner caméra,
photo de l'assiette, Santé (Health Connect), notifications FCM, cache hors
ligne, mode sombre.
