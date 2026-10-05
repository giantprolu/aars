# Modération de la Communauté

État au 06/10/2026 : `feat/moderation-core` (en production) et
`feat/moderation-admin`, les deux premières étapes validées le 05/10/2026. Ce
document dit ce qui est fait, et ce qui ne l'est pas encore.

## Décisions

- **Aucune IA, aucun service tiers.** Détection locale : règles, lexique
  classé, listes ouvertes, analyse des liens. Un autre détecteur pourra se
  brancher derrière `ModerationProvider` (`src/server/moderation/providers.ts`)
  sans rien changer au reste.
- **Les sanctions ne touchent que la Communauté.** Journal, pesées, séances,
  export restent ouverts à tout le monde, sanctionné ou non.
- **L'automatique s'arrête à masquer + 7 jours de restriction.** Suspension et
  bannissement sont proposés dans le dossier et décidés par un humain.
- **La politique est du code versionné** (`src/lib/moderation/config.ts`,
  `POLICY_VERSION`), relu et déployé comme le reste. Chaque décision enregistre
  la version sous laquelle elle a été prise.
- **Un détecteur classe, le moteur de politique décide** : détection → score →
  politique déterministe → action. Rien ne sanctionne directement.

## Ce qui est modéré

Seulement ce que d'autres comptes peuvent voir, au moment où ça le devient :

| Texte | Visible par | Vérifié quand | Si refusé |
|---|---|---|---|
| Pseudo et nom affiché | tous, par la recherche | à l'enregistrement | non enregistré, message à la personne |
| Nom d'un modèle de séance | abonnés acceptés | au premier partage d'une séance, et au renommage d'un modèle déjà partagé | partage fait, le fil montre « Séance » |
| Nom d'un exercice saisi à l'import | **tous** (catalogue commun) | à sa création | séance enregistrée, exercice masqué du catalogue |
| Note d'un signalement | l'équipe | à la réception | jamais sanctionnée, sert à la priorité |

Les séances privées, le journal, les repas et le poids ne passent jamais par
la modération.

## Pipeline

```
texte public ─► normalisation ─► règles locales + liens ─► contexte ─► score
   (NFKC, invisibles, homoglyphes, leet,      (humour, idiomes,     │
    lettres espacées, répétées, masquées)      jargon de salle)     ▼
signalements ─► poids (confiance) ─► vague coordonnée ? ──► moteur de politique
                                                                    │
                       dossier ◄─ détections ◄─ audit ◄─ action ◄───┘
                       (file humaine P0–P4)     (chaîné)   (masquer, strike, sanction)
```

Fichiers :

- `src/lib/moderation/` (fonctions pures, testées sans base) :
  `types.ts`, `config.ts` (toute la politique), `normalize.ts`, `lexicon.ts`,
  `wordlists.ts`, `links.ts`, `rules.ts`, `score.ts`, `policy.ts`,
  `strikes.ts`, `trust.ts`, `reports.ts`, `messages.ts`
- `src/server/moderation/` : `providers.ts`, `pipeline.ts`, `reports.ts`,
  `standing.ts`, `rate-limit.ts`, `retention.ts`, `log.ts`
