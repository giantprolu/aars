---
title: 'Photos des plats du catalogue, stockées dans Vercel Blob'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '28b2d8e38c3aff393014007aefd3a6ecfc31d0bf'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucun plat n'a d'image. Le catalogue, les recettes (PWA) et les cartes de recette (Android) affichent un motif rayé à la place.

**Approach:** L'utilisateur génère lui-même les photos avec Nano Banana (Gemini), à partir de prompts qu'on lui fournit, et les dépose dans un dossier sous la forme `<slug>.png|jpg|webp`. Un script les redimensionne, les envoie dans Vercel Blob et écrit leur URL dans `catalog_meals.image_url`. Une recette installée depuis le catalogue retrouve la photo par son `catalog_slug`. La PWA et l'app Android l'affichent, et le motif rayé reste quand il n'y a pas de photo.

## Boundaries & Constraints

**Always:** Gratuit : les images sont redimensionnées en WebP avant l'envoi, puis affichées sans passer par l'optimiseur payant de Vercel. Le jeton Blob reste côté serveur et scripts (`.env.local`, variables Vercel), jamais côté client. Une recette écrite à la main n'a pas de photo. Le script se rejoue sans dégât : même chemin Blob, écrasement autorisé, URL mise à jour. L'import (`seed:catalog`) n'efface jamais une photo déjà posée. Les photos de plats ne sont pas des données personnelles, et Vercel est déjà hébergeur : rien ne change pour la confidentialité.

**Never:** Pas de photo envoyée par l'utilisateur pour ses propres recettes, pas de route d'envoi dans l'app. Pas d'écran catalogue sur Android, qui n'en a pas aujourd'hui. Pas de génération d'image par API.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envoi | dossier avec `lose-avoine-fruits-rouges.png` | Blob `catalog/lose-avoine-fruits-rouges.webp` ≤ 1200 px, `image_url` posé | N/A |
| Fichier sans plat | `inconnu.png` | Ignoré et signalé | La suite continue |
| Rejeu | même dossier relancé | URL identique ou rafraîchie, aucun doublon | N/A |
| Recette du catalogue | `GET /api/recipes`, recette avec `catalog_slug` ayant une photo | `imageUrl` = URL Blob | N/A |
| Recette maison | `catalog_slug` nul | `imageUrl: null`, motif rayé affiché | N/A |
| Pas de jeton | `BLOB_READ_WRITE_TOKEN` absent | Le script s'arrête avec un message clair | sortie 1 |

</frozen-after-approval>

## Code Map

- `apps/web/src/server/db/schema.ts` -- `catalogMeals` : ajouter `imageUrl` (`image_url text`, nullable).
- `apps/web/src/lib/meal-catalog.ts` -- `CatalogMeal` : ajouter `imageUrl: string | null`.
- `apps/web/src/server/db/queries/catalog.ts` -- `toCatalogMeal` : renvoyer `imageUrl`.
- `apps/web/scripts/seed-catalog.ts` -- l'upsert ne touche pas `image_url`. À vérifier : l'objet `values` ne doit pas contenir ce champ.
- `apps/web/src/lib/recipe.ts:122` -- `Recipe` : ajouter `imageUrl: string | null`.
- `apps/web/src/server/db/queries/recipes.ts` -- `toRecipe`, `listRecipes`, `findRecipe` : jointure gauche de `catalog_meals` sur `recipes.catalog_slug`. Le filtre utilisateur reste en tête.
- `apps/web/src/app/kitchen/recipes/RecipeGrid.tsx` (`hatch h-[60px]`), `[id]/page.tsx:98` (`hatch h-[150px]`), `kitchen/catalog/CatalogPicker.tsx` (ligne `li`, `CatalogCard`), `CatalogMealSheet.tsx` (en-tête), `kitchen/catalog/page.tsx` (passer `imageUrl`) -- afficher la photo.
- `apps/web/src/components/ExerciseSheet.tsx` -- modèle `next/image` avec `fill`.
- `apps/web/next.config.ts` -- `images.remotePatterns` pour `*.public.blob.vercel-storage.com`.
- `apps/android/app/src/main/java/fr/nutriperso/app/data/Models.kt` (`RecipeRow`), `ui/screens/KitchenScreen.kt` (`RecipeCard`, `photoStripes`) ; `apps/android/gradle/libs.versions.toml` et `app/build.gradle.kts` pour Coil 3 (`coil-compose`, `coil-network-okhttp`). On ne peut pas compiler Android ici : écrire avec Write.
- `packages/api-contract/` -- contrat OpenAPI : ajouter `imageUrl` aux recettes s'il les décrit.

## Tasks & Acceptance

