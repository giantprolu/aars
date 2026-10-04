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
- connexion, inscription, récupération, déconnexion (jeton chiffré par le Keystore) ;
- onboarding O0 à O4 ;
- Aujourd'hui, bouton + (Repas, Séance, Pesée), scanner caméra, Moi, Progression ;
- historique et détail d'un jour ;
- Cuisine : plan, recettes (création comprise), courses générées, cochables au scanner ;
- Sport : semaine, séance en cours plein écran, séance libre, composer ;
- Communauté : suivis, recherche, demandes, classement, fil, bravos ;
  signaler ou bloquer depuis « … », bloqués à débloquer dans Personnes ;
- Compte et données : objectif, code de secours, export, suppression ;
- Santé : Health Connect, lu au premier plan à chaque ouverture (30 jours),
  poussé sur `POST /api/activity` avec le jeton de session (écran Moi › Santé).

Pas encore faits, sans bloquer la publication : photo de l'assiette,
notifications (FCM), cache hors ligne, mode sombre (seul le clair est dessiné).

## Publication

Voir `PLAY_STORE.md` : signature, bundle, fiche, Sécurité des données,
déclaration Health Connect. Visuels de la fiche dans `store/`.
