# NutriPerso

Registre alimentaire personnel. PWA installable sur iPhone, mono-utilisateur,
sans compte ni objectif ni coaching.

Le sprint BMAD est terminé : 7 epics, 15 stories. Les artefacts de conception
vivent dans `_bmad-output/`, le suivi dans
`_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Organisation du dépôt

Monorepo npm workspaces.

| Dossier | Contenu |
|---|---|
| `apps/web` | App Next.js : PWA et API |
| `apps/ios` | App native SwiftUI (à créer) |
| `apps/android` | App native Kotlin + Compose (à créer) |
| `packages/api-contract` | Contrat OpenAPI partagé avec les apps natives (à écrire) |

Sauf mention contraire, les chemins ci-dessous sont relatifs à `apps/web`.

## Ce qu'il reste à faire pour que l'application tourne

Le code compile et l'analyse statique passe, mais rien n'a pu être exécuté
contre une vraie base. Les quatre étapes ci-dessous sont à faire à la main.
Le détail de chaque blocage est dans `BLOCKERS.md`.

**1. Créer la base.** Ouvrir un projet sur Neon, récupérer la chaîne de
connexion, puis :

```bash
cp apps/web/.env.example apps/web/.env.local
# renseigner DATABASE_URL, APP_PASSWORD et SESSION_SECRET
npm run db:migrate
```

`SESSION_SECRET` se génère avec `openssl rand -base64 32`.

**Catalogue de plats.** Les plats proposés à l'écran de choix vivent en base
(`catalog_meals`), pas dans le code. Ils entrent par un fichier JSON, et
l'import se rejoue sans doublon. Il faut migrer, puis importer, **avant** de
déployer : sans données, l'écran de choix est vide.

```bash
npm run seed:catalog -w @nutri/web -- chemin/vers/plats.json
npm run verify:catalog -w @nutri/web -- --write   # recale les estimations sur CIQUAL
```

Les 72 plats d'origine étaient dans le code jusqu'au commit `4dbb734`
(`apps/web/src/lib/catalog/`). Pour remplir une base neuve, le plus simple est
de copier la table `catalog_meals` d'une base existante (une branche Neon la
recopie d'office). À défaut, extraire ces fichiers avec
`git show 4dbb734:apps/web/src/lib/catalog/lose.ts` (idem `maintain`, `gain`),
les convertir en `{ "lose": […], "maintain": […], "gain": […] }`, puis
lancer l'import.

**Photos des plats.** Elles sont dans Vercel Blob, et `catalog_meals.image_url`
pointe vers elles. On les génère à la main (prompts dans
`docs/prompts-photos-plats.md`), on les nomme `<slug>.png`, on les met dans un
dossier, puis :

```bash
npm run upload:photos -w @nutri/web -- chemin/vers/dossier
```

Le script les réduit à 1200 px en WebP, les envoie et remplace l'éventuelle
photo précédente. Il demande `BLOB_READ_WRITE_TOKEN` dans `.env.local`. L'app
n'en a pas besoin : elle ne lit que des URL publiques. Les URL s'écrivent dans
la base de `DATABASE_URL` : c'est celle de production qu'il faut viser pour
que l'app en ligne affiche les photos.

**2. Importer la table CIQUAL.** Le fichier n'est pas versionné : il vient du
site de l'ANSES et son téléchargement demande une intervention humaine.

```bash
# placer le CSV dans apps/web/data/ciqual.csv
npm run import:ciqual -w @nutri/web -- data/ciqual.csv
```

Le script est idempotent. Le relancer met à jour les lignes existantes sans
créer de doublon.

**3. Créer la clé Mistral.** Sans elle, la reconnaissance photo répond 503 et
l'interface bascule sur la recherche textuelle. Les deux autres chemins
d'ajout fonctionnent sans.

**4. Pousser sur GitHub.** Aucune clé SSH ni `gh` n'est installé sur la
machine où le sprint a tourné. Les commits sont en local sur `bmad/dev`.

```bash
ssh-keygen -t ed25519 -C "ton-email"
# ajouter la cle publique au compte GitHub, creer le depot, puis
git push -u origin main
git push -u origin bmad/dev
```

## Commandes

À lancer à la racine. `dev`, `build`, `start`, `lint`, `typecheck`,
`db:generate` et `db:migrate` y sont relayées vers l'app web ; les autres
demandent `-w @nutri/web` (par exemple `npm run verify -w @nutri/web`).

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Compilation de production |
| `npm run lint` | Analyse statique |
| `npm run typecheck` | Types de l'application et du service worker |
| `npm run verify` | Vérifications du domaine, sans base |
| `npm run verify:off` | Contrat avec Open Food Facts, demande le réseau |
| `npm run db:generate` | Génère une migration depuis le schéma |
| `npm run db:migrate` | Applique les migrations |
| `npm run import:ciqual` | Importe la table CIQUAL |
| `npm run seed:catalog` | Importe des plats du catalogue depuis un JSON |
| `npm run verify:catalog` | Vérifie le catalogue contre CIQUAL |
| `npm run upload:photos` | Envoie les photos des plats dans Vercel Blob |

## Ce qui structure le code

Cinq décisions expliquent l'essentiel de l'architecture. Le détail est dans
`_bmad-output/planning-artifacts/architecture/`.

**Les macros d'une entrée sont figées à l'écriture.** La table `entries` porte
ses propres valeurs nutritionnelles et une copie du nom de l'aliment. Aucune
requête d'affichage ne la joint à une table de référence. Corriger une fiche
produit ne change donc rien à l'historique.

**Open Food Facts est appelé depuis le navigateur.** Sa limite est de 15
requêtes par minute et par adresse IP. Passer par une fonction serveur
mutualiserait l'IP et consommerait ce quota pour tout le monde.

**Le succès d'un appel Open Food Facts se lit dans le corps.** L'API répond
HTTP 200 même quand le produit est introuvable. Le seul indicateur exploitable
est le champ `status`.

**La clé Mistral ne franchit jamais la frontière serveur.** Le SDK n'est
importé que dans `src/server/clients/mistral.ts`.

**Postgres est la seule source de vérité.** Le stockage local d'une PWA iOS
est purgé après sept jours sans ouverture. Le service worker ne met en cache
que la coquille applicative.

## Ce que le produit ne fait pas

Pas de conseil nutritionnel, pas d'objectif calorique, pas de notification,
pas de suivi du poids, pas de recettes, pas d'export, pas de graphiques. Cette
liste est un choix de conception, pas un retard de livraison.