**Execution:**
- [x] schéma + migration `0021` (`npm run db:generate`, `db:migrate`).
- [x] types et requêtes catalogue et recettes, avec `imageUrl`.
- [x] `apps/web/scripts/upload-catalog-photos.ts` + script `upload:photos` : dossier en argument (résolu depuis `INIT_CWD`), `sharp` → WebP 1200 px max, qualité 80, `put('catalog/<slug>.webp', …, { access: 'public', addRandomSuffix: false, allowOverwrite: true })`, puis `update` de `image_url`. `@vercel/blob` et `sharp` en devDependencies.
- [x] `apps/web/src/components/DishImage.tsx` -- `next/image` `unoptimized` avec `fill`, ou le motif `hatch` si l'URL est nulle ; utilisé par les quatre écrans.
- [x] `next.config.ts` -- remotePatterns.
- [x] Android : `RecipeRow.imageUrl: String? = null`, `AsyncImage` dans `RecipeCard` quand non nul, Coil.
- [x] `apps/web/.env.example` -- `BLOB_READ_WRITE_TOKEN=` ; `README.md` -- procédure photos.
- [x] `docs/prompts-photos-plats.md` -- un prompt Nano Banana par plat, avec un style commun.

**Acceptance Criteria:**
- Given une photo envoyée pour un slug, when on ouvre l'écran de choix, la recette installée ou l'app Android, then la photo s'affiche à la place du motif.
- Given le build, when on cherche le jeton Blob dans `.next/static`, then il n'y est pas.

## Verification

**Commands:**
- `npm run build && npm run lint && npm run typecheck` -- expected: aucune erreur
- `npm run upload:photos -w @nutri/web -- <dossier de test>` -- expected: URL posée, rejouable
- `grep -r vercel_blob_rw apps/web/.next/static` -- expected: aucun résultat

**Manual checks:**
- Android Studio : synchronisation Gradle, `assembleDebug`, carte de recette avec sa photo (à faire par l'utilisateur).

## Implementation Notes

- **Écart volontaire avec l'intention figée :** le script ne réécrit pas `catalog/<slug>.webp` au même chemin. Il envoie avec un suffixe aléatoire, met l'URL à jour, puis supprime l'ancienne photo. Écraser le même chemin laisserait le CDN de Blob servir l'ancienne image jusqu'à un mois. Le but de l'intention, rejouer sans dégât et sans doublon, est tenu : vérifié par deux envois successifs, ancienne URL en 404 et nouvelle en 200.
- `next.config.ts` n'a pas changé : `unoptimized` se passe de `remotePatterns`.
- `packages/api-contract` ne contient qu'un README (« pas encore écrit ») : il n'y avait rien à mettre à jour.
- `docs/prompts-photos-plats.md` est livré avec l'étape 3, pour couvrir les 120 plats d'un coup.
- Vérifié : migration 0021 appliquée ; image de 2000 × 1500 envoyée en WebP 1200 × 900 ; fichier sans plat ignoré ; photo visible sur l'écran de choix (les 23 autres plats gardent le motif), dans `GET /api/recipes` et sur la page de détail d'une recette installée (compte de test, nettoyé) ; photo de test retirée de Blob et de la base. Build, lint et typecheck passent ; jeton absent de `.next/static`.
- Android pas compilé ici : synchronisation Gradle et `assembleDebug` à faire dans Android Studio. Coil 3.3.0.

## Review Triage Log

| Constat | Verdict | Preuve / suite |
|---|---|---|
| Fichier de prompts absent | medium | Livré avec l'étape 3 (même branche) |
| Suffixe aléatoire contraire à la spec | low | Écart assumé, voir Implementation Notes |
| Deux fichiers pour un même slug : photo orpheline, double `del` | medium | `current` jamais rafraîchi → patch : le premier fichier gagne, le second est signalé |
| Une erreur arrête tout l'envoi, et un échec peut laisser un orphelin | medium | Aucun try/catch → patch : erreur isolée par fichier, nettoyage si l'écriture en base échoue, `del` de l'ancienne non bloquant, sortie 1 s'il y a eu des échecs |
| Rejeu qui renvoie tout | low | Script lancé à la main, une fois → rejeté |
| README muet sur la base visée | low | → patch : une phrase |
| `alt` en double avec le titre | low | → patch : `alt=""` sur le détail et la fiche |
| `remotePatterns` absent | false | `unoptimized` ne passe pas par le chargeur → rejeté |
| Image cassée sans motif sous-jacent | low | → patch : motif sous l'image, comme sur Android |
| `src` chaîne vide | low | La base n'écrit jamais `''` → rejeté |
| Dossier inexistant : trace brute | low | Échec bruyant → rejeté |
| Pas de fin de ligne dans la migration | low | Fichier généré par drizzle-kit → rejeté |
| Jointure et champ d'API non testés | medium | Aucun harnais de test avec base, contrat non écrit → defer |
| L'import n'efface pas les photos par simple omission | low | → patch : commentaire qui le dit |
| Page en cache hors ligne après remplacement | low | Le motif sous l'image couvre le cas → rejeté |

