---
title: 'Catalogue de plats déplacé du code vers la base'
type: 'refactor'
created: '2026-10-02'
status: 'done'
baseline_commit: '4dbb7340a98c1efbeb83c7d861867d372d8a96e9'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les 72 plats du catalogue sont écrits en dur dans trois fichiers TypeScript (~1 500 lignes). Ajouter des plats ou leur donner une photo oblige à modifier le code. L'utilisateur veut garder le moins possible dans le code quand on peut externaliser gratuitement.

**Approach:** Le catalogue passe dans une table Postgres sur Neon, déjà gratuit. Un script recopie une fois les 72 plats actuels, puis les fichiers de données sont supprimés. Rien ne change à l'écran ni dans l'API. C'est l'étape 1 sur 3 : les photos dans Blob (étape 2) et les 48 nouveaux plats (étape 3) viendront ensuite.

## Boundaries & Constraints

**Always:** Le slug reste l'identifiant stable : `recipes.catalog_slug` continue de le référencer, sans clé étrangère. Un plat retiré laisse sa recette orpheline, comme aujourd'hui. L'ordre d'affichage actuel est conservé. Les intitulés d'objectif (`CATALOG_GOAL_LABELS`, `CATALOG_GOAL_NOTES`) restent dans le code : ce sont des textes d'interface, pas des données. Le script de recopie se rejoue sans créer de doublon (upsert sur le slug). Il faut migrer et recopier avant de déployer.

**Never:** Pas de colonne image, pas de nouveau plat, pas de changement d'API, de contrat OpenAPI ni d'app Android. Pas de filtre utilisateur : le catalogue est commun à tous, ce n'est pas une donnée personnelle, donc la page de confidentialité ne change pas. Pas de `any`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Écran de choix | `/kitchen/catalog?goal=lose` | Les 24 mêmes plats, dans le même ordre, avec les mêmes estimations qu'avant | N/A |
| Choix d'un plat | POST `/api/basket` `source: catalog`, slugs valides | Recette installée et mise au panier comme avant | N/A |
| Slug inconnu | POST avec un slug absent de la table | Ignoré, comme `findCatalogMeal` qui rendait `null` | Rapport inchangé |
| Table vide | Migration faite, recopie pas encore lancée | L'écran affiche une liste vide sans planter | N/A |
| Recopie rejouée | `npm run seed:catalog` lancé deux fois | Toujours 72 lignes, valeurs à jour | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/meal-catalog.ts` -- types `CatalogMeal` et `CatalogIngredient`, `MEAL_CATALOG`, `catalogFor`, `findCatalogMeal`, `allCatalogMeals`, libellés. On garde les types et les libellés ; les fonctions de lecture partent côté serveur.
- `apps/web/src/lib/catalog/{lose,maintain,gain}.ts` -- les données, 24 plats chacun, sans slug en double entre fichiers. Source de la recopie, puis à supprimer.
- `apps/web/src/server/db/schema.ts` -- `recipes.catalogSlug` (vers la ligne 371) ; c'est ici qu'on ajoute la nouvelle table, dans le style des autres (commentaires en français, `pgTable`).
- `apps/web/src/server/services/catalog.ts:135` -- `findCatalogMeal(slug)` dans `chooseCatalogMeals`, à remplacer par une seule lecture des slugs demandés.
- `apps/web/src/app/kitchen/catalog/page.tsx:70` -- `catalogFor(goal)` en synchrone, à remplacer par une lecture asynchrone (composant serveur).
- `apps/web/src/app/kitchen/catalog/CatalogPicker.tsx` -- ne garde que l'import des libellés ; on n'y touche pas.
- `apps/web/scripts/verify-catalog.ts` -- lit `MEAL_CATALOG` et réécrit les fichiers avec `--write` (`CATALOG_FILES`, `rewrite`). À adapter pour lire la table et mettre à jour les estimations en base.
- `apps/web/src/server/db/queries/basket.ts` -- modèle de module de requêtes (`import 'server-only'`, `db()`, `schema`).
- `apps/web/drizzle/` -- migrations générées par `npm run db:generate` (dernière : `0019`), appliquées à la main avec `npm run db:migrate`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/server/db/schema.ts` -- ajouter `catalog_meals` : `slug` (clé primaire), `goal` (check lose/maintain/gain), `position`, `name`, `slot`, `servings`, `prep_minutes`, `steps text[]`, `ingredients jsonb` typé `CatalogIngredient[]`, `estimate_kcal`, `estimate_protein_g`, index (`goal`, `position`) -- une ligne par plat ; les ingrédients en jsonb parce qu'ils n'existent pas hors de leur plat.
- [x] `apps/web/drizzle/0020_*.sql` -- générer avec `npm run db:generate`.
- [x] `apps/web/src/server/db/queries/catalog.ts` -- `catalogMealsFor(goal)` et `catalogMealsBySlugs(slugs)`, qui rendent des `CatalogMeal` -- point d'accès unique.
- [x] `apps/web/scripts/seed-catalog.ts` + script `seed:catalog` dans `package.json` -- recopier `MEAL_CATALOG` avec la position = rang dans le fichier, upsert sur le slug -- recopie unique, rejouable.
- [x] `apps/web/src/server/services/catalog.ts`, `apps/web/src/app/kitchen/catalog/page.tsx` -- passer aux requêtes.
- [x] `apps/web/scripts/verify-catalog.ts` -- lire la base ; `--write` fait un `update` des estimations.
- [x] Après une recopie vérifiée : supprimer `src/lib/catalog/*.ts` et `MEAL_CATALOG`, `catalogFor`, `findCatalogMeal`, `allCatalogMeals` ; le script de recopie lit alors les fichiers depuis le commit parent, ou bien on le supprime aussi (voir Design Notes).
- [x] `README.md` -- documenter l'ordre migrate → seed.

**Acceptance Criteria:**
- Given la base migrée et recopiée, when on compte `catalog_meals`, then on trouve 24 plats par objectif, et chaque champ est identique à celui des fichiers d'origine.
- Given `npm run verify:catalog`, when on le lance, then il rend compte depuis la base avec les mêmes résultats qu'avant.
- Given le dépôt, when on cherche `src/lib/catalog/`, then le dossier n'existe plus.

## Design Notes

Comme les fichiers sont supprimés, le script de recopie n'a plus de source après l'étape 1. On le garde le temps d'une exécution réussie, puis il part dans le même commit que les fichiers : la base devient la seule source, et l'historique git garde l'ancienne. Les plats de l'étape 3 entreront par un script d'import de données. Ce sera décidé à cette étape.

## Verification

**Commands:**
- `npm run db:generate && npm run db:migrate` -- expected: table créée
- `npm run seed:catalog` (deux fois) -- expected: 72 lignes, aucun doublon
- `npm run verify:catalog` -- expected: code de sortie 0, aucun terme introuvable
- `npm run build && npm run lint` -- expected: aucune erreur ni warning

**Manual checks:**
- `/kitchen/catalog` sur les trois onglets : mêmes plats, même ordre ; ajouter un plat au panier fonctionne.