- `src/server/db/queries/moderation.ts` : toutes les lectures et écritures
- Branchements : `services/social.ts` (pseudo, suivi, bravos, partage,
  signalement), `services/workouts.ts` (import, renommage),
  `queries/social.ts` (exclusion de la recherche et du fil, noms masqués),
  `app/api/users/route.ts` (limite d'inscriptions)

## Schéma (migration 0026, ajouts seulement)

- `moderation_cases` : un dossier par cible (`user`, `session`,
  `template_name`, `exercise_name`), un seul ouvert à la fois (index unique
  partiel). Catégorie, gravité, score, niveau, priorité, statut (`open`,
  `triaged`, `under_review`, `action_taken`, `dismissed`, `appealed`,
  `resolved`), drapeaux, justification interne (`explanation`), action
  proposée, texte en cause (`content_snapshot`), version de politique.
- `moderation_signals` : chaque détection versée au dossier, sans texte.
- `moderation_sanctions` : `strike`, `warning`, `restriction`, `suspension`,
  `ban`, avec poids, début, fin, levée, annulation (`voided`) et auteur.
- `moderation_audit` : journal en ajout seul (voir Audit).
- `rate_limit_hits` : compteurs des limites de fréquence.
- Colonnes ajoutées : `social_reports.status`, `.case_id`, `.weight` ;
  `workout_templates.name_reviewed_at`, `.name_hidden_at` ;
  `exercises.hidden_at`.

## Matrice catégorie → niveau → action

Niveaux du score : SAFE < 0,20 ≤ LOW < 0,40 ≤ MEDIUM < 0,60 ≤ HIGH < 0,80 ≤
SEVERE < 0,95 ≤ CRITICAL.

| Catégorie | Revue dès | Masqué dès | Strike | Plancher | Priorité |
|---|---|---|---|---|---|
| Harcèlement | MEDIUM | HIGH | oui | — | P3 → P0 |
| Haine | LOW | MEDIUM | oui | — | P4 → P0 |
| Menace | LOW | HIGH | oui | SEVERE : 7 jours de restriction | P3 → P0 |
| Sexuel | MEDIUM | HIGH | oui | — | P3 → P1 |
| Mineurs | toujours | toujours (confiance ≥ 0,4) | si confiance ≥ 0,85 | SEVERE : 7 jours | **P0** |
| Spam | MEDIUM | MEDIUM | oui | — | P4 → P3 |
| Arnaque, usurpation | MEDIUM | MEDIUM | oui | — | P3 → P1 |
| Publicité | HIGH | HIGH | non | — | P4 |
| Auto-agression, TCA | LOW | HIGH | **jamais** | — | P3 → P0, message 3114 |
| Ventes interdites | MEDIUM | MEDIUM | oui | — | P3 → P1 |

Masquer exige aussi une confiance minimale (0,6 à 0,7 selon la catégorie) :
en dessous, revue seulement.

## Score de risque

```
contenu    = confiance × poids de la gravité (low 0,35 … critical 1), pire catégorie
récidive   = contenu × min(0,3 ; 0,1 × strikes amortis)
série      = +0,15 si 3 dossiers de la même catégorie en 24 h
déguisement= +0,10 ; compte de moins de 7 jours = +0,05
signalements = min(0,3 ; 0,1 × log2(1 + poids crédible)), ×0,25 si vague coordonnée
score      = somme, bornée à [0, 1]
```

Les majorations n'existent que si un contenu est détecté : un récidiviste qui
écrit un nom anodin ne présente aucun risque. Les signalements seuls
plafonnent à 0,30 (LOW) : ils ouvrent une revue, jamais une sanction.

## Strikes

Poids : medium 0,5 ; high 1 ; severe 2 ; critical 3 ; moitié si le contenu
est refusé avant d'avoir été montré. Un dossier ne vaut qu'un strike, quel
que soit le nombre de rejeux. Amortissement : demi-vie de 90 jours.

| Total amorti | Action | Automatique |
|---|---|---|
| ≥ 1 | avertissement | oui |
| ≥ 2 | restriction 24 h | oui |
| ≥ 3 | restriction 7 jours | oui (plafond) |
| ≥ 4 | suspension 30 jours | proposée, P1 |
| ≥ 6 | bannissement de la Communauté | proposé, P1 |

Restriction : plus de partage, de demande de suivi ni de bravo ; le nom
reste modifiable. Suspension et bannissement : en plus, invisible de la
recherche, du fil des autres et des demandes de suivi.

## Score de confiance (interne, jamais montré)

Il ne sert qu'à pondérer les signalements faits par un compte. Il ne lit ni
le journal, ni le poids, ni le profil.

| Facteur | Contribution |
|---|---|
| Base | +0,50 |
| Ancienneté | jusqu'à +0,20 à 30 jours |
| Pseudo choisi | +0,05 |
| Abonnés acceptés | jusqu'à +0,10 à 5 abonnés |
| Séances partagées terminées | jusqu'à +0,05 à 10 séances |
| Signalements ayant mené à une action | +0,05 chacun, max +0,15 |
| Signalements rejetés | −0,10 chacun, max −0,30 |
| Signalements pris dans une vague coordonnée | −0,10 chacun, max −0,30 |
| Strikes amortis | −0,15 chacun, max −0,45 |

Poids d'un signalement = confiance, × 0,3 si le compte a moins de 7 jours.
Une même personne ne pèse jamais plus d'une fois sur une cible.

## Signalements et vagues

- Limites : 10 signalements par compte et par jour, 3 par cible et par mois.
- Vague coordonnée (fenêtre de 6 h, au moins 3 personnes) : 60 % de comptes
  récents ou peu fiables, ou la même note d'au moins 20 caractères copiée.
  Drapeau `COORDINATED_REPORTING`, poids divisé par 4, revue P2. Jamais une
  preuve, ni dans un sens ni dans l'autre.
- Un signalement rejoué alors qu'il est ouvert répond comme la première fois
  sans rien refaire.
- La note fait monter la priorité (mineur → P0 ; menace, suicide → P1).
- Un pseudo déjà en ligne, signalé, n'est jamais réécrit automatiquement :
  revue seulement.

## Contournement

Détecté : caractères invisibles, homoglyphes cyrillique et grec, leet,
lettres espacées ou répétées, lettres masquées (`c*nnard`), mots collés dans
un pseudo (termes sans ambiguïté), ressemblance avec le pseudo d'un compte
suspendu (`pg_trgm`, drapeau `BAN_EVASION_SUSPECTED`, revue). Limites
d'inscription par empreinte IP. Ce qui ne l'est pas : la recréation d'un
compte sous un nom différent, sans empreinte d'appareil.

## Audit

`moderation_audit`, en ajout seul : un déclencheur numérote chaque ligne sous
verrou et la chaîne à la précédente (SHA-256) ; d'autres refusent toute
modification, toute suppression de moins d'un an et tout `truncate`.
`npm run moderation -- verify-audit` recalcule la chaîne. Le propriétaire de
la base peut retirer les déclencheurs : l'empreinte trahit alors toute
falsification, sans l'empêcher. Événements : `CASE_OPENED`,
`MODERATION_DETECTED`, `MODERATION_CLASSIFIED`, `CONTENT_HIDDEN`,
`CONTENT_REMOVED`, `STRIKE_RECORDED`, `WARNING_ISSUED`, `USER_RESTRICTED`,
`SANCTION_RECOMMENDED`, `REPORT_CREATED`, `REPORT_RATE_LIMITED`,
`COORDINATED_REPORTING_FLAGGED`, `REPORT_RESOLVED`, `RETENTION_PURGED`,
`ACCOUNT_DELETED_BY_MODERATION`, et pour les décisions humaines `CASE_TAKEN`,
`CASE_RESOLVED`, `CASE_DISMISSED`, `REPORT_DISMISSED`, `CONTENT_RESTORED`,
`IDENTITY_RESET`, `ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED`, `SANCTION_LIFTED`. Jamais de texte, de jeton ni d'adresse.

Journaux Vercel : une ligne JSON `{"scope":"moderation",…}` par décision
(numéro de dossier, politique, niveau, action), sans contenu.

## Conservation

Texte d'un dossier : 6 mois après clôture. Dossiers clos : 2 ans. Sanctions
terminées : 2 ans. Signalements clos : 1 an. Audit : 2 ans (jamais moins d'un
an, la base le refuse). Compteurs de fréquence : à leur expiration (≤ 2 jours).
Purge dans la tâche quotidienne `/api/cron/reminders`. Valeurs à faire
valider par un juriste.

## Tests

- `npm run verify:moderation -w @nutri/web` : 41 vérifications unitaires et
  130 cas étiquetés (SAFE, AMBIGUOUS, HARASSMENT, HATE, THREAT, SPAM, SCAM,
  SEXUAL, MINOR_SAFETY, SELF_HARM, ILLEGAL) plus 7 vagues de signalements
  (COORDINATED_ABUSE). Deux limites connues, affichées : une moquerie sans
  mot-clé, un propos haineux sans terme injurieux.
- `npm run verify:moderation-db -w @nutri/web` : 30 vérifications de bout en
  bout sur Postgres en mémoire (PGlite, migrations du dépôt) : refus,
  dossier, audit, strikes, restriction, exclusion, vague de 20 comptes,
  rejeu, limites, import, audit inviolable et falsification détectée, accès
  admin, rétention, export ; et les décisions du tableau de bord : version
  périmée et double clic refusés, classement qui rétablit et annule,
  confirmation, suspension puis levée, permissions par rôle, identité
  réinitialisée, indicateurs.

## Déploiement

1. Appliquer la migration 0026 sur Neon (`npm run db:migrate -w @nutri/web`).
   Additive : tables nouvelles, colonnes nullables, déclencheurs sur la seule
   table d'audit.
2. Pousser `main` après validation.
3. `npm run moderation:scan -w @nutri/web` (aperçu, n'écrit rien), puis
   `-- --apply` pour ouvrir les dossiers des textes déjà en ligne, sans
   sanction.
4. La file : tableau de bord › Modération, ou `npm run moderation -w @nutri/web -- cases`.

Aucune variable d'environnement nouvelle. `SESSION_SECRET` sert aussi de
clé à l'empreinte IP ; sans lui, la limite d'inscriptions ne s'applique pas.

## Tableau de bord (`apps/admin` › Modération)

- **File** : dossiers ouverts par priorité puis ancienneté, drapeaux (vague
  coordonnée, récidive, contournement, sécurité critique), action proposée.
- **Dossier** : texte en cause (replié derrière un clic pour la sécurité
  critique), état actuel de la cible, personne et toutes ses sanctions avec
  le total amorti, justification (politique, décomposition du score,
  détections), signalements avec le poids de chacun, historique d'audit.
- **Gestes** : prendre en charge ; masquer ou rétablir un nom ; rendre une
  séance privée ; réinitialiser une identité (`membre_<numéro>`) ; avertir,
  restreindre 1 ou 7 jours, suspendre 30 jours, bannir ; lever une sanction
  ou annuler un strike ; confirmer et clore (les signalements comptent pour
  la confiance de leurs auteurs) ; classer sans suite (contenu rétabli,
  strikes annulés, restrictions automatiques levées, signalements rejetés).
- **Versions** : chaque décision renvoie la version du dossier lue à
  l'affichage ; si le dossier a bougé entre-temps (autre décision, nouveau
  signalement, double clic), le serveur répond 409 et rien n'est écrit.
- **Auteur** : la session du tableau de bord retient le nom de la passkey
  qui l'a ouverte, transmis en `x-admin-actor` et inscrit dans l'audit
  (`admin:Macbook`). Une session ouverte avant ce changement signe `admin`.
- **Indicateurs** (7, 30, 90 jours) : dossiers ouverts et part d'urgents,
  actions automatiques, faux positifs connus (action automatique puis
  classement sans suite), délai moyen de décision, confirmés et classés,
  signalements suivis d'effet ou rejetés, vagues et refus de fréquence,
  sanctions automatiques et humaines, sanctions en cours.

Routes : `GET /api/admin/moderation/queue`, `GET /api/admin/moderation/metrics`,
`GET|POST /api/admin/moderation/cases/:id`, `POST /api/admin/moderation/sanctions/:id`.
Les anciennes routes `/api/admin/reports` sont retirées : seul le tableau de
bord les lisait, et il est déployé avec le serveur.

## Rôles (`src/lib/moderation/rbac.ts`)

| Rôle | Peut |
|---|---|
| `moderator` | lire la file et les dossiers, voir le texte, décider, avertir, restreindre |
| `senior_moderator` | en plus : suspendre, réinitialiser une identité, lever une sanction |
| `admin` | en plus : bannir ; la politique, par un commit |
| `trust_and_safety_admin` | tout |

Chaque route vérifie la permission du geste. Aujourd'hui, une seule clé et
un seul rôle (`admin`) : ajouter un modérateur demandera de lui donner une
identité propre et un rôle, sans toucher aux routes.

## Pas encore fait

- **Appels** (`feat/moderation-appeals`) : avis de sanction et appel dans
  l'API, iOS, Android et la PWA. En attendant, la politique de
  confidentialité renvoie vers l'adresse de contact.
- **Comptes de modérateurs** : une seule identité d'administration (mot de
  passe et passkeys) ; les rôles sont prêts, pas les comptes.
