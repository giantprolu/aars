# Handoff : NutriPerso en application native Flutter (iOS + Android)

## Vue d'ensemble

NutriPerso est aujourd'hui une PWA Next.js 15 (dépôt `nutri-perso`). Il s'agit de l'**application mobile native** en Flutter/Dart, avec la refonte UX/UI validée :

- 5 onglets : **Aujourd'hui · Cuisine · + · Sport · Communauté**. **Moi** s'ouvre depuis l'avatar, en haut à droite de chaque écran principal.
- Un **bouton + central en arc** : Repas, Séance, Pesée.
- Un **onboarding en 3 étapes** après l'inscription : Objectif → Profil Communauté → Séances.
- Un **code couleur par domaine**, le même partout.

**Règle de plateforme :** une seule UI, identique sur iOS et Android. Tous les composants visibles sont des widgets **custom**, construits sur `widgets` et `material` de base, sans `Cupertino*` ni widgets *adaptive*. Seuls restent natifs, par OS, les services système : caméra, santé, notifications, stockage sécurisé, haptique.

## À propos des fichiers de design

Les fichiers `.dc.html` de ce dossier sont des **références de design en HTML**. Ce sont des prototypes qui montrent l'apparence et le comportement attendus, pas du code à copier. Il faut les **recréer en Flutter**. Pour les voir, ouvrir les `.dc.html` dans un navigateur, depuis ce dossier (ils chargent `support.js` et `icons/`).

## Fidélité

**Haute fidélité.** Couleurs, typographie, rayons, espacements et animations sont définitifs. Reproduire au pixel près, à 390 × 844 pt (iPhone 14/15) comme référence. Les écrans doivent s'adapter de 360 à 430 pt de large.

Les seules exceptions sont les contenus d'exemple (noms, chiffres, exercices, salle « Basic-Fit ») et les emplacements de photos (rayures diagonales), qui viendront de l'API.

---

## ⚠ Décisions à confirmer avant de coder

1. **`CLAUDE.md` dit « Pas d'App Store ».** Passer en natif renverse cette décision. Il faut mettre `CLAUDE.md` à jour, avec la publication App Store / Play Store, les comptes développeur et la politique de confidentialité. Ce sont des données de santé : il faut les déclarations App Privacy (Apple) et Data Safety (Google).
2. **La PWA reste-t-elle en ligne ?** Par défaut, oui : le backend Next.js est conservé et sert les deux clients.
3. **Mode sombre.** L'app propose Clair, Sombre et Auto, mais seul le thème clair est dessiné. Par défaut, livrer le clair d'abord et garder `ThemeExtension` prêt pour un sombre plus tard.

---

## Architecture

### Backend : on garde Next.js, avec une adaptation d'authentification

L'API REST existe déjà sous `src/app/api/**` : `entries`, `search`, `products/[barcode]`, `profile`, `weight`, `plan`, `recipes`, `shopping`, `basket`, `training/*`, `social/*`, `history`, `favorites`, `quick-add`, `recognize`, `push`, `account`, `session`, `recover`, etc. Elle renvoie du JSON et répond 401 sans session (`src/server/guard.ts`).

Changements serveur nécessaires, dans une story dédiée avant tout écran Flutter :

- **Auth mobile.** `currentUserId()` lit seulement le cookie `nutriperso_session`. Il faut ajouter la lecture de `Authorization: Bearer <token>`, avec le même jeton HMAC (`readSessionToken`). `POST /api/session` doit renvoyer le jeton dans le corps quand l'en-tête `X-Client: mobile` est présent. Respecter `CLAUDE.md` : l'identifiant d'utilisateur vient toujours du jeton, jamais d'un paramètre.
- **CORS** n'est pas nécessaire : une app native n'est pas soumise au CORS.
- **Push.** `web-push` (VAPID) ne fonctionne pas sur mobile natif. Il faut ajouter FCM, qui couvre aussi les APNs pour iOS, côté serveur : une table de jetons d'appareil par utilisateur et l'envoi dans `api/cron/reminders`.
- **Santé.** Aujourd'hui, l'activité arrive par un raccourci iOS sur `api/activity`, avec un `ingest-token`. En natif, l'app lit HealthKit / Health Connect elle-même et poste sur `api/activity` avec le Bearer de session.
- **Inscription.** Vérifier qu'une route JSON d'inscription existe, sinon l'ajouter : l'inscription web passe peut-être par `/welcome` ou `/unlock`.

