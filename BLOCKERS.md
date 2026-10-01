# Blocages — NutriPerso

Consigné pendant le sprint BMAD. Chaque entrée dit ce qui manque, ce qui a été
fait pour continuer malgré tout, et ce qui reste à faire côté humain.

## B-1 — Push GitHub impossible — **levé le 11/09/2026**

**Constat.** `ssh -T git@github.com` répond `Permission denied (publickey)`.
Aucune clé dans `~/.ssh`, et `gh` n'est pas installé.

**Contournement.** La branche `bmad/dev` existe en local et reçoit tous les
commits. Le remote `origin` est configuré sur
`git@github.com:giantprolu/nutri-perso.git` mais n'a jamais été joint.

**Résolution.** Le remote pointait sur `giantprolu/nutri-perso`, qui n'existe
pas. Le dépôt réel est `giantprolu/nutri`. `origin` est repassé en HTTPS, où
Git Credential Manager fournit déjà les identifiants : aucune clé SSH n'est
nécessaire. `main` est poussée et suivie.

## B-2 — Aucune base de données — **levé le 11/09/2026**

**Constat.** `DATABASE_URL` n'est pas fournie. Aucune base Neon n'est
provisionnée.

**Contournement.** Le schéma Drizzle, les migrations et les requêtes sont
écrits et compilent. `src/server/db/client.ts` échoue explicitement au premier
appel si la variable manque, plutôt que de se rabattre silencieusement sur des
données factices. Les critères d'acceptation vérifiables sans base (build,
lint, structure) sont tenus ; ceux qui exigent une exécution en base ne le sont
pas.

**Résolution.** Base Neon provisionnée, les quatre migrations sont appliquées,
`pg_trgm` et `unaccent` sont installées. Reste à reporter `DATABASE_URL` dans
`.env.local` et dans les variables d'environnement Vercel.

## B-3 — Aucune clé Mistral — **partiellement levé le 11/09/2026**

**Constat.** `MISTRAL_API_KEY` n'est pas fournie.

**Contournement.** La route `/api/recognize` et le client Mistral sont écrits
derrière une interface. En l'absence de clé, la route répond 503 avec le code
`model_unavailable`, ce que l'interface traite déjà comme une reconnaissance
indisponible.

**Résolution partielle.** La clé est créée et renseignée dans `.env.local`.
`GET /v1/models` répond 200 et liste 46 modèles, la clé est donc valide. Mais
`POST /v1/chat/completions` renvoie 429 « Rate limit exceeded » à chaque appel,
sur quatre tentatives espacées d'une minute. Aucune reconnaissance photo n'est
donc possible pour l'instant.

**À faire côté humain.** Activer l'espace de travail sur console.mistral.ai,
ce qui demande une vérification de numéro de téléphone, puis rejouer l'appel.
Reporter enfin la clé dans les variables d'environnement Vercel.

## B-4 — Fichier CSV CIQUAL absent — **levé le 11/09/2026**

**Constat.** `data/ciqual.csv` n'est pas dans le dépôt. Le fichier vient du site
de l'ANSES et n'est pas récupérable sans intervention humaine (acceptation de
conditions, page de téléchargement).

**Contournement.** `scripts/import-ciqual.ts` accepte un chemin en argument et
détecte les colonnes du CSV de l'ANSES. Il échoue avec un message explicite si
le fichier est absent.

**Résolution.** Le millésime 2025 est publié sur l'entrepôt Recherche Data Gouv
(DOI 10.57745/RDMHWY), téléchargeable sans acceptation de conditions. Le
classeur a été converti en CSV point-virgule dans `data/ciqual.csv`, hors
versionnement. 3484 aliments importés, dont 161 incomplets exclus de la
recherche. L'import a été rejoué deux fois : le total ne bouge pas,
l'idempotence est vérifiée.

Deux écarts du millésime 2025 ont demandé une correction du code d'import :
ses en-têtes remplacent la barre oblique par un retour à la ligne
(« Glucides (g/100 g) » devient « Glucides (g ¶ 100 g) »), et ses libellés
d'aliments contiennent eux aussi des retours à la ligne. Voir B-7.

## B-5 — Identifiant du modèle de vision non vérifié — **levé le 11/09/2026**

**Constat.** `pixtral-12b-2409` est la valeur par défaut de `MISTRAL_MODEL`.
Sa disponibilité sur le niveau gratuit n'a pas pu être confirmée sans clé
d'API. Question ouverte 4 du PRD.

**Contournement.** Le modèle est une variable d'environnement, pas une
constante. En changer ne demande aucune modification de code.

