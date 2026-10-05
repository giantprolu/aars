# Aars admin

Le tableau de bord d'Aars, pour l'équipe seulement : une app web à part
(Next.js 15, shadcn/ui), utilisable sur ordinateur et sur téléphone. Elle ne
touche pas à la base : elle parle au serveur Aars par `/api/admin/*`.

| Écran | Ce qu'il fait |
|---|---|
| Vue d'ensemble | comptes, actifs du jour / 7 j / 30 j, recettes, repas planifiés, signalements, abonnés, courbe des actifs |
| Usage | compteurs par jour (ouvertures, objectifs, Santé, repas par méthode), sur 7, 30 ou 90 jours |
| Abonnés | abonnés actifs, part des comptes, Cuisine+ (zéro tant que la vente est fermée) |
| Recettes sans photo | les recettes écrites ou importées, sans dire à qui ; leur prompt Gemini à copier ; ajouter, changer ou retirer une photo |
| Catalogue | les 120 plats, ceux sans photo d'abord ; prompt Gemini à copier ; poser une photo |
| Modération | signalements à traiter et clos ; clore, rendre une séance privée |
| Sécurité | passkeys (ajouter, révoquer), déconnexion |

Supprimer un compte reste à `npm run moderation`, avec sa confirmation.

Les prompts suivent `docs/prompts-photos-plats.md` (`src/lib/prompts.ts`) :
style commun puis le plat, en un seul texte à coller dans Gemini (Nano
Banana). À l'envoi, chaque photo perd 6 % sur chaque bord, ce qui retire
l'étoile que Gemini pose dans un coin.

## Sécurité

- **Deux facteurs à chaque connexion** : le mot de passe admin, puis une
  passkey (WebAuthn, avec vérification de l'utilisateur : visage, empreinte
  ou code de l'appareil). Le mot de passe seul n'ouvre rien.
- Chaque mot de passe faux coûte 1,5 s ; la comparaison est en temps constant.
- Session de 8 h en cookie `__Host-`, HttpOnly, Secure, SameSite=Strict, signé
  en HMAC-SHA256. Changer `ADMIN_PASSWORD` ferme toutes les sessions.
- La première passkey s'enregistre avec le mot de passe, tant qu'il n'y en a
  aucune ; les suivantes demandent une session complète. La dernière ne se
  révoque pas.
- Politique de contenu stricte avec un nonce par requête, `frame-ancestors
  'none'`, HSTS, `no-referrer`, `noindex`, rien en cache.
- La clé `ADMIN_API_KEY` ne quitte jamais le serveur du tableau de bord ; sans
  elle, le serveur Aars répond 404 sur `/api/admin/*`.

## Mettre en ligne (une fois)

1. **Secrets** : dans un terminal, trois fois `openssl rand -hex 32` (clé
   d'API, secret de session), et un mot de passe admin d'au moins 16
   caractères (une phrase de passe convient).
2. **Projet Aars existant** (Vercel › aars › Settings › Environment
   Variables, Production) : `ADMIN_API_KEY` = la clé, et vérifier que
   `BLOB_READ_WRITE_TOKEN` existe (Storage › le magasin Blob › Connect to
   project, sinon). Redéployer.
3. **Nouveau projet** : Vercel › Add New › Project › importer
   `giantprolu/aars`, **Root Directory** `apps/admin`, nom `aars-admin`.
   Variables (Production) :

   | Variable | Valeur |
   |---|---|
   | `ADMIN_PASSWORD` | le mot de passe admin |
   | `ADMIN_SESSION_SECRET` | un secret aléatoire |
   | `ADMIN_API_KEY` | la même clé qu'à l'étape 2 |
   | `API_URL` | `https://aars-app.vercel.app` |
   | `ADMIN_ORIGIN` | `https://aars-admin.vercel.app` (l'adresse exacte du projet) |

   Ne pas changer `ADMIN_ORIGIN` ensuite : les passkeys y sont attachées.
4. **Première connexion**, depuis le téléphone ou l'ordinateur qui servira :
   mot de passe, puis « Enregistrer ma passkey ». Ajouter tout de suite une
   deuxième passkey (autre appareil) dans Sécurité, pour ne pas dépendre d'un
   seul.

## En local

```
API_URL=http://localhost:3000 ADMIN_ORIGIN=http://localhost:3200 \
ADMIN_PASSWORD=… ADMIN_SESSION_SECRET=… ADMIN_API_KEY=… \
  npm run admin:dev
```

avec la même `ADMIN_API_KEY` dans `apps/web/.env.local` pour `npm run dev`.

## Vérifier

`npm run admin:build` et `npm run admin:lint` passent sans erreur. Le parcours
complet (mot de passe, passkey, écrans, déconnexion, reconnexion) a été joué
le 05/10/2026 dans Chrome avec l'authentificateur virtuel de DevTools.
