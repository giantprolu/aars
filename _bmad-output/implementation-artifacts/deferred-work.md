- source_spec: none
  summary: Photos des plats du catalogue stockées dans Vercel Blob (sources libres type Pexels), URL servie par l'API et affichée sur la PWA et l'app Android, recettes installées retrouvant leur photo via catalog_slug.
  evidence: Découpage demandé le 02/10/2026 en trois étapes ; dépend du catalogue déplacé en base (étape 1).
- source_spec: none
  summary: Ajouter 16 plats par objectif (lose, maintain, gain) au catalogue, en données et avec leur photo, macros vérifiées par verify:catalog.
  evidence: Découpage demandé le 02/10/2026 en trois étapes ; vient après le catalogue en base et les photos.
- source_spec: `_bmad-output/implementation-artifacts/spec-catalogue-en-base.md`
  summary: Couvrir par un test automatisé l'ordre rétabli, le dédoublonnage et l'abandon des slugs inconnus dans chooseCatalogMeals.
  evidence: Aucun harnais de test avec base dans apps/web ; vérifié à la main le 02/10/2026 (POST /api/basket → 201, slug inconnu ignoré).