**Résolution.** La liste a été obtenue : `pixtral-12b-2409` n'existe plus, et
aucun modèle `pixtral` ne figure au catalogue. Les modèles de vision encore
publiés sont `mistral-small-latest`, `mistral-medium-latest`, la famille
`ministral` et les modèles OCR. Le défaut du code passe à
`mistral-small-latest`, le moins cher des trois. `mistral-medium-latest` est
la relève si la reconnaissance se révèle trop approximative à l'usage.

La qualité de reconnaissance reste non mesurée : le premier appel réel se
heurte au 429 de B-3.

## B-6 — ESLint figé sur la ligne 9

**Constat.** `eslint-config-next@15.5.25` déclare un pair `eslint ^9`. ESLint 10
est disponible mais sortirait de cette plage. La 9.39.5 retenue affiche un
avertissement de dépréciation à l'installation.

**Contournement.** Aucun. L'avertissement apparaît à `npm install` et jamais à
`npm run lint`, la Definition of Done reste tenue.

**À faire côté humain.** Rien pour l'instant. Le point se résoudra en passant
à Next 16, dont la configuration ESLint suit la ligne 10.

## B-7 — Import CIQUAL cassé par le millésime 2025 — **corrigé le 11/09/2026**

**Constat.** Trois défauts, tous révélés au premier import réel.
`normalizeHeader` ne reconnaissait plus la colonne énergie, l'ANSES ayant
remplacé la barre oblique de ses en-têtes par un retour à la ligne.
`csv-parse` était appelé avec `delimiter: [';', ',']`, ce qui découpait toute
ligne dont le libellé contient une virgule (« Lait, demi-écrémé ») et faisait
échouer l'import dès la ligne 216. Enfin les libellés importés gardaient les
retours à la ligne du tableur.

**Correction.** La barre oblique est traitée comme un séparateur dans
`normalizeHeader`, de sorte que 2020 et 2025 se ramènent à la même clé. Le
séparateur est déduit de l'en-tête au lieu d'être accepté au choix. Les
libellés passent par `cleanLabel`, qui les ramène à une seule ligne.

## B-8 — La recherche trigramme ignorait son index — **corrigé le 11/09/2026**

**Constat.** C'est le balayage séquentiel annoncé en fin de sprint.
`EXPLAIN ANALYZE` sur la recherche donnait un `Seq Scan` à 23 ms sur les 3484
lignes, index GIN jamais retenu, même avec `enable_seqscan = off`. L'expression
indexée n'était pourtant pas en cause : la requête écrivait
`terme <% nutri_normalize(name)`, et GIN n'indexe que l'opérande de gauche.

**Correction.** La clause est écrite `nutri_normalize(name) %> terme`, forme
commutée strictement équivalente (mêmes 8 résultats sur « camembert »). Le
plan passe en `Bitmap Index Scan` sur `ciqual_foods_name_trgm_idx`, à 0,2 ms.

**Reste ouvert.** Une requête de plusieurs mots ne remonte rien si ces mots ne
sont pas contigus dans le libellé : « yaourt » trouve, « yaourt nature » ne
trouve pas, parce que `word_similarity` mesure un extrait continu et que le
seuil est à 0,6. C'est le comportement de FR-18 tel qu'écrit, pas une
régression, mais c'est un point à rejouer à l'usage.

## B-9 — Strava écarté, abonnement payant exigé — **tranché le 11/09/2026**

**Constat.** La documentation développeur de Strava pose la condition sans
ambiguïté : « A Strava subscription is a prerequisite for creating an app ».
Depuis la restructuration de juin 2026, aucune clé d'API n'est délivrée sans
abonnement payant. Deux limites s'y ajoutent : une application nouvelle
n'autorise que le compte de son créateur, et le passage au palier supérieur
plafonne à dix athlètes, ce qui cadre mal avec une inscription libre. Les
calories ne figurent pas non plus dans la liste des activités, seulement sur
le détail de chacune, donc un appel par sortie.

**Décision.** Abandonné. Santé d'Apple reste la seule source d'activité, et
elle couvre déjà les sorties enregistrées sur la montre, Strava compris.

**Trace dans le code.** La colonne `source` de `daily_activity` subsiste, mais
n'accepte plus qu'une valeur. La règle qui interdit de sommer deux sources sur
une même journée est conservée en commentaire : elle redeviendrait nécessaire
si une autre source arrivait un jour.

## B-10 — Santé d'Apple inaccessible depuis le web — **contourné le 11/09/2026**

