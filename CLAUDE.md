# Projet : NutriPerso

App de suivi alimentaire. Comptes distincts, inscription libre.
PWA d'abord ; des apps natives iOS et Android sont prévues (décision du
01/10/2026, qui lève l'ancien « Pas d'App Store »).

## Organisation du dépôt (monorepo npm workspaces)
- `apps/web` : l'app Next.js, PWA et API. Tout ce qui suit sur la stack la
  concerne. Les commandes `npm run …` se lancent à la racine et lui délèguent
- `apps/ios` : SwiftUI, `apps/android` : Kotlin + Compose. Aucun code partagé
  avec le web : elles consomment l'API HTTP
- `packages/api-contract` : contrat OpenAPI de l'API, seul point commun entre
  la PWA et les apps natives

Le projet a commencé mono-utilisateur avec un mot de passe unique en variable
d'environnement. Cette décision a été renversée le 11/09/2026 : chaque personne
a désormais son compte, son journal et son objectif calorique.

Conséquence à ne pas perdre de vue : les données stockées ne sont plus celles
d'une seule personne. Poids, âge et repas de tiers sont des données de santé.

## Stack imposée
- Next.js 15 (App Router) + TypeScript strict
- Tailwind + shadcn/ui (composants dans `apps/web/src/components/ui`, icônes lucide).
  Aucun autre kit de composants : un écran se compose des primitives shadcn
- Postgres (Neon) + Drizzle ORM, extensions `pg_trgm` et `unaccent`
- Déploiement Vercel
- Auth : comptes en base, empreinte PBKDF2 via Web Crypto, session signée en
  HMAC portant l'identifiant. Pas de vérification d'adresse. Récupération du mot
  de passe par code de secours (haché comme un mot de passe, usage unique), et
  par courriel via Resend seulement si `RESEND_API_KEY`, `MAIL_FROM` et `APP_URL`
  sont posées

## Definition of Done (obligatoire, chaque story)
1. `npm run build` passe sans erreur ni warning TypeScript
2. `npm run lint` passe
3. `git add -A && git commit -m "feat(story-<id>): <résumé>"`
4. `git push origin bmad/dev`
5. Marquer la story comme terminée dans le sprint status BMAD

Ne jamais passer à la story suivante si le build échoue.
Le travail se committe sur `bmad/dev`. Reporter ensuite `main` dessus est
autorisé, en avance rapide uniquement : c'est le même historique, pas une
fusion. Si l'avance rapide n'est pas possible, s'arrêter et le dire.
Si une commande échoue deux fois de suite, s'arrêter et écrire le blocage
dans `BLOCKERS.md` plutôt que de contourner.

## Interdits
- Pas de secrets en dur, pas de clé API côté client
- Pas de `any` en TypeScript
- Pas de localStorage comme source de vérité (iOS purge après 7 jours)
- Aucune requête sur `entries`, `food_aliases` ou `profiles` sans filtre sur
  l'utilisateur. Les fonctions le reçoivent en premier argument et ne le
  déduisent jamais seules : le compilateur doit pouvoir refuser un oubli
- L'identifiant d'utilisateur ne vient jamais du client, toujours du cookie