- **Exercices importés** visibles de tous (`feat/exercise-ownership`) : la
  modération masque les noms injurieux, mais un nom anodin et personnel
  (« rééduc genou ») reste exposé à tout le monde.
- Pas de réputation de domaine (âge, listes noires) : les liens sont jugés
  sur leur forme.

## Risques connus

- Le lexique et les règles sont publics (dépôt public) : on peut les lire
  pour les éviter. La normalisation déjoue les déguisements courants, pas
  une paraphrase.
- Une phrase hostile sans mot-clé passe (voir les limites du jeu de cas).
- Des listes ouvertes, seuls les mots longs ou en écriture non latine
  comptent hors du français et de l'anglais, pour éviter « mal », « and »,
  « pot » ; un mot grossier court dans une autre langue passe.
- Le dossier part avec le compte supprimé : un compte visé peut effacer son
  dossier en supprimant son compte (l'audit, réduit à des numéros, reste).

## Crédits

Listes de mots : « List of Dirty, Naughty, Obscene, and Otherwise Bad
Words », LDNOOBW (https://github.com/LDNOOBW), sous licence CC-BY-4.0, via le
paquet npm `naughty-words`. Filtrées : mots ordinaires retirés, longueur
minimale hors français et anglais (`src/lib/moderation/wordlists.ts`).