**Constat.** HealthKit est une interface réservée aux applications natives iOS.
Safari ne l'expose à aucune page, et il n'existe pas d'API web équivalente.
Une PWA n'y a donc structurellement pas accès. Passer natif supposerait un
compte développeur Apple, un Mac pour compiler et une distribution par l'App
Store, exclue par les consignes du projet.

**Contournement.** L'app Raccourcis sait lire un échantillon de santé et
appeler une adresse web. `POST /api/activity` reçoit l'énergie active du jour,
authentifiée par un jeton propre à l'utilisateur, puisqu'un raccourci ne porte
pas de cookie de session. Une automatisation le déclenche chaque soir.

**À faire côté humain.** Fabriquer le jeton depuis les réglages, créer le
raccourci, le programmer. Trois journées envoyées suffisent à basculer la
cible sur la dépense mesurée.

## B-11 — `npm run build` échoue au prérendu de `/unlock` — **circonscrit le 18/09/2026**

**Constat.** `next build` compile et vérifie les types sans erreur, puis casse
à la génération des pages statiques :

```
Could not find files for /_error in .next/build-manifest.json
TypeError: a[d] is not a function
    at Object.c [as require] (.next/server/webpack-runtime.js:1:127)
Error occurred prerendering page "/unlock".
```

`/unlock` est la seule page réellement prérendue ; les autres tiennent d'une
session et sont dynamiques. L'erreur vient du chargeur de modules de webpack,
pas du code de la page.

**Ce qui a été écarté.** L'échec se reproduit sur `HEAD` sans modification en
cours, avec un `.next` supprimé au préalable : ce n'est ni une régression, ni
un artefact du cache de compilation. Les versions installées correspondent au
manifeste (`next 15.5.25`, `react 19.3.0`, `lucide-react 1.47.0`,
`radix-ui 1.6.7`), l'arbre de travail est propre, et `npm run lint` passe.
La page `/unlock` et son formulaire n'ont pas bougé depuis le dernier build
réussi.

**Piste.** Le dépôt vit dans un dossier synchronisé OneDrive. La
synchronisation peut remplacer un fichier de `.next` par un espace réservé
pendant que la compilation le lit, ce qui produit exactement ce genre de
chargeur incomplet. Un `next build` dans un dossier hors OneDrive dirait si
c'est bien la cause.

**Conséquence.** La Definition of Done ne peut pas être tenue tant que le point
n'est pas levé : rien n'est committé. La correction de la barre d'onglets
(passage de `fixed` à `sticky`) attend dans l'arbre de travail, vérifiée par
`npm run lint` et par la vérification des types du build, mais pas par un build
complet.

**Circonscrit.** Vercel compile et déploie la même révision sans rien signaler.
L'échec est donc propre à ce poste, et la piste OneDrive est la bonne : rien
dans le code n'est en cause, et la chaîne de livraison n'est pas menacée.

**Conséquence sur la Definition of Done.** Son premier point ne peut pas être
vérifié ici. `npm run lint` et `npm run typecheck` le sont, et le build de
Vercel fait foi sur la révision poussée.

**À faire côté humain.** Pour retrouver un build local : suspendre la
synchronisation OneDrive le temps de la compilation, ou travailler depuis une
copie du dépôt placée hors du dossier synchronisé. Rien ne presse tant que
Vercel compile.

**Confirmé le 18/09/2026, sur une autre page.** L'échec s'est reproduit au
prérendu de `/offline`, et non plus de `/unlock` : la page qui tombe change
d'une compilation à l'autre, ce qui achève d'écarter le code des pages en
cause. La même erreur (`TypeError: a[d] is not a function`, dans
`webpack-runtime.js`) a été obtenue deux fois de suite sur l'arbre de travail
portant la correction des courses, puis une troisième fois sur l'arbre propre
remis par `git stash`. Un fichier du chargeur webpack est bien remplacé sous
la compilation ; rien dans la révision n'est en cause.

**Reproduit le 30/09/2026, refonte de l'épic 15.** Même erreur au prérendu de
`/unlock` (`Cannot read properties of undefined (reading 'call')`), deux fois
sur l'arbre de la story 15-1 puis une fois sur `15adb41` intact remis par
`git stash`. La compilation et la vérification des types passent à chaque
fois. Les stories de l'épic 15 s'en tiennent donc à la règle ci-dessus : build
jusqu'à la vérification des types, `npm run lint`, et Vercel fait foi.


---

## Bilan de fin de sprint

Les 15 stories sont livrées. `npm run build`, `npm run lint`,
`npm run typecheck` et `npm run verify` passent sans erreur ni avertissement.