### Client Flutter : paquets recommandés

| Besoin | Paquet | Remplace dans la PWA |
|---|---|---|
| État | `flutter_riverpod` (+ `riverpod_generator`) | état React |
| Navigation | `go_router`, avec `StatefulShellRoute` pour les 5 onglets | App Router |
| HTTP | `dio` + intercepteur Bearer | `fetch` |
| Modèles | `freezed` + `json_serializable` | `src/lib/types.ts` |
| Jeton | `flutter_secure_storage` | cookie |
| Cache hors ligne | `drift` (SQLite), journal du jour et 30 jours | Serwist / service worker |
| Code-barres | `mobile_scanner` | `zxing-wasm` |
| Photo de l'assiette | `image_picker` → `POST /api/recognize` | input file |
| Santé | `health` (HealthKit + Health Connect) | raccourci iOS |
| Push | `firebase_messaging` + `flutter_local_notifications` | `web-push` |
| Graphiques | `CustomPainter` maison (barres, courbe, anneaux) | recharts |
| Icônes | `lucide_icons_flutter` (mêmes glyphes Lucide) | `lucide-react` |
| Police | `google_fonts` (Instrument Sans) ou police embarquée dans `assets/fonts` | Google Fonts |
| Haptique | `HapticFeedback` (services) | — |

Logique pure à **porter en Dart**, sans réécrire les règles, avec des tests unitaires qui reprennent ceux de `scripts/verify-pure.ts` : `lib/energy.ts` (métabolisme, dépense, cible), `nutrition.ts`, `date.ts`, `weight.ts`, `workout-progress.ts` (1RM estimé, tonnage), `basket.ts`, `shopping.ts`, `aisle.ts`, `barcode.ts`.

### Arborescence proposée

```
lib/
  app.dart                  // MaterialApp.router, thème NutriTheme
  router.dart               // go_router : /onboarding/*, shell 5 onglets, /me, /me/progress…
  theme/nutri_tokens.dart   // FOURNI dans ce dossier
  theme/nutri_theme.dart    // ThemeData + ThemeExtension<NutriColors>
  core/api/                 // dio, intercepteurs, erreurs 401 → écran connexion
  core/storage/             // secure storage, drift
  domain/                   // modèles freezed + logique pure portée
  features/
    today/  kitchen/  training/  community/  me/  add/  onboarding/  auth/
  ui/                       // composants custom (liste ci-dessous)
```

---

## Design tokens

Ils sont fournis prêts à l'emploi dans **`lib/theme/nutri_tokens.dart`**, la référence. En résumé :

### Couleurs par domaine

