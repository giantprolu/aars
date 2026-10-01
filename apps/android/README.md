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

Tout ce qui s'affiche vient de la base, par l'API : aucun contenu d'exemple.
Quand une page web lit la base directement, une route JSON lui correspond
(`/api/today`, `/api/training/home`, `/api/training/progress`,
`/api/social/home`, `/api/me`) : la PWA disparaîtra, l'API reste.

Branché :
- connexion, inscription, déconnexion (jeton chiffré par le Keystore) ;
- onboarding O0 à O4 ;
- Aujourd'hui, bouton + (Repas, Pesée), Moi, Progression ;
- Cuisine : plan de la semaine (placer un plat, « manger »), plats choisis,
  recettes (ajout aux plats de la semaine), courses cochables ;
- Sport : semaine, séance du jour, programme, dernières séances ;
- Communauté : suivis, classement, fil, bravos.

Pas encore faits : séance en cours plein écran, historique, recherche de
personnes, création de recettes et génération de la liste de courses (web
pour l'instant), scanner caméra, photo de l'assiette, Santé, notifications,
cache hors ligne, mode sombre.