**Ce qui a été vérifié en exécution.** Les 12 routes serveur ont été
interrogées sur un serveur de production local : codes 401 sans session, 400
sur entrée invalide, 413 au-delà de 4 Mo, 404 sur date inexistante, et
`Cache-Control: no-store` sur `/api`. Le contrat avec Open Food Facts a été
confronté au service réel. Les invariants d'architecture ont été vérifiés par
inspection du code : aucun appel Open Food Facts côté serveur, SDK Mistral
importé dans un seul fichier, aucune clé dans le bundle client, aucune
jointure d'affichage entre le journal et les tables de référence.

**Ce qui reste non vérifié, faute de base.** Tout ce qui exige une exécution
SQL : l'idempotence réelle de l'import CIQUAL, le plan d'exécution de la
recherche trigramme, les totaux sommés par Postgres, l'unicité des alias.
Le code compile et les requêtes sont écrites, mais elles n'ont jamais tourné.
C'est la conséquence directe de B-2 et B-4.

**Premier geste après avoir provisionné la base.** Appliquer les migrations,
importer CIQUAL deux fois de suite pour confirmer l'idempotence, puis lancer
un `EXPLAIN ANALYZE` sur la requête de recherche pour confirmer que l'index
GIN est bien retenu. Si un balayage séquentiel apparaît, l'expression de la
requête a divergé de celle de l'index de la migration 0003.

## B-12 — Variables Vercel des rappels et du courriel non posées — **ouvert le 27/09/2026**

**Constat.** Le connecteur Vercel répond `403 forbidden` à la lecture comme à
l'écriture des variables du projet `nutri` : il n'a pas le droit de les gérer.
Les clés ont été générées et posées dans `.env.local`, mais pas en production.

**Ce qui marche sans elles.** Tout le reste. L'interrupteur « Rappel du
déjeuner » affiche « Non configuré », la tâche planifiée
`/api/cron/reminders` répond 401, et l'onglet « Par courriel » de la
récupération n'apparaît pas : le code de secours suffit.

**À faire côté humain**, dans Vercel → projet `nutri` → Settings →
Environment Variables (Production et Preview), en recopiant les valeurs de
`.env.local` :

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (sensible), `VAPID_SUBJECT`
- `CRON_SECRET` (sensible) — Vercel le joint lui-même aux appels planifiés
- `APP_URL` = `https://nutri-rosy-one.vercel.app`

Puis, pour la réinitialisation par courriel : créer un compte Resend, vérifier
un domaine d'envoi, et poser `RESEND_API_KEY` (sensible) et `MAIL_FROM`
(par exemple `NutriPerso <noreply@ton-domaine.fr>`). Redéployer ensuite.

Les tâches planifiées sont déclarées dans `vercel.json` (12 h et 13 h UTC,
seule celle qui tombe à 14 h à Paris envoie).

## B-13 — App Android non compilable dans l'environnement cloud — **ouvert le 01/10/2026**

**Constat.** Le conteneur de développement n'atteint pas `dl.google.com`
(refus du proxy) : ni SDK Android, ni dépôt Maven de Google, donc ni AGP ni
AndroidX. `./gradlew assembleDebug` ne peut pas tourner ici.

**Ce qui a été vérifié.** Côté serveur, tout : `npm run build`, `lint`,
`typecheck`, et `POST /api/activity` interrogé sur un serveur local (jeton de
session accepté, jeton invalide en 401, jour futur en 400, indice du raccourci
iOS conservé). Côté Android, le code Health Connect suit l'API de
`connect-client` 1.1.0 mais n'a pas été compilé.

**À faire côté humain.** Ouvrir `apps/android` dans Android Studio, *Sync*,
*Run* sur un téléphone avec Health Connect, puis Moi › Santé › Autoriser.
Remonter ici toute erreur de compilation.

## B-14 — Publication Play Store : étapes hors dépôt — **ouvert le 01/10/2026**

Le code est prêt (voir `apps/android/PLAY_STORE.md`). Restent, côté humain :

- poser `LEGAL_CONTACT_EMAIL` dans Vercel (affichée par `/legal/privacy` et
  `/legal/account-deletion`, exigée par Google) et redéployer, pour que la
  production ait aussi la nouvelle `/api/activity` ;
- créer la clé d'envoi et `apps/android/keystore.properties` ;
- compte développeur Google Play, test fermé de 14 jours à 12 testeurs si le
  compte est personnel et récent ;
- formulaires Sécurité des données, Health Connect, applications de santé,
  compte de test pour l'examen ;
- captures d'écran de la fiche.
