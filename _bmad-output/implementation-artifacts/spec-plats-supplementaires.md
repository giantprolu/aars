---
title: '48 plats de plus au catalogue, et leurs prompts photo'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le catalogue propose 24 plats par objectif. L'utilisateur en veut 16 de plus par objectif. Il génère lui-même les photos avec Nano Banana et a besoin d'un prompt par plat.

**Approach:** Les 48 plats entrent comme données, par `npm run seed:catalog` (le catalogue vit en base depuis l'étape 1). Ils gardent la répartition existante, soit 3 petits-déjeuners, 5 déjeuners, 5 dîners et 3 collations par objectif, et des ingrédients résolus dans CIQUAL. Leurs estimations sont recalées par `verify:catalog -- --write`. Un fichier `docs/prompts-photos-plats.md` donne un style commun et un prompt par plat, pour les 120 plats, avec le nom de fichier attendu par `upload:photos`.

</frozen-after-approval>

## Implementation Notes

- Les 48 plats sont écrits dans un JSON hors du dépôt : le catalogue est une donnée, pas du code. Importés : 48 ajoutés, 40 plats par objectif.
- 7 nouveaux termes CIQUAL ont été testés avant l'import : poire crue, pain complet, sauce soja, houmous, pesto, pain de mie, maïs doux. Tous résolvent. `verify:catalog` : 96 termes, 0 introuvable.
- Fourchettes par part respectées après deux ajustements de quantité (dinde-riz complet 507 → 469 kcal, wok de bœuf 1008 → 972). Perte : plats de 336 à 472 kcal, collations de 171 à 189. Maintien : plats de 529 à 686, collations de 272 à 309. Prise de masse : plats de 834 à 986, collations de 673 à 716.
- `verify:catalog -- --write` a recalé aussi les 72 plats d'origine sur leur valeur exacte du jour. Ils étaient déjà dans la tolérance de 5 %.
- `docs/prompts-photos-plats.md` est généré depuis la base par un script jetable, non versionné : style commun, puis un prompt par plat avec `<slug>.png`. Les aromates (huile, épices, sauce soja…) sont retirés de la liste « On distingue ».
- Base visée : celle de `DATABASE_URL` dans `apps/web/.env.local` (Neon `ep-shiny-firefly`). Si la production utilise une autre base, il faut y rejouer la migration et l'import, ou y copier la table.
- Après la revue, deux slugs de nouveaux plats ont été renommés pour coller à leur nom. Ils n'avaient ni photo ni recette installée : `maintain-dahl-pois-chiches` → `maintain-curry-pois-chiches-coco`, `maintain-melange-noix-chocolat` → `maintain-amandes-raisins-chocolat`.
- Rien de neuf à déclarer dans la confidentialité ni dans `PLAY_STORE.md` : des photos de plats génériques ne sont pas des données personnelles, et Vercel est déjà déclaré comme hébergeur.

## Review Triage Log

| Constat | Verdict | Suite |
|---|---|---|
| Lentilles corail absentes de leurs plats | high | Le filtre `ail` attrapait « corail » → patch : filtre ancré en début de libellé |
| Ingrédients invisibles listés (lait, beurre, crème) | medium | → patch : retirés, sauf s'ils sont nommés dans le titre |
| Assaisonnement du titre retiré (cannelle, moutarde…) | medium | → patch : gardé quand le titre le nomme |
| Cadrage uniforme (smoothie, soupes, collations « petites ») | medium | → patch : verre, bol, assiette plate selon le plat ; « portion individuelle » |
| Recadrages de l'app ignorés | medium | → patch : plat centré avec marge, explication dans le mode d'emploi |
| Couleur en hexadécimal dans le prompt | low | → patch : « lin beige clair » |
| Filigrane Gemini | medium | → patch : consigne de recadrage dans le mode d'emploi |
| Libellés CIQUAL trompeurs pour l'image (pain du burger, nouilles) | low | Le nom du plat, en tête du prompt, domine → rejeté |
| « présenté » mal accordé | false | Les prompts ont été réécrits sans ce participe |
| Photos existantes écrasées par un dossier complet | false | Aucun plat n'a encore de photo (`image_url` nul partout) |
| Les 48 plats ne se reconstruisent pas depuis le dépôt | low | La base est la source, comme décidé à l'étape 1 ; une branche Neon la recopie → rejeté |
| Base visée non dite | medium | → patch : noté ci-dessus |
| Spec sans DoD | low | Build et lint inchangés (aucun code), commit local ; push après le test de l'utilisateur, à sa demande → rejeté |
| Slugs qui ne collent plus au nom | medium | → patch : deux nouveaux slugs renommés ; les anciens restent, des recettes peuvent déjà les référencer |