| Domaine | Plein (fill) | Fond doux (soft) | Piste (seg) | Clair (light) | Texte sur clair | Texte sur plein |
|---|---|---|---|---|---|---|
| **Nutrition** (calories, repas, +, onglet Aujourd'hui, étape Objectif) | `#36B37E` | `#DDF3E9` | `#BDE7D3` | `#86D2AF` | `#1F7A52` | `#0B3B26` |
| **Cuisine** (plan, recettes, courses) | `#F7A007` | `#FDEBCC` | `#FBD89A` | `#F9C25E` | `#945B00` | `#3A2600` |
| **Sport** (séances, programme, étape Séances) | `#262E57` | `#DDE0EE` | `#C2C7E0` | `#8E96C0` | `#262E57` | `#FFFFFF` |
| **Corps** (poids, activité, avatar, Pesée) | `#7C5CFC` | `#EAE5FF` | `#D6CCFE` | `#B3A2FD` | `#5A3BD6` | `#FFFFFF` |
| **Communauté** (étape Communauté) | `#A5E9E8` | `#E3F8F7` | `#C8F1F0` | `#A5E9E8` | `#1C6968` | `#0E4D4C` |

Règles :
- Ne **jamais** poser de texte ou d'icône `fill` sur fond clair pour Nutrition, Cuisine et Communauté : utiliser `textOnLight`.
- Contours et anneaux Communauté : `#4FBFBE`.
- **Macros** : Protéines `#C32B42` (texte `#9E2236`, piste `#F8DDE1`), Glucides `#F7A007` (texte `#945B00`, piste `#FDEBCC`), Lipides `#4FBFBE` (texte `#1C6968`, piste `#E3F8F7`).
- **Badge record** : fond `#FDEBCC`, texte `#945B00`.
- Le noir `#231F1A` sert **uniquement au texte**, jamais de fond plein noir.

### Neutres

- `ink #231F1A` : texte principal, et libellés de section en MAJUSCULES.
- `muted #736B62` : texte secondaire.
- `faint #A39A8F` : désactivé, chevrons.
- `tabInactive #8A8279`.
- `screen #F4F1EB` : fond d'écran. L'onboarding utilise aussi `#F4F1EB` ; la maquette montre `#F2EEE7`, à unifier.
- `card #FFFDF9` · `cardBorder #E9E3D9` · `divider #EEE8DE` · `track #EBE5DA` · `chip #F1ECE4` · `sheetHandle #E0D9CE`.
- Voile sous les feuilles et l'arc : `rgba(28,24,20,0.5)` + flou 2.

### Typographie : Instrument Sans (400, 500, 600, 700), chiffres tabulaires partout

| Rôle | Taille / graisse / interligne / approche |
|---|---|
| Titre d'écran | 24 / 600 / 1.2 / −0.03 em |
| Titre onboarding | 28 / 600 / 1.15 / −0.03 em |
| Grand chiffre (anneau) | 26 / 700 / 1.0 / −0.03 em |
| Gros chiffre pesée | 52 / 700 / 1.0 / −0.04 em |
| Titre de carte | 15–16 / 600 |
| Corps | 14 / 400–500 / 1.45 |
| Secondaire | 12.5 / 400 / `muted` |
| Libellé de tuile | 11.5 / 600 / couleur `textOnLight` du domaine |
| Section MAJUSCULES | 11.5 / 700 / +0.06 em / `ink` |
| Onglet de la barre | 10.5 / 500 (inactif), 700 (actif) |

### Rayons, espacements, ombres

- Rayons : téléphone 44 (maquette seulement) · feuille 28 (haut) · carte principale 18 · séance du jour 20 · tuile 16 · champ 14 · petit 8–10 · pilule 999.
- Marges : écran 16 horizontal (22 pour l'onboarding) · espace entre blocs 12 · padding de carte 14–16 · espace dans une grille de tuiles 8–10.
- Ombre du bouton + : `0 6 16 -4` avec la couleur `fill` à 55 %. Bulles de l'arc : `0 8 20 -6` avec leur couleur à 60 %.
- Barre d'onglets : hauteur 58 + zone de sécurité, fond `#FFFDF9` à 96 %, filet haut `#E6E0D6`.

---

## Composants custom (dossier `ui/`)

Un widget par élément, sans variante par OS.

1. **`NutriTabBar`** : 5 emplacements, avec le + central de 50 × 50, flottant et dépassant de 4 pt. Couleur de l'onglet actif : Aujourd'hui `#1F7A52`, Cuisine `#945B00`, Sport `#262E57`, Communauté `#1C6968`. Le + est vert Nutrition.
2. **`FabArc`** : le bouton + et ses 3 bulles. Voir l'interaction détaillée plus bas. C'est la référence `Bouton + interactif.dc.html`.
3. **`DomainHeader`** : titre de 24, sous-titre, avatar de 36 à droite (fond `#EAE5FF`, initiales `#5A3BD6`) qui ouvre **Moi**. Sur Cuisine, Sport et Communauté, une pastille de 34 × 34 (rayon 11) aux couleurs du domaine se place à gauche du titre.
4. **`CalorieRing`** : anneau de 112 et d'épaisseur 10, piste `seg` Nutrition, arc `fill`. Au centre : le reste en 26/700 `#1F7A52`, puis « restantes ». À droite, 3 `MacroBar`. En dessous, 3 colonnes séparées par des filets : mangées · cible (lien « modifier » qui ouvre l'édition de l'objectif) · entraînement (texte Sport).
5. **`MacroBar`** : libellé coloré, `x / y g`, piste de 7 pt.
6. **`WeekStrip`** : 7 mini-barres de hauteur proportionnelle aux kcal du jour, le jour courant en `fill` Nutrition. Le lien « Historique » ouvre l'historique.
7. **`DomainTile`** : tuile en grille de 2. Deux variantes : `filled` (Séance du jour, fond `#262E57` et bouton blanc « Commencer ») et `soft` (fond `soft` du domaine, libellé et icône en `textOnLight`).
8. **`SegmentedPill`** : 2 à 5 options, piste `seg` du domaine, sélection `#FFFDF9`. Sert aux onglets de Cuisine (Plan · Recettes · Courses, avec badge de compteur), aux périodes de Progression et à l'apparence.
9. **`BottomSheetNutri`** : rayon 28 en haut, poignée de 40 × 4, titre de 19/600, bouton × rond de 32 sur `chip`. L'entrée remonte depuis `translateY(110 %)` en 350 ms, courbe `Cubic(.2,.9,.3,1)`.
10. **`StatTriple`** : 3 petites tuiles (libellé, chiffre de 18–20/600, sous-ligne ou mini-barre).
11. **`WeekPlanGrid`** (Cuisine) : lignes jour × Midi/Soir. Case planifiée sur `soft` orange, case du jour en `fill` orange avec « manger », case vide en pointillé `#FBD89A` avec « + », passé barré en `faint`.
12. **`SessionCard`**, **`FeedCard`** (Communauté : avatar, séance en texte Sport, 3 chiffres sur `soft` Sport, badge record, ♥ `#9E2236` actif), **`StoryAvatarRow`** (anneau `#4FBFBE` pour une nouvelle séance).
13. **`StepProgress`** (onboarding) : 3 segments de 5 pt. Chaque segment se remplit à la couleur de son étape (vert, cyan, bleu nuit).
14. **`PrimaryButton`** : hauteur 54 en onboarding et 52 en feuille, pilule, fond `fill` du domaine courant et texte `textOnFill`. **`GhostButton`** : texte `muted`.
15. **`NumberStepper`** (pesée) : − et + ronds de 52 sur `soft` Corps, valeur au centre en 52/700 `#5A3BD6`, pas de 0,1 kg.

---

## Écrans

Les références sont dans `Refonte B v4 - Palette 2.dc.html` (écrans C1 à C7), `Onboarding v3 - Palette 2.dc.html` (O0 à O4) et `Bouton + interactif.dc.html`.

### Coquille
- `StatefulShellRoute` avec 4 branches (Aujourd'hui, Cuisine, Sport, Communauté). Le + n'est pas une branche : il ouvre `FabArc` par-dessus l'onglet courant.
- **Moi** (`/me`) est poussé par-dessus la coquille, avec un retour « Retour ». **Progression** (`/me/progress`) est poussé depuis Moi.

### 1. Aujourd'hui (C1)
De haut en bas : `DomainHeader` (sous-titre « Mardi 30 septembre · jour d'entraînement », la mention en texte Sport) → `WeekStrip` → `CalorieRing` → grille 2 × 2 (Séance du jour en `filled` Sport · Ce soir en `soft` Cuisine avec « Manger » · Poids en `soft` Corps avec mini-courbe · Activité Santé en `soft` Corps) → carte des repas (nom, barre de répartition des macros de 64 × 7, kcal).
- « Manger » enregistre la part planifiée dans le journal (`POST /api/entries` depuis le plan) et barre la case dans Cuisine.
- « Commencer » lance la séance en cours, en plein écran.

### 2. Cuisine · Plan (C3)
`DomainHeader` avec pastille orange → `SegmentedPill` (Plan · Recettes · Courses) → `StatTriple` (plats choisis · repas placés x/14 · courses x/20, avec mini-barres) → carte « À cuisiner » (puces plat x/y, lien « Choisir des plats ») → `WeekPlanGrid`.
- **Recettes** : recherche, filtres pilule, grille de 2 cartes photo. Mise en page de la direction A, en couleurs Cuisine.
- **Courses** : progression du panier, « Scanner pour cocher » et « Un article », liste par rayon (`aisle.ts`) avec cases à cocher.

### 3. Sport (C4)
`DomainHeader` avec pastille bleu nuit → `StatTriple` sur `soft` Sport (séances 2/3 avec segments · volume · records) → carte Séance du jour (fond `#262E57`, liste des exercices, bouton lecture rond blanc) → carrousel horizontal « Programme » (cartes de 150, étoile favorite `#F7A007`) → « Dernières séances » (point Sport, badge record).
- **Séance en cours**, plein écran sombre : reprendre la structure de la direction A (fond `#1C1915`, progression par exercice, série active sur fond clair, minuteur de repos en bas). L'accent est Sport-clair `#8E96C0`.

### 4. Communauté (C5)
`DomainHeader` (« 12 suivis · 2 demandes ») → rangée d'avatars (Inviter en pointillé `#4FBFBE`) → carte « Cette semaine » (barres par personne, « Toi » en `#1C6968`) → `FeedCard`s.

### 5. Moi (C6)
Retour + engrenage → identité (avatar de 48 en `#7C5CFC`) → carte Poids sur toute la largeur, `soft` Corps (moyenne de la semaine, écart, bouton « + Pesée », 12 barres) → 2 tuiles Sport (Records, Régularité) → ligne « Progression détaillée » → réglages (Apparence en `SegmentedPill`, Rappel du déjeuner en interrupteur `fill` Nutrition, Santé avec badge « Actif », Compte et données).
- L'édition de l'**objectif calorique** reprend les écrans 1a à 1c de l'onboarding, en mode édition.

### 6. Progression (C7)
`SegmentedPill` 4 sem. · 12 sem. · 1 an → graphique combiné (barres de tonnage `#C2C7E0`, la dernière en `#262E57`, courbe de poids `#7C5CFC` de 3 pt) → tableau Exercice · 1RM est. · Écart (badge `soft` Sport, ou `chip` si égal).

### 7. Historique
Mise en page de la direction A (moyenne, jours notés, barres sur 30 jours avec ligne de cible en pointillé, liste des jours), en couleurs Nutrition.

### 8. Onboarding (O0 → O4), affiché une seule fois, juste après l'inscription
- **O0 Bienvenue** : 3 cartes d'étape, chacune en `soft` de sa couleur (1 Objectif en vert, 2 Communauté en cyan, 3 Séances en bleu nuit), puis « Commencer ».
- **O1a Mesures** : Sexe (segmenté), Taille, Poids (devient la 1re pesée), Date de naissance, Masse grasse (facultative).
- **O1b Activité et but** : 5 niveaux d'activité (`ACTIVITY_LABELS` de `ProfileForm.tsx`), Objectif Perdre / Maintenir / Prendre, curseur du rythme en % par semaine avec équivalent en kg.
- **O1c Cible** : anneau de 150 en 3 parts (macros), kcal en 34/700, détail métabolisme de base / dépense / déficit. Actions : « Valider et continuer » et « Saisir ma cible à la main ».
- **O2 Communauté** : aperçu du profil, Identifiant `@` (3 à 20 caractères, lettres, chiffres et _, unique, coche verte si libre, vérification avec un délai de 400 ms), Nom affiché (facultatif). « Plus tard » est possible.
- **O3a Séances** : focus Haut / Bas / Les deux, Salle (liste), Poids libres / Machines guidées / Indifférent, 2 à 6 séances par semaine (`MIN/MAX_SESSIONS_PER_WEEK`).
- **O3b Programme** : séances A, B, C générées (`workout-plan.ts`), puis « Terminer » et « Revoir mes réponses ».
- **O4 Arrivée** : carte récapitulative cochée aux 3 couleurs, anneau vide « Rien de noté », cartes « Première séance » et « Suivre des amis », bulle d'aide au-dessus du + : « Touche + puis Repas ».
- Persister l'avancement côté serveur (profil incomplet → reprise de l'étape). L'état local seul ne suffit pas.

---

## Interactions et animations

### Bouton + en arc (`FabArc`), référence `Bouton + interactif.dc.html`
- **Toucher** :
  - le + passe du fond `#36B37E` à `#FFFDF9`, l'icône tourne de 135° (il devient un ×) et le bouton descend à l'échelle 0,92 ;
  - un voile apparaît en fondu en 250 ms ;
  - 3 bulles sortent du centre du + (échelle 0,2 → 1, opacité 0 → 1) en 380 ms, courbe `Cubic(.34,1.56,.64,1)` (léger rebond), décalées de 0, 40 et 80 ms.
- **Position des bulles** par rapport au centre du + :
  - **Séance** à (−92, −78), 54 pt, `#262E57`, icône haltère blanche ;
  - **Repas** à (0, −128), **66 pt**, `#36B37E`, icône couverts `#0B3B26` ;
  - **Pesée** à (+92, −78), 54 pt, `#7C5CFC`, icône balance blanche.
  - Chaque bulle porte un libellé blanc de 12.5/700, 6 pt en dessous.
- **Appui long** (500 ms) : ouvre directement le scanner, avec `HapticFeedback.mediumImpact()`.
- **Fermer** : toucher le voile, le × ou le + ouvert.
- **Repas** ouvre une feuille avec :
  - le repas en `SegmentedPill`, le choix par défaut suivant l'heure (avant 10 h petit-déj, 10–15 h déjeuner, 15–18 h collation, ensuite dîner) ;
  - la recherche (`/api/search` : aliments CIQUAL, Open Food Facts, recettes, favoris, tout au même endroit) ;
  - les récents (`/api/entries/shortcuts`) : un toucher ajoute l'aliment, avec un toast « … ajouté au déjeuner » ;
  - 4 modes : Scanner, Favoris, Photo, À la main.
- **Séance** ouvre une feuille : grande carte « Commencer [séance prévue] », puis Libre, Déjà faite, Composer.
- **Pesée** ouvre une feuille : `NumberStepper` initialisé sur la dernière pesée, puis « Enregistrer » (`POST /api/weight`), qui met à jour la tuile Poids et affiche un toast.
- **Toast** : pilule `#231F1A` en haut, entre en glissant de −20 pt (300 ms, rebond) et reste 2,2 s.

### Général
- Feuilles : glisser vers le bas pour fermer, au-delà de 30 % de la hauteur ou à vitesse supérieure à 700.
- Transitions de page : glissement horizontal identique sur les deux OS. Utiliser `CupertinoPageTransitionsBuilder` pour les deux plateformes dans `PageTransitionsTheme`, afin que les deux OS se comportent pareil, et garder le geste retour par bord gauche.
- Retour haptique `selectionClick` sur les segmentés, les cases à cocher et l'ajout d'un récent.
- Chargements : squelettes aux mêmes dimensions que les cartes, couleur `track` qui pulse. Erreur réseau : bandeau en haut, avec le journal servi depuis le cache drift.
- 401 : purger le jeton et revenir à la connexion.

## État

- `sessionProvider` (jeton, utilisateur) · `onboardingStepProvider` · `todayProvider` (journal, totaux, cible ajustée entraînement, tuiles) · `weekPlanProvider` · `basketProvider` · `trainingProvider` (séance prévue, séance en cours persistée en local pour survivre à la fermeture de l'app) · `feedProvider` · `profileProvider`.
- Ajouts optimistes (journal, pesée, coche de courses) avec annulation si le serveur refuse.

## Fichiers de ce dossier

- `Refonte B v4 - Palette 2.dc.html` : écrans principaux C1 à C7 et légende des couleurs.
- `Onboarding v3 - Palette 2.dc.html` : parcours d'arrivée O0 à O4.
- `Bouton + interactif.dc.html` : prototype cliquable du bouton + (arc, feuilles, appui long, toast).
- `lib/theme/nutri_tokens.dart` : tokens Dart prêts à coller.
- `icons/` : les SVG Lucide utilisés (référence ; en Flutter, utiliser `lucide_icons_flutter`).
- `support.js` : nécessaire seulement pour ouvrir les `.dc.html` dans un navigateur.

## Ordre de travail suggéré (stories)

1. Backend : Bearer et inscription JSON. Tests sur une route existante.
2. Squelette Flutter : thème, tokens, police, router, coquille 5 onglets, `NutriTabBar`.
3. Auth : connexion, inscription, récupération.
4. Onboarding O0 à O4, avec le portage d'`energy.ts` et ses tests.
5. Aujourd'hui, puis `FabArc` avec Repas (recherche, récents, scanner, photo, à la main).
6. Pesée, Moi, Progression.
7. Sport : accueil, séance en cours, composer.
8. Cuisine : plan, recettes, courses.
9. Communauté.
10. Natif : Santé, push FCM, cache hors ligne.
11. Publication : icônes, écrans de lancement, fiches des stores, déclarations de confidentialité.

Definition of Done côté Flutter, à ajouter dans `CLAUDE.md` : `flutter analyze` sans avertissement, `dart format --set-exit-if-changed .`, `flutter test`, puis le même flux git que le web.
