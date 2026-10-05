# Recette d'Aars

Ce qu'il faut vérifier, et comment, avant et après chaque mise en production.
Les testeurs (et l'auteur) utilisent **la PWA** : c'est elle qui ne doit
jamais casser (règles dans `CLAUDE.md`, *Mise en production*).

Production : `https://aars-app.vercel.app` (ancienne adresse
`https://nutri-rosy-one.vercel.app`, toujours servie).

## 1. Test automatique de la production (2 minutes)

```
npm run smoke:prod -w @nutri/web
```

Une autre adresse : `npm run smoke:prod -w @nutri/web -- https://…`.
Les déploiements de test de `bmad/dev` sont protégés par l'authentification
Vercel : le script ne passe que sur une adresse de production.

Le script (`apps/web/scripts/smoke-prod.ts`) crée un compte jetable, l'exerce
puis le supprime, même en cas d'échec. Il n'écrit rien qu'un testeur verrait
(ni profil Communauté, ni séance partagée, ni signalement) et ne lance pas la
reconnaissance photo, qui coûte. Dernier passage : 05/10/2026, 92 sur 92.

| Domaine | Ce qu'il vérifie |
|---|---|
| Public | `/unlock`, pages légales, `/recover`, manifeste au nom Aars, sur les deux adresses ; API fermée sans session |
| Compte | inscription, profil, code de secours, export (`aars-export-1`), déconnexion, reconnexion, suppression |
| Journal | recherche CIQUAL, ajout, journal du jour, historique, raccourcis, ajout rapide, favori, suppression, pesée |
| Cuisine | recette créée avec un moment et relue, catalogue sur 4 moments, plat ajouté aux recettes, panier, plan, « Remplir la semaine » sur 4 moments, liste de courses, import de recette par lien |
| Achats | vente fermée (`salesOpen: false`) et tout ouvert (`premium: true`) |
| Sport | accueil, exercices, préférences, progression, séance libre ouverte puis supprimée |
| Communauté | accueil et fil, en lecture seule |
| Sources | Open Food Facts (recherche, code-barres Nutella) |
| Pages | 32 pages de la PWA rendues pour un compte connecté (toutes sauf `/offline`, `/recover/reset`, une séance en cours, la progression d'un exercice) |

Une ligne `!` (attention) vient en général d'une source extérieure (Open Food
Facts, le site de la recette importée) : relancer avant de chercher plus loin.

## 2. Ce que le script ne voit pas : à tester à la main sur la PWA

À faire avec un vrai téléphone, sur la production, après une mise en
production qui touche l'écran concerné.

**Installation et affichage**
- [ ] iPhone : Safari › Partager › Sur l'écran d'accueil, l'icône et le nom « Aars »
- [ ] Android : Chrome › Installer l'application
- [ ] Thème clair, sombre, auto (Réglages › Apparence)
- [ ] Page hors ligne : mode avion, ouvrir l'app

**Journal**
- [ ] Ajouter un aliment par la recherche, le modifier, le supprimer
- [ ] Scanner un code-barres avec la caméra (Ajouter › Scanner)
- [ ] Ajouter un repas favori, puis le rejouer un autre jour
- [ ] Saisie manuelle (kcal et macros)
- [ ] Reconnaissance photo : masquée ou fonctionnelle selon les crédits
- [ ] Pesée, puis la courbe dans Progression

**Cuisine** (tout est gratuit tant que la vente est fermée)
- [ ] Plan : quatre colonnes Petit-déj, Déjeuner, Dîner, Collation, noms lisibles sur un téléphone
- [ ] « Remplir la semaine » sur le Plan : petits-déjeuners et collations reçoivent leurs propres
      plats, jamais un plat du dîner ; sans badge ni offre Cuisine+
- [ ] Recettes : filtre par moment, bouton « Catalogue de plats »
- [ ] Éditeur de recette : choisir un moment, le retrouver après enregistrement
- [ ] Catalogue : filtrer par moment, choisir des plats pour la semaine
- [ ] Importer une recette par lien, la relire, l'enregistrer
- [ ] Plus de 10 recettes et 10 favoris sans blocage
- [ ] Mode cuisine pas à pas, avec minuteur
- [ ] Liste de courses : cocher, scanner en rayon

**Sport**
- [ ] Composer une séance, la faire, la terminer
- [ ] Importer une séance, voir la progression d'un exercice

**Communauté** (à deux comptes de test)
- [ ] Créer son identifiant, suivre l'autre compte, voir son fil
- [ ] Partager une séance, réagir (kudos)
- [ ] Signaler et bloquer : le compte bloqué disparaît

**Compte**
- [ ] Mot de passe oublié avec le code de secours
- [ ] Mot de passe oublié par courriel (seulement si Resend est configuré)
- [ ] Export des données, puis suppression du compte (compte de test)
- [ ] Après un déploiement : toujours connecté, thème conservé

## 3. Avant de pousser `main`

- [ ] Builds verts : web (`npm run build`, `npm run lint`), Android, iOS
- [ ] Migrations nouvelles appliquées sur Neon (`npm run db:migrate`), additives seulement
- [ ] Rien de retiré ni renommé dans l'API ou les cookies
- [ ] Déploiement de test de `bmad/dev` prêt sur Vercel

## 4. Après le push de `main`

- [ ] Vercel › Deployments : le déploiement de production est *Ready*
- [ ] `npm run smoke:prod -w @nutri/web` : aucun `✗`
- [ ] Vercel › Logs, filtre *Errors*, sur la dernière heure : rien de nouveau
      (la lecture des erreurs par le connecteur Vercel a expiré le 05/10/2026,
      d'où la vérification à la main)
- [ ] Les points de la section 2 qui touchent ce qui a changé
- Problème : Vercel › Deployments › le déploiement précédent › *Instant Rollback*

## 5. Tableau de bord (`apps/admin`)

Ses routes demandent la clé admin : le test automatique ne les voit pas. À la
main, après un déploiement qui le touche :
- [ ] Sans session, toute page renvoie à `/login` ; le mot de passe seul n'ouvre rien
- [ ] Mot de passe puis passkey : le tableau de bord s'ouvre
- [ ] Vue d'ensemble et Usage : chiffres et courbes cohérents avec l'app
- [ ] Recettes sans photo : poser une photo, la voir dans l'app de la personne, la retirer
- [ ] Catalogue : poser la photo du plat qui n'en a pas
- [ ] Modération : clore un signalement de test
- [ ] Sécurité : la dernière passkey ne se révoque pas ; déconnexion

## 6. Apps natives (pas encore distribuées)

Elles se construisent (commandes dans `apps/android/README.md` et
`apps/ios/README.md`) mais n'ont jamais tourné sur un vrai téléphone contre la
production. À vérifier le jour où elles partent en test :
- [ ] Connexion, Aujourd'hui, ajout d'un repas, pesée
- [ ] Scanner (caméra), Santé (Health Connect, HealthKit), rappel du déjeuner
- [ ] Moi : pas de ligne Abonnement tant que la vente est fermée
- [ ] Cuisine : « Remplir la semaine » sur 4 moments, import de recette
- [ ] Recettes : filtre par moment, catalogue (fiche d'un plat, ajout aux recettes ou à la semaine)
- [ ] Nouvelle recette : choisir un moment
