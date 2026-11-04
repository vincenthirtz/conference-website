# Base de données : de Supabase (Postgres) à Cloudflare D1

Étude du 2026-11-02, après la bascule des comptes vers Better Auth ([AUTH-BETTER-AUTH.md](AUTH-BETTER-AUTH.md)). Elle porte sur
**toute la base** dans la configuration actuelle :

- l'API dans le Worker `owwomenscup-api` ([API-WORKER.md](API-WORKER.md)) ;
- le site dans le Worker `owwomenscup`, dont le rendu serveur lit la base ;
- le temps réel sur Durable Objects ([REALTIME-DO.md](REALTIME-DO.md)) ;
- les fichiers sur R2 ([R2-MEDIA.md](R2-MEDIA.md)).

Sources des chiffres :

- **[prod]** : lectures seules des catalogues de la base de production (2026-11-02) ;
- **[code]** : inventaire des deux dépôts ;
- **[schéma]** : rejeu des 407 migrations de conference-api ;
- **[doc]** : documentation officielle de Cloudflare, lien donné.

## En bref

- **Le volume n'est pas un sujet.** 42 Mo, 186 tables, ~14 600 lignes **[prod]**. Une base D1 va jusqu'à 10 Go
  ([doc](https://developers.cloudflare.com/d1/platform/limits/)). ~55 000 appels par jour depuis décembre 2025 **[prod]**,
  loin des 25 milliards de lignes lues et 50 millions écrites incluses chaque mois
  ([doc](https://developers.cloudflare.com/d1/platform/pricing/)) : **aucun coût en plus** du forfait Workers payant.
- **Le chantier, c'est ce qui vit dans Postgres et la façon dont le code lui parle.**
  - 2 601 appels au constructeur de requêtes de Supabase dans l'API, 147 dans le site **[code]**.
  - 36 fonctions SQL appelées par l'API, ~2 000 à 2 500 lignes de plpgsql, dont 21 avec verrous de ligne et 9 avec verrous
    consultatifs **[code][schéma]**.
  - 65 déclencheurs **[schéma]**.
  - D1 n'a **aucune bibliothèque de type Supabase** **[doc]**. Il n'a **pas de transaction ouverte**, seulement des envois
    groupés atomiques (`batch()`) **[doc]**. Et il traite **une requête à la fois** par base **[doc]**.
- **Durée : ~40 à 60 jours de travail pour D1.** Les 5 premiers lots sont invisibles et peuvent avancer entre deux journées
  de match. Comptez **~20 à 28 jours** pour garder Postgres ailleurs (voir « L'autre voie »).
- **Le lot 1 sert aux deux voies** ; il est fait. **Choix du 2026-11-02 : D1, en prenant le temps** (voir « Rythme
  choisi »).

## Mesures

| Élément | Nombre | Source |
|---|---|---|
| Taille de la base / des tables | 42 Mo / 20 Mo | [prod] |
| Tables `public` (dont 8 de Better Auth) | 186–187 | [prod][schéma] |
| Lignes (estimation) | ~14 600 | [prod] |
| Appels de l'API à la base depuis le 2025-12-27 | ~17 millions (~55 000/jour) | [prod] |
| Tables les plus écrites | présence Discord, réglages, joueuses libres, secrets d'espace, héros | [prod] |
| Colonnes | ~2 075 : 551 uuid, 463 timestamptz, 87 booléens, 42 jsonb, 19 tableaux, 20 date/heure, 7 numeric | [schéma] |
| Contraintes | 343 clés étrangères (153 cascade, 80 à null, 62 restrict), ~305 vérifications dont 16 par regex | [schéma] |
| Index | 433, dont 130 partiels, 12 sur expression, 6 GIN (2 trigrammes, 4 tableaux) | [schéma] |
| Déclencheurs | 65 : 46 dates de modification, 15 logique métier, 6 temps réel (`pg_net`) | [schéma] |
| Fonctions | 105 (92 plpgsql), 36 appelées par l'API | [schéma][code] |
| Règles d'accès | 94, dont 88 sans effet pour l'API (clé de service) | [schéma] |
| Extensions utiles | `pg_net`, `supabase_vault`, `pgcrypto` (temps réel), `unaccent`, `pg_trgm`, `uuid-ossp` | [prod] |
| Tables créées à la main avant les migrations | **12** (`matches`, `teams`, `tournaments`…), sans définition dans le dépôt | [schéma] |

## 1. Ce qui dépend de Postgres

### Dans le code [code]

| Usage | Nombre | Ce que ça demande sur D1 |
|---|---|---|
| `.from()` (API / site) | 2 601 en 515 fichiers / 147 en 55 fichiers (lecture seule) | Une **façade au format supabase-js** au-dessus de D1. Réécrire les appels un à un serait bien plus long, et **523 fichiers de test** (~11 000 cas) sont écrits sur cette forme |
| Relations imbriquées dans `select` | 147 (API) + 28 (site), dont 39 indices de clé, 16 `!inner`, 9 sur deux niveaux, 12 filtres sur la relation | Jointures traduites par la façade (`json_object`, `json_group_array`) |
| `.or()` / `.not()` / `.filter()` brut | 96 / 74 / 10 | Analyse du mini-langage de filtres de PostgREST |
| `.ilike` / `.like` / `textSearch` | 23 / 1 / 1 | SQLite ne lit la casse qu'en ASCII et n'a pas `unaccent` : colonne normalisée, ou recherche plein texte (FTS5) |
| `.in()` | 458 | Limite de 100 paramètres par requête **[doc]** : la façade passe la liste en un seul JSON (`json_each`) |
| `.upsert()` / écriture suivie de `.select()` | 93 (19 `ignoreDuplicates`) / 296 | SQLite a `ON CONFLICT` et `RETURNING` |
| `count: 'exact'` / `.range()` | 111 / 79 | Requête de comptage, `LIMIT`/`OFFSET` |
| `.rpc()` | 38 appels, 36 fonctions | Réécriture en TypeScript (lot 4) |
| Codes d'erreur Postgres lus par le code | 75 littéraux (`23505`…), 59 aides, 14 textes de message | Une traduction des erreurs SQLite au même endroit |
| Accès dispersé | 1 463 appels (56 %) hors des `repository` ; `supabaseAdmin` importé par 414 fichiers | Le lot 1 fait passer tout ça par une seule porte |

Bonnes nouvelles :

- **aucun SQL brut** hors des comptes ;
- **aucune requête directe du navigateur** vers la base ;
- le temps réel des écrans est déjà sur Cloudflare (`NEXT_PUBLIC_REALTIME_BACKEND=cloudflare`).

### Dans la base [schéma]

1. **36 fonctions transactionnelles** : échanges, forge et portefeuille du TCG, économie de la Bibliothèque, gestion des
   joueuses sans équipe, effectif des équipes, quotas et verrous des tâches. Elles lisent, **verrouillent**, vérifient, puis
   écrivent dans plusieurs tables. D1 n'a ni verrou ni transaction ouverte. Il faut des écritures conditionnelles groupées en
   `batch()`, ou un Durable Object par domaine (`transactionSync()`, vraie transaction **[doc]**).
2. **6 déclencheurs de temps réel** (matchs, draft, scènes et thèmes caster, demandes). Ils appellent le Worker temps réel
   depuis la base. Sur D1, c'est l'API qui publie après chaque écriture ; une écriture faite à la main dans la console
   ne publierait plus.
3. **50 déclencheurs qui modifient la ligne avant écriture** (46 dates de modification, 4 données dérivées). SQLite ne le
   permet pas : déclencheur après écriture, ou valeur posée par le code.
4. **Types** :
   - uuid et dates deviennent du texte ;
   - booléens en 0/1 ;
   - jsonb en texte JSON ;
   - 19 tableaux en JSON, avec 4 index GIN à remplacer ;
   - les identifiants sont générés par le code (108 `gen_random_uuid()`).
5. **16 vérifications par expression régulière**, et `slugify_text` (`unaccent` + regex). D1 n'a ni regex ni `unaccent`
   **[doc]** : elles passent dans le code.
6. **Index particuliers** :
   - 2 trigrammes (recherche dans la liste noire) ;
   - 4 GIN de tableaux ;
   - 1 `NULLS NOT DISTINCT` ;
   - 9 index uniques sans casse, où les accents ne seraient plus repliés.
7. **2 fonctions à l'heure de Paris** (semaine ISO de la Bibliothèque) et 3 `DISTINCT ON` : réécriture.
8. **Les 94 règles d'accès disparaissent** : l'API est la seule à lire la base.

## 2. D1 : ce qu'il faut savoir [doc]

- **Une requête à la fois par base.** Au-delà, D1 met les requêtes en file d'attente, puis répond « overloaded »
  ([limites](https://developers.cloudflare.com/d1/platform/limits/)). Une requête lente bloque tout le monde, d'où
  l'importance des index les soirs de match. La réplication en lecture (API Sessions) soulagerait les lectures, mais elle
  est encore en **bêta**.
- **Pas de transaction ouverte**, seulement `batch()` atomique
  ([API](https://developers.cloudflare.com/d1/worker-api/d1-database/)). Drizzle et Prisma ne la contournent pas.
- **Limites** :
  - 1 000 requêtes par appel du Worker ;
  - 100 paramètres par requête ;
  - 30 s par requête ;
  - motifs `LIKE` de 50 octets ;
  - résultat de 50 Mo au plus (à partir du 2026-11-04).
- **Europe** : la juridiction `eu` se choisit **à la création** et ne change plus
  ([doc](https://developers.cloudflare.com/d1/configuration/data-location/)).
- **Sauvegardes** :
  - retour dans le temps sur 30 jours, gratuit, mais qui **écrase** la base en place
    ([doc](https://developers.cloudflare.com/d1/reference/time-travel/)) ;
  - l'export **bloque** la base pendant qu'il tourne ;
  - export quotidien vers R2 par un Workflow ([exemple](https://developers.cloudflare.com/workflows/examples/backup-d1/)).
- **Better Auth** : son dialecte D1 intégré ne convient PAS à notre schéma (il écrit les dates en
  `toISOString()`, `…123Z`, que les gardes de type de D1 refusent). Il passe par son propre
  adaptateur, `worker/identityD1Adapter.ts` de conference-api, bâti sur le compilateur de la façade
  (relevé du 2026-11-04, préparation du lot 6). Sans transactions interactives sur D1, deux cas
  peuvent rester à moitié faits si la seconde écriture échoue : une inscription par Discord sans
  son lien, un changement de mot de passe « déconnecter les autres appareils » qui déconnecte sans
  changer le mot de passe.
- **Le site et l'API peuvent lier la même base D1.**

## 3. Le plan pour D1

Même méthode que pour les comptes : une seule porte, le nouveau moteur derrière un interrupteur, une copie répétée sur
sauvegarde, la bascule un soir sans match, et le retour arrière prêt avant de basculer.

| Lot | Ce qu'il fait | Effet visible | Durée |
|---|---|---|---|
| **1. Une seule porte, un contrat** — **fait le 2026-11-02** | Commun aux deux voies, le choix du moteur se fait à sa fin. Détail sous le tableau. | Aucun | 4–6 j |
| **2. Le schéma sur D1** | Relevé de la production (fait le 2026-11-02, à refaire avant la copie). Traduction de 179 tables, 433 index, ~305 vérifications et 343 clés étrangères. Base D1 créée en juridiction `eu`, vide | Aucun | 4–6 j |
| **3. Le moteur D1 de la porte** | Détail sous le tableau. | Aucun | 10–15 j |
| **4. La logique de la base dans le code** | Détail sous le tableau. | Aucun | 15–22 j |
| **5. Copie et répétition** | Script Postgres → D1 (20 Mo), comparaison table par table (comptes et empreintes), répété sur la sauvegarde quotidienne (`db-restore-test`). Puis quelques jours de **lecture dans l'ombre** : les mêmes lectures sur D1, comparées à Supabase | Aucun | 4–6 j |
| **6. Bascule** | Un soir sans match : écritures gelées quelques minutes, copie finale, interrupteur sur l'API et le site, contrôles. **Better Auth passe sur D1 la même nuit** (les 44 clés vers les comptes). Retour arrière : interrupteur, plus recopie D1 → Postgres (même schéma), script écrit et essayé avant | Oui | 1–2 j + 48 h |
| **7. Nettoyage (≥ 14 jours)** | Supabase en lecture seule, puis supprimé. Hyperdrive retiré. Retrait de supabase-js. Sauvegardes D1 : retour dans le temps + export quotidien sur R2 | Non | 2–3 j |

**Lot 1 en détail.**

- **Les 36 fonctions appelées en `rpc`** deviennent des fonctions nommées dans un seul module ;
  plus aucun `.rpc('…')` ailleurs.
- **Les codes et messages d'erreur de Postgres** sont lus à un seul endroit ; plus aucun `23505` dans le code.
- **Un relevé automatique de tout ce que le code demande** au constructeur de requêtes (méthodes, options, relations,
  filtres) est **figé par un garde-fou**. C'est la liste exacte à fournir par le moteur suivant, et aucun nouvel usage
  difficile ne passe sans le savoir.
- **Le site sous les mêmes règles.**

**Lot 2 en détail.**

- **Un traducteur, pas une traduction à la main.** Un script lit le relevé de production (`database/schema-prod.sql`)
  et écrit le schéma D1. On le relance à chaque nouvelle migration pendant le chantier ; un garde-fou refuse un schéma D1
  en retard sur le relevé.
- **Les types** suivent la section 1 : uuid, dates, booléens, jsonb, tableaux. Les 7 `numeric` deviennent des nombres à
  virgule, comme le code les reçoit déjà ; les montants gardent leurs 2 décimales par une vérification.
- **Ce qui ne se traduit pas tout seul** sort dans une liste, chaque élément avec sa place prévue au lot 4 :
  - les 16 regex ;
  - les déclencheurs avant écriture ;
  - les index GIN et trigrammes ;
  - les index sans casse.
- **Vérifié sur un vrai SQLite** dans les tests : chaque table, colonne, clé étrangère et index du relevé existe, clés
  étrangères appliquées.
- **La base D1 vide**, juridiction `eu`, créée sur le compte Cloudflare de l'association **après ton accord**.

**Lot 3 en détail.** La façade supabase-js au-dessus de D1 :

- `select` avec relations, filtres et mini-langage `or`, tri, pages, comptages ;
- `upsert`, `RETURNING`, `single` ;
- listes `in` passées en JSON ;
- traduction des erreurs.

Les tests des dépôts tournent aussi contre un vrai SQLite, en plus du faux Supabase.

**Lot 4 en détail.**

- **Les 36 fonctions** sont réécrites en TypeScript, avec écritures conditionnelles groupées en `batch()`, ou dans un
  Durable Object pour le TCG et la Bibliothèque.
- **Les 65 déclencheurs** :
  - dates de modification posées par la façade ;
  - logique métier en déclencheurs SQLite ou dans le code ;
  - temps réel publié par l'API.
- **Les 16 regex et `slugify_text`** passent dans le code. Les 3 vues sont réécrites.

**Total : ~40 à 60 jours.**

**Risques principaux :**

- les fonctions transactionnelles du TCG et de la Bibliothèque : une erreur et l'argent virtuel se perd ou se double ;
- la file unique les soirs de match ;
- les accents dans les recherches ;
- les 12 tables sans définition dans le dépôt.

### Rythme choisi le 2026-11-02 : on prend le temps

- **Un lot à la fois.** Chacun démarre sur ton feu vert et se termine (tests et CI verts) avant le suivant.
- **Les lots 2 à 5 sont invisibles.** Ils avancent entre deux journées de match, jamais la veille ni le soir d'un match.
- **Aucune date de bascule fixée d'avance.** Elle se pose quand la répétition (lot 5) a tourné sans écart.
- **Ce que le temps permet d'ajouter :**
  - **Tests différentiels des 36 fonctions.** La version Postgres actuelle (rejouée dans PGlite, comme aujourd'hui pour
    le schéma) et la version réécrite reçoivent les mêmes opérations. Elles doivent laisser les mêmes soldes et les mêmes
    lignes. C'est la parade au risque principal : de l'argent virtuel perdu ou doublé.
  - **Deux semaines de lecture dans l'ombre** au lieu de quelques jours, avec si possible une soirée de match.
  - **Une répétition complète** de la bascule et du retour arrière sur une copie, chronométrée.
- **Durée** : toujours ~40 à 60 jours de travail, plus ~5 jours pour ces ajouts, étalés au rythme des feux verts.

### Lot 1 : fait le 2026-11-02

Rien de visible, tests et CI verts.

- **1a** (API `692607c`) : les 38 appels des 36 fonctions SQL passent par `utils/db/rpc.ts`
  (`dbFunctions(db)(nom, arguments)`). Garde-fou `dbDoorGuard`.
- **1b** (API `7bc369a`) : les codes et messages d'erreur de la base se lisent dans `utils/db/errors.ts`
  seul ; 56 fichiers adaptés. Garde-fou `dbErrorsGuard`.
- **1c** (API `555e0a4`) : le contrat du constructeur de requêtes, relevé par un scanner (API du
  compilateur TypeScript) et figé dans `database/db-contract.json` (`npm run db:contract`).
  2 601 chaînes, 0 appel non rattaché. Garde-fou `dbContractGuard`, qui refuse toute méthode
  nouvelle et tout usage difficile qui bouge. C'est la liste exacte de ce que le moteur suivant
  devra savoir faire.
- **1d** (site `712166dc4`, API `680449c`) :
  - les sources propres du site lisent la base 147 fois dans 55 fichiers, sans écriture, `.rpc`
    ni code d'erreur ;
  - `dbDirectReadsGuard` fige ces lectures par fichier (`npm run db:reads`) ;
  - leur contrat (`database/db-contract-site.json` côté API) ne demande rien de plus que l'API.
- **Relevé de la structure de production** (API `database/schema-prod.sql`, accord du 2026-11-02) :
  - workflow `db-schema-dump` du site, structure seule ;
  - chiffré dans la CI, déchiffré hors du dépôt public ;
  - 186 tables, dont les 12 sans migration.

**Écart repéré puis corrigé** (API `0776ee0`, 2026-11-02) : le garde-fou des colonnes
(`supabaseSelectSchema`) ne lisait pas `features/` (~1 100 appels).

- Il les lit maintenant, avec `worker/`.
- Il résout chaque variable dans sa propre fonction : 17 fausses alertes venaient d'homonymes.
- Il lit les listes de colonnes en constantes.
- Résultat : 2 048 selects analysés au lieu de 1 151, 2,3 % d'angles morts, aucune colonne fautive.

### Lot 2 : fait le 2026-11-03

Rien de visible. Tout est dans conference-api : `npm run db:d1` rejoue le relevé de production dans PGlite, lit la
structure dans le catalogue de Postgres et écrit trois fichiers.

- `database/d1/schema.sql` : le schéma D1.
- `database/d1/catalog.json` : la carte des colonnes, clés et liens, pour la façade du lot 3.
- `database/d1/a-reprendre.md` : tout ce qui n'est pas traduit, avec sa place au lot 4.

| Élément | Traduit | À reprendre |
|---|---|---|
| Tables (toutes `STRICT`) | 186 | 0 |
| Colonnes | 2 069, dont 1 328 avec une garde de type | 0 |
| Clés étrangères | 346 | 0 |
| Vérifications | 309 | 6 : 4 expressions régulières complexes, 2 sur le contenu de tableaux |
| Index | 516 | 6 GIN (tableaux, trigrammes de la liste noire) |
| Valeurs par défaut | toutes, dont 9 compteurs | 0 |
| Déclencheurs, fonctions, vues | listés | 64, 104, 3 (lot 4) |

**Conventions de stockage** (la façade du lot 3 s'y conformera) :

- uuid en minuscules ;
- dates et heures en texte de largeur fixe, UTC, à la microseconde (`2026-11-03T10:00:00.123456+00:00`) : l'ordre du
  texte est l'ordre du temps ;
- booléens 0/1 ;
- JSON et tableaux en texte JSON.

Chaque colonne porte une **garde de type** : la base refuse ce que le type Postgres refusait (date impossible, uuid mal
formé, JSON invalide, montant à 3 décimales…). Une donnée mal formée échouera donc à la copie ou dans la façade, au lieu
d'entrer en silence.

**Vérifié sur le moteur D1 local** (wrangler, le même SQLite et les mêmes refus que D1, sans rien créer chez
Cloudflare) :

- les 702 instructions s'installent, toutes les clés étrangères trouvent leur clé parente ;
- une mini-base de test refuse ce que Postgres refusait, pose les mêmes valeurs par défaut, applique les cascades.

Garde-fous : `d1SchemaGuard` (chaque migration rangée dans `database/d1/migrations.json`, fichiers régénérés à
l'identique pendant le test, installation locale) et `d1Translate` (traductions et mini-base).

**Trouvé en route :**

- D1 refuse les motifs `LIKE`/`GLOB` de plus de 50 octets. Une garde de date écrite naïvement était refusée ; elle
  passe par les fonctions de date de SQLite.
- Une vérification qui vaut « vide » laisse passer la ligne, en SQLite comme en Postgres. Les gardes comparent donc
  avec `IS`, sinon `2026-13-01` passait.
- 11 des 15 expressions régulières sont simples et restent dans la base, traduites sans perte.
- 10 index uniques sans casse (`lower(email)`…) ne replient que la casse ASCII sur SQLite : `É` et `é` restent distincts.
- 2 unicités « différées » (ordre des segments et des vagues d'un événement) deviennent immédiates : un réordonnancement
  passera par des valeurs temporaires (lot 4).
- Les déclencheurs : 45 posent seulement la date de modification, 6 publient le temps réel, 13 portent de la logique.
- 15 fonctions de la base ne sont appelées ni par l'API ni par un déclencheur : à vérifier au lot 4, peut-être mortes.

**Base D1 créée** le 2026-11-03 sur ton accord (« Je t'autorise à créer la base D1 vide en Europe et à y installer le
schéma ») :

- `owwomenscup-db`, compte de l'association, juridiction `eu`, réplication en lecture coupée ;
- schéma installé en 8 envois (702 instructions, tous acceptés) ;
- vérifié sur place : 186 tables toutes `STRICT`, 516 index, aucune clé étrangère orpheline, 4,5 Mo à vide ;
- branchée nulle part : ni le site ni l'API ne la voient.

### Mesure de latence du 2026-11-03

Ta question : la base « Europe de l'Est » n'est-elle pas trop loin ? Mesuré sur ton accord avec une 2e base vide
(`owwomenscup-db-weur`, préférence Europe de l'Ouest, sans juridiction) et un Worker de mesure temporaire, supprimé
ensuite.

**Où sont les bases.** Malgré les étiquettes, la base `eu` (« Europe de l'Est ») est servie depuis **Francfort**, et
la base « Europe de l'Ouest » depuis **Londres**. D1 ne propose pas Paris : on choisit une grande région, pas une ville.

Temps médian d'une requête, vu par le Worker (25 essais par série, plusieurs séries) :

| Worker | Francfort `eu` : lecture / écriture | Londres : lecture / écriture | Supabase Irlande : lecture |
|---|---|---|---|
| Là où arrive la visite (Marseille pour ce PC) | 27–30 / 41 ms | 26–28 / 32–35 ms | ~40 ms |
| Placé près de Francfort | **10 / 26 ms** | 25 / 33 ms | ~42 ms |
| Placé près de Londres | 22 / 36 ms | **8–9 / 16–19 ms** | 22–26 ms |

Dix requêtes envoyées d'un seul coup (`batch`) coûtent autant qu'une seule : ~28 ms sans placement, ~10 ms avec.

**Ce que ça veut dire :**

- **D1 est déjà plus rapide que Supabase aujourd'hui**, d'où qu'il soit : ~28 ms contre ~40 ms par requête.
- **Le gros gain vient du placement**, pas du choix de ville. Le Worker de l'API placé à côté de la base (option
  `placement.region` de Cloudflare) divise le temps par trois : ~10 ms par lecture, un seul trajet long par visite. À
  faire à la bascule.
- **Francfort et Londres font jeu égal en lecture.** Londres gagne ~9 ms par écriture, et les écritures sont bien plus
  rares que les lectures.
- **Londres est hors de l'Union européenne, et sans juridiction la place n'est qu'une préférence**, sans garantie sur
  l'endroit où dorment les données et leurs sauvegardes. Francfort a la garantie `eu`.
- **Décidé le 2026-11-03** : on garde Francfort (`owwomenscup-db`, garantie `eu`). La base de Londres est supprimée sur
  ton accord (« Je t'autorise à supprimer la base D1 de Londres »). À la bascule, le Worker de l'API sera placé près de
  Francfort (`placement.region: "aws:eu-central-1"`).
- **Écarté** : placer l'API actuelle près de l'Irlande pour accélérer Supabase. Supabase va disparaître.

### Lot 3 : la façade, faite le 2026-11-03

La façade vit dans conference-api `utils/db/d1/`. Elle ne sera branchée nulle part avant la bascule. Son cahier des
charges est le contrat figé au lot 1 (`database/db-contract.json`).

| Morceau | Contenu | État |
|---|---|---|
| 3a | Valeurs (dates, vrai/faux, JSON…) et erreurs SQLite redites en codes Postgres | fait (API `e0fb54e`) |
| 3b | Filtres : méthodes, mini-langage `or`/`not`/`filter`, chemins JSON, contenance | fait (API `18cf144`) |
| 3c | Lectures : colonnes, tables liées, tri, pages, `single`, comptages | fait (API `a01f1ef`) |
| 3d | Écritures : insérer, modifier, supprimer, `upsert` | fait (API `cc306ad`) |
| 3e | Le client complet ; garde-fou : chaque lecture réelle du code se traduit | fait (API `0a1e6d7`) |
| 3f | Les lectures propres du site | fait (API `04dfea8`) |
| 3g | Colonnes sensibles (accord du 2026-11-03, voir plus bas) | fait (API `26f44be`) |

Rien n'est branché : ni l'API ni le site n'utilisent la façade avant la bascule.

**Écart au plan.** Le plan prévoyait de faire tourner aussi les ~520 fichiers de tests existants contre un vrai SQLite.
Ce n'est pas fait : leurs données de test ne respectent pas le schéma (identifiants `team-1` au lieu d'uuid, liens
absents), et les réécrire serait un chantier en soi. À la place :

- la façade a ses propres tests, sur le moteur D1 local ;
- chacune des 2 063 lectures du code est traduite sur le vrai schéma par le garde-fou ;
- la comparaison sur de vraies données se fera au lot 5 (lecture dans l'ombre).

**Trouvé en route :**

- **L'ordre du texte.** La base de production trie avec ICU `en-US` : sans casse ni accents au premier niveau. SQLite
  ne connaît que l'ordre des octets, et D1 ne permet pas d'ajouter une collation. Sans correction, toutes les listes
  triées par nom auraient changé d'ordre, et les prénoms accentués seraient partis en fin de liste. La façade calcule
  en SQL une clé de tri pour les lettres latines. Sur dix noms piégés, l'ordre obtenu est exactement celui de la
  production.
- **`ilike` et les accents.** Avec la même méthode, « élodie » trouve « Élodie » comme en Postgres, et « elodie » ne la
  trouve pas, comme en Postgres.
- **Aucune lecture ne dépend des règles d'accès.** L'API comme les pages du site lisent avec l'accès de service, qui
  passe outre les règles. Les 100 règles de Supabase ne gardent qu'une porte : la clé publique utilisée directement
  contre Supabase. D1 n'a pas d'adresse publique, cette porte disparaît.
- **Les tables liées se résolvent comme dans PostgREST**, par les clés étrangères de la carte : « plusieurs vers un »,
  « un vers un », « un vers plusieurs », « plusieurs vers plusieurs », précision `!lien`, `!inner`. Une ambiguïté est
  refusée avec le même code (`PGRST201`).
- **Les écritures rendent leurs tables liées d'un seul coup** : SQLite accepte les sous-requêtes dans `RETURNING`.
  Toutes les lignes d'une insertion partent en un seul paramètre JSON, sous la limite de 100 paramètres de D1.
- **D1 compte trop après une cascade.** Après une suppression en cascade, il compte aussi les lignes effacées par
  ricochet. La façade compte les lignes rendues, comme PostgREST.
- **Le garde-fou des lectures** : les 2 063 lectures du code se traduisent sur le vrai schéma, à part deux vues
  prévues au lot 4. Le contrat du lot 1 (méthodes, opérateurs, options) est tenu.
- **Trois pannes de production trouvées et corrigées** (API `1ef0b30`, sur ton accord). Trois lectures embarquaient
  une table sans lien, que PostgREST refuse (`PGRST200`), et le code avalait l'erreur. Conséquences :
  - les classements FFA restaient vides ;
  - la page d'une phase FFA répondait 500 ;
  - le tableau de bord comptait toutes les équipes comme incomplètes avant le verrouillage des effectifs.

  La production n'avait encore ni lobby FFA ni verrouillage à venir : pannes latentes, aucun utilisateur touché. Le
  faux Supabase des tests ne vérifie pas les liens, d'où le silence jusqu'ici.
- **3g, colonnes sensibles (ajouté sur ton accord).** Les 21 colonnes que la clé publique ne voit pas aujourd'hui
  (7 tables) entrent dans la carte de D1. Le traducteur les lit dans les droits réels de la production. Exemples :
  jetons de check-in, code de lobby, BattleTag, identifiants de comptes, motifs de litige.
  - **Mode « lecture publique » de la façade.** Ces colonnes y sont refusées, avec le code de Postgres (`42501`),
    qu'on les demande par leur nom, par `*`, dans une table liée, en filtre ou en tri. Toute écriture y est refusée.
  - **Garde-fou côté API.** Chaque lecture de la couche publique (`pages/api/public`, `utils/public`) passe en mode
    public. Aucune ne lit de colonne sensible.
  - **Plan corrigé en route.** Imposer ce mode à toutes les routes publiques de l'API aurait cassé du code légitime :
    le vote MVP public lit le BattleTag pour en garder une copie. Le refus ne sert donc que là où la ligne part
    telle quelle vers le navigateur.
  - **Une fuite trouvée et corrigée (API `60ed43e`, sur ton accord).** La route publique
    `/api/tournaments/[id]/mvp-leaderboard` rendait le BattleTag complet des MVP : 40 BattleTags avec leur numéro pour
    la Cup 2026, alors que la page du site les masque. Ils sont maintenant masqués dans la réponse, et la production
    l'a confirmé : 0 numéro après le déploiement. L'audit des routes publiques n'a rien trouvé d'autre : classements,
    profils (dont `public/v1`), images de partage, cartes TCG et overlays masquaient déjà, GraphQL n'en expose pas. Un
    garde-fou (`publicBattleTagGuard`) exige désormais qu'une route qui lit un BattleTag demande une connexion ou le
    masque.
- **3f, les pages publiques du site.** Leurs 147 lectures propres se traduisent toutes. Elles ne lisent que deux des
  21 colonnes, à dessein :
  - `team_members.user_id`, qui est l'identifiant du profil public `/player/[userId]` ;
  - `team_members.battle_tag`, masqué (sans le numéro après « # ») avant d'atteindre la page.

  Le mode public accepte ces deux exceptions nommées, avec leur raison. `*` sur `team_members` reste refusé. Ce
  contrôle lit le clone voisin du site ; il tourne sur ce PC et se met de côté dans la CI de l'API, comme au lot 1d.

### Lot 4 : la logique de la base dans le code, lancé le 2026-11-03

Lancé sur ton feu vert (« go lot 4 »). Sept sous-lots, dans l'ordre. Chacun se termine (tests et CI verts) avant le
suivant.

| Sous-lot | Contenu | État |
|---|---|---|
| 4a | La mécanique : dates de modification, casse, vérifications écrites à la main, vues, index, codes d'erreur | **fait** le 2026-11-03 (API `591f2bd`) |
| 4b | Les 13 déclencheurs métier | **fait** le 2026-11-03 (API `5266a38`) |
| 4c | Le temps réel publié par la façade (6 déclencheurs) | **fait** le 2026-11-03 (API `f78178f`) |
| 4d | Les 10 fonctions simples (lectures de compte, utilitaires) | **fait** le 2026-11-03 (API `8419f91`) |
| 4e | Équipes et vivier (12 fonctions) | **fait** le 2026-11-03 (API `2d0c543`) |
| 4f-1 | TCG : argent virtuel et échanges (8 fonctions) | **fait** le 2026-11-03 (API, voir plus bas) |
| 4f-2 | Women's Library (5 fonctions) | **fait** le 2026-11-03 (API, voir plus bas) |
| 4g | Les fonctions que rien n'appelle : vérifier, puis abandonner | **fait** le 2026-11-03 (API `845133f`, voir plus bas) |

**4a, fait le 2026-11-03.** Rien ne change en production : la façade n'est toujours branchée sur rien.

- **Dates de modification.** 45 tables avaient un déclencheur Postgres qui remet `updated_at` à l'heure à chaque mise
  à jour. La façade le fait maintenant elle-même, upsert compris.
- **Majuscules et accents dans les unicités.** Le `lower()` de Postgres est reproduit pour les lettres latines :
  « Été » et « ÉTÉ » sont bien refusés comme doublons. Les autres alphabets (grec, cyrillique…) ne changent de casse
  qu'en ASCII. Aucune conséquence pour ce que ces index protègent : adresses e-mail, domaines, slugs, pseudos.
- **Les 6 vérifications à expressions régulières** sont écrites à la main pour SQLite. Chacune est comparée à
  l'expression d'origine sur des exemples :
  - semaine ISO de l'arène ;
  - slug des fan-arts ;
  - format du BattleTag ;
  - empreintes d'interdiction de la Bibliothèque ;
  - clés de deck ;
  - préférences de héros (un héros ne peut pas être à la fois choisi et banni).

  Il reste un écart, documenté : SQLite ne sait pas dire si un caractère non latin est une lettre. Un BattleTag comme
  « Zo★#123 » passerait donc la base, mais le code de l'API le refuse déjà avant, avec la même règle que Postgres.
- **Les 3 vues** (statistiques par équipe, par carte, par équipe et carte) sont réécrites pour SQLite. Un test met les
  mêmes données dans Postgres et dans D1, en visant les cas où une réécriture dérive : match nul, match terminé sans
  manche, exempt, match supprimé, scores vides, manche sans carte, deuxième espace. Les trois vues rendent les mêmes
  lignes. Contre-épreuve : trois erreurs glissées exprès dans les vues SQLite font échouer le test.
- **Les 6 index de recherche (GIN)** n'ont pas d'équivalent SQLite. Leurs tables sont minuscules : 0 à 23 lignes
  relevées le 2026-11-03. Pas d'index, donc ; lire la table entière ne coûte rien. À revoir si l'une dépasse quelques
  milliers de lignes.
- **Codes d'erreur.** Une vérification écrite à la main renvoie le code de Postgres (`23514`). La garde des envois
  groupés renvoie `P0001`, comme une fonction plpgsql qui lève une erreur. Cette garde servira aux sous-lots 4d à 4f :
  une écriture conditionnelle qui échoue annule tout l'envoi. Le code qui lit ces erreurs n'a pas à changer.
- **Garde-fous.** Dans `a-reprendre.md`, plus aucune vérification ni aucun index à reprendre, et le plafond est
  maintenant à zéro. Plus aucune table lue par le code ne manque au schéma D1. Restent les 64 déclencheurs et les
  fonctions, objets des sous-lots suivants.

**4b, fait le 2026-11-03** (« gérer »). Rien ne change en production.

- **Les 13 déclencheurs métier sont des déclencheurs SQLite**, installés dans le schéma. Toute écriture en
  profite : la façade comme les fonctions réécrites aux sous-lots 4d à 4f. Ils se rangent en trois familles :
  - **les refus** :
    - un caster doit être du staff (`23503`) ;
    - un effectif ne doit pas dépasser le `max_players` de ses tournois (`23514`) ;
    - un pronostic n'est accepté que sur un match ouvert (`prediction_locked`…).

    Les codes et les messages sont ceux que le code de l'API lit aujourd'hui.
  - **les effets sur d'autres tables** :
    - la voix d'un caster est détachée quand il quitte le staff ;
    - les réglages d'échange TCG sont ouverts à la première pochette ;
    - les meubles prêtés au QG reviennent quand une joueuse quitte l'équipe ou que l'équipe est dissoute ;
    - l'étiquette « supporter » d'un compte devient joueuse ou manager.
  - **les valeurs calculées sur la ligne même** : slug d'équipe, numéro d'adhérent, BattleTag vérifié, état
    actif d'un espace, dates d'un pronostic. SQLite ne sait pas modifier une ligne *avant* de l'écrire : il la
    complète juste après, dans la même instruction. La façade relit alors ces lignes pour que la réponse montre
    les bonnes valeurs. C'est une lecture de plus, seulement sur ces 5 tables, et seulement quand le code
    demande la réponse.
- **Le slug d'équipe** (`slugify_text`) est refait caractère par caractère, sans expression régulière, avec une
  table « sans accent » **relevée en production** (lecture seule) : 1 262 caractères. Le Postgres de test
  (PGlite) a une règle plus récente (2 661 caractères contre 1 650), et le slug aurait parfois changé. Contrôles :
  - l'empreinte md5 calculée par la production prouve que la copie est exacte ;
  - sur 1 373 noms d'essai et 18 noms réels, D1 donne exactement le slug de la production.

  Ce relevé est à refaire avant la copie (lot 5), avec celui du schéma.
- **La comparaison.** Un test fait les mêmes écritures d'un côté dans Postgres (schéma de production,
  déclencheurs actifs), de l'autre dans D1 par la façade. Il compare les réponses, les tables touchées et les
  erreurs : 21 scénarios, dont l'upsert réel des pronostics. Contre-épreuve : 11 déclencheurs cassés exprès,
  11 détectés.
- **Trois écarts, documentés** dans `a-reprendre.md` :
  - un pronostic qui arriverait avec un résultat mais sans date de règlement est refusé (`23514`) au lieu d'être
    nettoyé : SQLite vérifie la règle avant le déclencheur. Le code n'envoie jamais ces champs ;
  - un BattleTag cyrillique ou grec qui ne diffère que par la casse n'est pas reconnu comme vérifié (les lettres
    latines le sont, comme en production) ;
  - un espace déjà incohérent (état et case « actif » en désaccord) ne serait pas corrigé par une écriture de la
    case seule. Il n'y en a aucun en production (0 sur 3), et ces déclencheurs n'en laissent pas apparaître.
- **Trouvé en route : D1 plafonne la profondeur d'une expression à 100 niveaux**, et une sous-requête compte
  double. Deux fonctions de la façade du lot 3 empilent beaucoup de niveaux : la comparaison sans casse
  (`foldCase`, ~46) et le tri façon Postgres (`sortKey`, ~92). D'où les vérifications suivantes :
  - les 2 063 lectures du code s'exécutent toutes sur le moteur D1 local, pas seulement compilées ;
  - une seule forme dépasse : `ilike` sur une colonne d'une table embarquée en `!inner`. Le code ne l'emploie
    nulle part ;
  - le tri dans une table embarquée était déjà refusé par la façade.

  Le déclencheur du BattleTag contourne ce plafond en calculant ses comparaisons dans une table dérivée.

**Correction de la façade, faite le 2026-11-03 sur ton accord** (API `08a5cfb`). Plutôt que refuser `ilike` sur
une table embarquée, comme proposé, la façade le fait maintenant fonctionner, avec le même procédé de table dérivée,
pour un niveau de table liée. Au-delà (deux niveaux de `!inner` filtrés sans casse, forme que le code n'emploie
pas), elle rend une erreur claire (`54000`, avec un indice) au lieu de l'erreur obscure de D1. Un nouveau garde-fou
**exécute** chacune des 2 063 lectures du code sur le moteur D1 local, au lieu de seulement les compiler.
Contre-épreuve : l'ancienne façade y échoue sur 4 cas.

**4c, fait le 2026-11-03** (« gérer »). Rien ne change en production : le temps réel reste envoyé par Postgres.

- **Le principe.** Aujourd'hui, un déclencheur Postgres prévient le Worker temps réel par `pg_net` : un message
  signé « la table X, ligne Y, a changé » vers `/notify`. D1 n'a pas d'appel réseau. Il fait donc en deux temps :
  - ses déclencheurs notent les salles à prévenir dans une boîte d'envoi interne (`_d1_realtime`), dans la même
    instruction que l'écriture ;
  - la façade vide cette boîte **dans le même envoi** (tout ou rien) : une écriture refusée n'annonce rien, comme
    aujourd'hui.

  Le notificateur envoie ensuite les messages, sans jamais faire échouer l'écriture.
- **Les salles sont celles de Postgres.** Les 18 déclencheurs SQLite (6 tables × insertion, mise à jour,
  suppression) sont générés à partir des arguments mêmes des déclencheurs Postgres :
  - `matches:tournament:<id>` ;
  - `draft:<id>` ;
  - `demandes:team:<id>` ;
  - `caster:scenes`, `caster:scene:<id>` ;
  - `caster:themes`.

  L'ancienne salle est prévenue aussi quand la ligne change de tournoi, d'équipe ou de draft. Les suppressions en
  cascade sont vues.
- **Le message est celui de Postgres, au caractère près**, avec la même signature. Le vecteur de test du Worker
  temps réel, figé côté site, donne la même signature côté API : le Worker n'a rien à changer.
- **Vérifications.** Un test garde la vraie fonction Postgres qui choisit les salles, et ne remplace que l'envoi
  réseau par une table témoin. Mêmes écritures des deux côtés : mêmes salles, même ordre. Cela couvre :
  - matchs, drafts et étapes, demandes, scènes et thèmes ;
  - un changement de tournoi ;
  - une écriture refusée ;
  - une cascade tournoi → matchs → drafts → étapes.

  Contre-épreuve : 5 déclencheurs cassés exprès, 5 détectés.
- **À brancher à la bascule** (pas maintenant) :
  - donner au Worker de l'API l'adresse `/notify` et le secret `REALTIME_NOTIFY_SECRET`, aujourd'hui rangés
    dans Supabase Vault et dans le Worker temps réel ;
  - passer le notificateur à la façade ;
  - faire vider la boîte d'envoi, de la même façon, aux fonctions réécrites des sous-lots 4d à 4f.
- **Une différence.** Postgres voyait aussi les écritures faites à la main dans l'éditeur SQL de Supabase. Dans D1,
  seules les écritures de l'API préviennent les écrans : une modification faite dans la console D1 ne les met pas à
  jour.

**4d, fait le 2026-11-03** (« go »). Rien ne change en production.

- **La façade répond à `rpc(nom, arguments)`** avec une version TypeScript de la fonction
  (`utils/db/d1/functions/`). Le code de l'API passe déjà par une seule porte (`dbFunctions`, lot 1) : il n'a rien
  à changer. Une fonction pas encore réécrite répond toujours « fonction inconnue », comme PostgREST.
- **11 fonctions réécrites**, les 10 prévues plus le secret des tickets :
  - **les 6 lectures de comptes** :
    - la liste des comptes de l'admin : recherche, rôle, 8 filtres, 5 tris, pages, total ;
    - la recherche de comptes ;
    - les profils ;
    - la recherche de joueuses TCG ;
    - l'identifiant par e-mail ;
    - le nombre de comptes confirmés.
  - **les utilitaires** : quotas d'API, limite de débit, verrous des tâches planifiées (prendre et rendre) ;
  - **le secret des tickets du temps réel** : une variable du Worker, à la place de Supabase Vault. À poser à la
    bascule, avec celui de 4c.
- **Les mêmes règles que Postgres :**
  - les arguments sont lus comme PostgREST : un nom inconnu donne « fonction inconnue », une uuid illisible la même
    erreur qu'aujourd'hui ;
  - les jokers `%` et `_` des recherches restent actifs ;
  - « il y a 6 mois » est calculé comme Postgres (31 août → 28 février, quand SQLite donnerait le 3 mars) ;
  - les écritures partent en un seul envoi, tout ou rien. Postgres savait si un verrou était neuf ou repris grâce à
    un détail interne (`xmax`) ; la façade lit la ligne dans le même envoi.
- **La comparaison.** Chaque fonction est appelée dans Postgres (la vraie fonction, schéma de production) et dans D1,
  sur les mêmes données. Les données visent les cas sensibles :
  - majuscules dans un e-mail ;
  - joker dans une recherche ;
  - accents ;
  - compte sans rôle, compte suspendu, compte inactif depuis plus de 6 mois ;
  - BattleTag différent du compte Battle.net ;
  - joueuse rattachée à deux équipes.

  Résultats et erreurs sont identiques sur 17 tests. Contre-épreuve : 8 détails cassés exprès, 8 détectés.
- **Un socle commun pour 4e et 4f** : lecture des arguments, envoi groupé atomique (qui vide aussi la boîte du
  temps réel), décodage des lignes.
- **Une limite de la vérification.** Les tris de texte suivent l'ordre « façon production » de la façade (lot 3),
  mais le Postgres de test ne trie pas comme la production. Les comparaisons de tris portent donc sur des noms sans
  accent ; l'ordre avec accents a été vérifié contre la production au lot 3.

**4e, fait le 2026-11-03** (« gérer »). Rien ne change en production.

- **12 fonctions réécrites :**
  - les équipes : accepter une invitation, approuver une adhésion ou un transfert, passer le capitanat (par la
    capitaine ou par le staff) ;
  - le vivier des joueuses sans équipe : inscription, placement, retrait de placement, déplacement, retrait,
    dissolution d'une équipe, ajout d'une équipe au tournoi ;
  - et leur appui commun : « l'équipe sort du tournoi si plus personne n'y est ».
- **Les verrous de Postgres, autrement.** En production, ces fonctions posent des verrous pour que deux demandes
  simultanées ne se mêlent pas. Avec D1, chaque fonction tient en **un seul envoi**. D1 n'en traite qu'un à la fois
  et l'annule entièrement en cas d'erreur : même garantie, sans verrou.
- **Dans l'envoi, l'ordre exact de Postgres :**
  - les refus d'abord, chacun avec son code, son message et son indice (« demande introuvable », « équipe
    complète »…), que le code de l'API lit pour choisir sa réponse ;
  - puis les écritures, dans le même ordre ;
  - les règles automatiques de 4b et 4c jouent d'elles-mêmes : limite de joueuses, BattleTag vérifié, meubles
    rendus, temps réel des demandes.

  Deux petites tables internes servent à cela. La première annule l'envoi avec l'erreur voulue (le « RAISE
  EXCEPTION » de Postgres). La seconde garde une valeur intermédiaire le temps de l'envoi, par exemple l'ancienne
  équipe avant un déplacement ; elle est vidée à la fin.
- **La comparaison.** Le même scénario est joué pas à pas dans Postgres (vraies fonctions, déclencheurs actifs) et
  dans D1. Après chaque appel, il compare la réponse, l'erreur (code, message, indice) et l'état des tables
  touchées : effectifs, demandes, capitaines, vivier, équipes inscrites au tournoi et à ses phases. Il couvre
  chaque refus, le rôle ramené à « player », le BattleTag gardé lors d'un transfert, la joueuse déjà dans une
  équipe (`23505`), l'équipe d'origine qui entre seule une fois au complet, et l'équipe vide qui sort du tournoi.
  11 tests identiques. Contre-épreuve : 11 détails cassés exprès, 11 détectés, dont l'**ordre** de deux refus.
- **Un cas limite, sans effet aujourd'hui.** Si une joueuse avait deux rattachements dans le même espace (manager
  d'une équipe, joueuse d'une autre), Postgres prenait « le premier venu » pour un transfert, D1 le premier
  enregistré. Le code ne crée pas ce cas.

**4f, coupé en deux le 2026-11-03** (« Ok coupes en deux ») : d'abord le TCG, puis la Women's Library, chacun sur son
feu vert.

**4f-1, le TCG, fait le 2026-11-03.** Rien ne change en production.

- **8 fonctions réécrites** : rafraîchir le solde, acheter un booster, retrait par le staff, acheter un cosmétique,
  forger une carte, éligibilité aux échanges, proposer un échange, l'accepter.
- **Le principe de l'argent virtuel, inchangé.** Le registre des pièces (`tcg_wallet_entries`) fait foi : le solde
  est la somme de ses lignes. Le portefeuille (`tcg_wallets`) n'en est qu'un résumé, borné entre 0 et le plafond des
  entiers, comme en production.
- **Deux méthodes, selon la fonction :**
  - **argent et forge : un seul envoi avec gardes**, comme en 4e. L'heure est prise une seule fois par envoi, comme
    le `now()` de Postgres : tous les horodatages d'une même opération sont identiques ;
  - **échanges : photo, décision, écriture vérifiée.** Leur logique est trop riche pour un seul envoi : choix carte
    par carte, une douzaine de réponses possibles. La fonction lit tout d'un coup (une photo cohérente), décide en
    TypeScript exactement comme Postgres, puis écrit en un envoi qui **revérifie** d'abord que rien n'a bougé :
    - mêmes cartes encore valables ;
    - même compteur par joueuse. Ce compteur remplace leur verrou Postgres : chaque échange validé l'avance.

    Si quelque chose a bougé, elle recommence depuis la photo. Postgres faisait attendre le second appel ; D1 le fait
    rejouer, 5 fois au plus, puis rend une erreur `40001` sans rien écrire.
- **La comparaison avec Postgres** : 12 tests pas à pas. Après chaque appel, elle vérifie les soldes, le registre,
  les paquets, les cartes (qui changent de propriétaire), les propositions et leurs cartes. Elle couvre :
  - **pour le porte-monnaie** : fonds insuffisants, débit refusé puis accepté, débit en double, registre en négatif,
    cosmétique déjà acquis ;
  - **pour la forge** : réussie, refusée parce qu'elle viderait un sujet, carte d'une autre joueuse, fonds
    insuffisants ;
  - **pour les propositions** : chaque refus (blocage, refus récent, paire déjà en cours, consentements, ancienneté,
    objets invalides, carte absente) ;
  - **pour les acceptations** : plafond du jour, préférence pour un exemplaire non promis, annulation en cascade,
    proposition échue, proposition devenue caduque.
- **La concurrence, testée exprès.** 4 tests glissent une écriture concurrente entre la photo et l'écriture :
  - une dépense juste avant l'achat d'un booster : la fonction recommence et refuse, **pas de découvert** ;
  - la carte choisie, promise ailleurs entre-temps : la fonction en propose une autre, **jamais deux fois la même** ;
  - la carte demandée, recyclée entre-temps : l'acceptation prend l'exemplaire suivant ;
  - un conflit à chaque essai : abandon propre, rien d'écrit.
- **Contre-épreuve** : 9 détails cassés exprès, 9 détectés, dont la revérification elle-même. Deux trous du
  scénario, révélés par la contre-épreuve, ont été comblés : un registre en négatif, et une destinataire qui a un
  exemplaire promis et un autre libre.
- **Trois défauts trouvés en route et corrigés :**
  - la fonction SQLite qui compte les lignes modifiées (`changes()`) ne survit pas dans un envoi D1 : la forge compte
    désormais les cartes réservables juste avant de les réserver ;
  - la table des variables range tout en texte, et SQLite tient `'1'` pour différent de `1` : les nombres sont
    reconvertis avant comparaison ;
  - **un défaut du sous-lot 4d, révélé par la CI de 4f-1** : D1 transmet tout nombre comme un nombre à virgule.
    La limite de débit divisait l'heure par `3600.0` au lieu de `3600`, et sa « fenêtre d'une heure » devenait la
    seconde courante : le compteur repartait à zéro chaque seconde. Le test ne le voyait que lorsque ses trois appels
    chevauchaient deux secondes : c'était l'échec isolé, inexpliqué, noté en 4d. Corrigé (API `207c98a`). Le test
    compare désormais le début de fenêtre enregistré des deux côtés : il échoue à chaque fois sans le correctif.
    C'était la seule division de ce type dans la façade.
- **Trois écarts, sans effet :**
  - quand un débit viole deux règles d'unicité à la fois, Postgres et SQLite ne nomment pas la même. Le code
    d'erreur (`23505`, « doublon ») est le même, et le code de l'API ne lit que lui ;
  - quand deux opérations se croisent, Postgres faisait attendre ; D1 recommence. Après 5 conflits d'affilée, il
    rend une erreur au lieu d'attendre plus longtemps, une situation quasi impossible au volume actuel ;
  - dans ce même croisement, l'achat d'un booster pouvait rafraîchir le résumé du solde avant de répondre « fonds
    insuffisants ». D1 répond sans ce rafraîchissement, qui se refait à l'opération suivante.

**4f-2, la Women's Library, fait le 2026-11-03** (« go »). Rien ne change en production. **Avec lui, les 36
fonctions que l'API appelle sont toutes réécrites** ; un test l'exige désormais.

- **5 fonctions réécrites** : acheter un meuble, aménager son appartement, prêter un meuble au QG d'équipe, le
  rendre, réclamer le paquet hebdomadaire de l'arène.
- **Une méthode plus simple que celle des échanges : un seul envoi qui rend son verdict.** Ces fonctions répondent par
  un statut (« introuvable », « conflit de version », « déjà posé ailleurs », « fonds insuffisants », « ok »…).
  L'envoi lit l'état, rend son verdict, et n'écrit que si le verdict est « ok ». D1 exécute un envoi à la fois : rien
  ne peut se glisser entre le jugement et l'écriture, **il n'y a jamais à recommencer**.
- **L'arène, seule exception.** Sa semaine se calcule à l'heure de Paris, ce que SQLite ne sait pas faire. La fonction
  lit d'abord la fin du duel, calcule la semaine en TypeScript (avec le module de l'API qui affiche déjà « paquet de
  la semaine gagné »), puis écrit en revérifiant que le duel n'a pas bougé.
- **La comparaison avec Postgres** : 5 tests pas à pas, plus de 60 appels. Après chaque appel, elle vérifie le
  porte-monnaie, le registre, les paquets, l'inventaire, la version des salles, les meubles posés et les duels.
  Elle couvre :
  - **pour l'achat** : arguments refusés (dont une référence de 200 émojis, acceptée car Postgres compte des
    caractères), fonds insuffisants, registre en négatif, achat, rejeu, porte-monnaie créé au premier achat ;
  - **pour l'appartement** : forme de la liste (la conversion de toute la liste passe avant la recherche d'un
    champ manquant, comme Postgres), salle d'une autre, conflit de version, doublon, meuble d'une autre, meuble posé
    au QG, remplacement complet (un meuble absent de la liste est rangé) ;
  - **pour le QG** : salle qui n'est pas un QG, invitée pas encore acceptée, équipe dissoute, capitaine sans
    adhésion, conflit, meuble d'une autre, meuble posé chez soi, prêt puis déplacement ;
  - **pour le retour** : pas prêté, joueuse non autorisée, manager pas encore acceptée, retour par la propriétaire,
    par la capitaine, par une manager ;
  - **pour l'arène** : duel d'une autre, perdu, en cours, paquet donné puis rejoué, semaine déjà payée, un duel
    fini le dimanche à 23 h 30 UTC (lundi 0 h 30 à Paris : semaine 44, pas 43), et une récompense incohérente
    déjà enregistrée pour ce duel.
- **La concurrence, testée exprès** (6 tests) :
  - une dépense glissée juste avant un achat est vue : refus, **pas de découvert**, rien à recommencer ;
  - deux achats simultanés de la même référence : un achat, un rejeu, **un seul débit** ;
  - deux achats simultanés, des fonds pour un seul : un achat, un refus ;
  - deux enregistrements simultanés de la même version d'appartement : **un seul passe** ;
  - une réclamation jumelle glissée entre la lecture et l'écriture de l'arène : la fonction recommence et rend le
    paquet déjà donné, **jamais un second** ;
  - la même semaine payée par un autre duel entre-temps : « semaine déjà payée », sans recommencer.
- **Contre-épreuve** : 21 détails cassés exprès, 21 détectés. Exemples : la semaine calculée en heure UTC, la
  revérification du duel retirée, la capitaine refusée, un porte-monnaie créé même quand l'achat est refusé.
- **Deux écarts, sans effet :**
  - quand plusieurs meubles d'une liste sont fautifs, Postgres en nomme un sans ordre garanti ; D1 nomme le premier
    de la liste. L'API ne fait qu'afficher ce meuble ;
  - un nombre écrit `3.0` dans la liste des meubles : Postgres le refusait, D1 l'accepte (JavaScript ne distingue
    pas `3.0` de `3`). L'API n'envoie que des entiers.

**4g, les fonctions que rien n'appelle, fait le 2026-11-03** (« gérer »). **Le lot 4 est terminé.** Rien ne change en
production, ni dans Supabase : ces fonctions y restent jusqu'à sa suppression (lot 7).

- **15 fonctions vérifiées une à une** :
  - dans le code de l'API, du site et du bot ;
  - en production, en lecture seule : déclencheurs de tous les schémas, règles d'accès, autres fonctions, vues,
    valeurs par défaut, vérifications, index.

  Aucune n'est réécrite :

  | Verdict | Fonctions |
  |---|---|
  | **reprise** avec la fonction qui l'appelait, déjà réécrite (6) | `pool_release_team` (4e), `realtime_notify` (4c), `slugify_text` (4b), `tcg_pack_source_tradeable`, `tcg_rarity_rank`, `tcg_trade_lock_key` (4f-1) |
  | **sans objet sur D1** (3) | `introspect_foreign_keys` (relevé du schéma Postgres), `library_can_join` (accès aux canaux Supabase Realtime de la Library ; côté Cloudflare, les tickets de l'API font la même vérification), `realtime_set_config` (range les secrets du temps réel dans Vault ; sur D1, ce sont des variables du Worker) |
  | **morte** (6) | les 4 `auth_mirror_*` (miroir de Supabase Auth, branchées sur aucun déclencheur), `designate_captain` (seuls des commentaires la citent), `update_contact_submissions_updated_at` (branchée sur rien, citée nulle part) |
- **Un garde-fou** : le traducteur du schéma tient la décision et sa raison pour chaque fonction. Le test refuse :
  - toute fonction restée « à vérifier » ;
  - une décision qui viserait une fonction disparue de Postgres, ou de nouveau appelée.

  Contre-épreuve : 3 erreurs glissées exprès, 3 détectées.
- **À reprendre au lot 7 (nettoyage)**, trouvé en route :
  - la Library envoie encore chaque message aux deux temps réels, Supabase et Cloudflare. Elle se connecte à
    Cloudflare par défaut ; Supabase ne sert plus que de secours (`?realtime=supabase`). Il faudra retirer ce double
    envoi, ce secours et les règles d'accès de `realtime.messages` ;
  - le script `refresh-schema-snapshot.mjs` lit le schéma Postgres (dont `introspect_foreign_keys`) : il faudra
    le faire lire D1 ;
  - le workflow `realtime.yml` du site (`realtime_set_config`) deviendra inutile.

### Lot 5 : copie et répétition, lancé le 2026-11-03

Feu vert : « go lot 5 ». Un sous-lot à la fois.

| Sous-lot | Contenu | État |
|---|---|---|
| 5a | La copie, répétée sur la sauvegarde de la nuit, vers un D1 **jetable** | **fait** le 2026-11-03 (API `4d7d26e`, site `16d97588b`) |
| 5b-1 | La photo de la nuit : la sauvegarde copiée dans la vraie base D1, sans les secrets | **fait** le 2026-11-04 (API `7feacbf`, site `9aa7ba645`, `ac56942f9`) |
| 5b-2 | Les lectures de l'API refaites sur D1 et comparées (branchement en lecture seule) | **allumé à 5 %** le 2026-11-04 (API `e8fdb5d`, `7c6792c`) |
| 5b-3 | **Une semaine** d'observation (décision du 2026-11-04), lectures comparées à **50 %** depuis le 2026-11-04 13 h 10 UTC (API `06dcc2a`) ; aucun match prévu dans les 60 jours | en cours, fin vers le 2026-11-11 |
| 5c | La répétition chronométrée de la bascule **et du retour arrière**, sur une copie | préparation lancée le 2026-11-04 |

**Le 2026-11-04, sur ta décision** (« on peut le faire aujourd'hui », puis les trois choix) : observation raccourcie à
une semaine, comparaisons montées à 50 %, et toute la préparation de la bascule lancée le jour même, sans rien
changer en production :
- le retour arrière D1 → Supabase et la répétition chronométrée (5c) ;
- Better Auth sur D1 ;
- l'interrupteur de l'API et du site, le gel des écritures, la copie finale depuis le vrai Supabase, et le déroulé
  du soir de bascule.

Un garde-fou est déjà en place (API `c346556`) : une fois D1 devenue la base principale, la photo de la nuit ne peut
plus la vider. **Date visée pour la bascule : vers le 12-14 novembre**, un soir de ton choix, si l'observation et la
répétition sont propres.

**5a, fait le 2026-11-03.** Rien n'est écrit sur Cloudflare, aucune donnée ne passe par un ordinateur.

- **La méthode.** Sur la machine jetable de GitHub, après la restauration de la sauvegarde (workflow
  `db-restore-test`) :
  1. chaque table est lue en JSON, la forme que l'API reçoit de Supabase ;
  2. chaque valeur est convertie par les règles mêmes de la façade (dates, vrai/faux, JSON…) ;
  3. tout est chargé dans un D1 jetable, sans les déclencheurs : ce que Postgres a calculé est déjà dans les
     lignes. Les déclencheurs sont posés après ;
  4. chaque table est relue et comparée **valeur par valeur**.

  Le rapport ne contient que des nombres et des noms de tables ou de colonnes : les journaux de GitHub sont publics.
- **L'ordre de chargement** suit les liens entre tables : une table après celles qu'elle désigne. Les scrims et
  leurs plannings se désignent mutuellement : ils sont chargés ensemble, liens vérifiés à la fin.
- **Premier résultat, sur la sauvegarde du 2026-11-03** : **186 tables, 14 631 lignes, copie identique**. Aucun
  écart, aucune clé orpheline, aucune table inconnue. Les vraies données passent donc tous les contrôles de D1
  (types, règles, liens). **Durée totale : environ 13 secondes** (lecture 9 s, chargement 1,7 s, vérification
  1,3 s) : la copie finale du soir de bascule tiendra largement dans le gel de quelques minutes prévu.
- **Répétée automatiquement** le 5 de chaque mois avec le test de restauration, et à la demande (option `d1_copy`).
- **Les tests** : le schéma de production dans PGlite, les 14 genres de colonnes, la boucle des scrims, des matchs
  qui se désignent entre eux, des textes piégeux (apostrophes, guillemets, antislash, retours à la ligne, émojis).
  Une valeur changée, une valeur refusée, une colonne inconnue se voient, sans qu'aucune valeur n'apparaisse dans le
  rapport. Contre-épreuve : 6 détails cassés exprès, 6 détectés.

**5b, la lecture dans l'ombre : la proposition.** Elle seule montre D1 sous le vrai trafic, avec ses vraies
lenteurs, pendant deux semaines (avec si possible un soir de match). Trois façons de faire :

| Façon | Principe | Pour | Contre |
|---|---|---|---|
| **A. Photo de la nuit** (recommandée) | Chaque nuit, la sauvegarde est copiée dans la vraie base D1. Le jour, l'API refait une partie de ses lectures sur D1, **après** avoir répondu, et compare | Simple ; rien ne change pour les joueuses ; mesure la vraie latence de D1 | Une donnée modifiée dans la journée crée un faux écart : on le reconnaît (la ligne a changé depuis la photo) et on le met à part |
| B. Double écriture | Chaque écriture refaite aussi dans D1, en continu | Comparaison exacte ; fait aussi tourner les fonctions réécrites | Lourde, dans le chemin de chaque écriture ; identifiants tirés différemment des deux côtés |
| C. Rejeu en CI | Rejouer dans la CI des lectures enregistrées en production | Rien en production | Il faudrait enregistrer les paramètres des lectures, donc des données personnelles |

**La façon A demande deux accords explicites**, parce qu'elle touche la production :

1. **Copier chaque nuit les données de production dans la base D1 `owwomenscup-db`.** C'est la base vide créée au
   lot 2, en juridiction européenne, sur le compte de l'association. Les données y vivraient en double, comme dans
   les sauvegardes R2. La copie partirait de la CI. Il faudra peut-être une clé Cloudflare avec le droit d'écrire
   dans D1 (à vérifier sur la clé actuelle).
2. **Brancher cette base sur l'API, en lecture seule, pour la comparaison.** C'est un changement de configuration
   du Worker de l'API. Aucune écriture, aucune réponse aux joueuses ne passerait par D1. Une panne de D1 ne
   ferait que manquer une comparaison.

**Les deux accords ont été donnés le 2026-11-03** (« Oui, je t'autorise », pour chacun).

**5b-1, la photo de la nuit, faite le 2026-11-04.**

- **Une précaution en plus, proposée et appliquée : les tables de secrets ne sont jamais copiées.** C'est moins que
  l'accord, jamais plus. Sont concernés :
  - identifiants et sessions de connexion, clés de signature, secrets de la double authentification ;
  - jetons des intégrations et des espaces, abonnements aux notifications.

  Cela fait 17 tables, plus les 2 tables de journal qui en dépendent. Elles restent en un seul endroit jusqu'à la
  bascule. Un test oblige à décider pour toute nouvelle table dont une colonne ressemble à un secret : l'écarter,
  ou la garder avec une raison écrite.
- **Chaque nuit, après la sauvegarde.** Le workflow `db-d1-photo` part à la fin de chaque sauvegarde réussie, pas à
  une heure fixe : GitHub lance la sauvegarde « de 2 h 17 » vers 9 h 35 UTC. Il restaure la sauvegarde sur la
  machine jetable, **vide la base D1**, la recharge, la relit table par table, et ne note l'heure de la photo
  (celle de la sauvegarde) que si tout est identique.
- **Premier passage, lancé à la main, sur la sauvegarde du 2026-11-03** :
  - 167 tables copiées, **14 413 lignes, identiques** ;
  - aucune clé orpheline, 19 tables de secrets laissées vides ;
  - environ une minute, la base étant à Francfort et la machine de GitHub aux États-Unis.

  La clé Cloudflare de la CI avait déjà les droits nécessaires.
- **Premier passage automatique, le 2026-11-04 : échoué, puis corrigé le jour même.**
  - **La cause** : en vidant la base de la veille, les équipes partaient avant le vivier. Leur suppression ôtait
    l'équipe d'une entrée « placée », ce que la règle `tournament_pool_entries_check` refuse. La première photo,
    faite sur une base vide, ne pouvait pas le montrer.
  - **Aucun dégât** : l'échec s'est produit dans un envoi atomique, et la photo de la veille est restée intacte.
  - **La correction** (API `32d5c7c`) : la base se vide dans l'ordre des liens, et un test reproduit le cas.
  - **En plus**, sur ton accord : la vérification relit les tables par paquets. Elle prend 4,3 s au lieu de
    27,5 s.
  - **La photo relancée sur la sauvegarde du 2026-11-04** : 14 478 lignes, identiques.

**5b-2, les lectures comparées, allumées le 2026-11-04.**

- **Comment.** Le client de l'API vers Supabase confie chaque requête à un observateur
  (`utils/db/d1/shadow.ts`). L'observateur note la requête sans la changer. Quand une **lecture** se termine,
  une fois sur vingt, il la refait sur la photo D1, **après** la réponse aux joueuses, et compare : mêmes lignes,
  même erreur, même compte. Les dates sont ramenées au même format, et l'ordre ne compte que si la requête le
  demande.
- **Ce qui n'est jamais comparé** : les écritures, les tables de secrets et les lectures qui s'y rattachent, et
  tout quand la photo manque ou date de plus de 48 h.
- **Les verdicts**, au journal du Worker de l'API (`[d1-shadow]`, sans aucune valeur) :
  - **identique** ;
  - **fraîche** : différent, mais Supabase rend une ligne modifiée après la photo, donc écart attendu ;
  - **écart** : à examiner ;
  - **non rejouée** : la façade ne sait pas refaire la requête.
- **Sans risque pour les joueuses.** Une erreur de l'observateur ou de D1 ne remonte jamais. Au plus
  4 comparaisons à la fois. Le taux est un réglage du Worker (`D1_SHADOW_RATE`) : remis à `0`, il coupe tout.
- **Le site** reçoit la même petite modification de `utils/supabase.ts` (fichier partagé). Sans observateur, elle
  ne fait rien.
- **Les tests** : le vrai constructeur de requêtes de supabase-js face à un faux Supabase, et la photo dans un D1
  local. Ils vérifient :
  - la requête et la réponse inchangées ;
  - chaque verdict ;
  - ce qui n'est jamais comparé ;
  - une panne de D1 sans effet.

  Contre-épreuve : 12 détails cassés exprès, 12 détectés.
- **En deux déploiements** : d'abord la base branchée avec la comparaison coupée, puis le taux passé à 5 %.

## 4. L'autre voie : quitter Supabase en gardant Postgres

Quitter Supabase fait perdre PostgREST, donc supabase-js, **quelle que soit la base d'arrivée** **[doc]**. La façade du
lot 3 reste à écrire, mais vers Postgres. Ensuite, presque tout est repris tel quel par une sauvegarde et une restauration :

- fonctions, verrous ;
- déclencheurs (sauf le temps réel) ;
- jsonb, tableaux, `unaccent`.

| Base (via Hyperdrive, gratuit sur le forfait payant [doc](https://developers.cloudflare.com/hyperdrive/platform/pricing/)) | Prix / mois | Europe | Sauvegardes |
|---|---|---|---|
| **PlanetScale Postgres** PS-5 | ~5 $, **facturable sur la facture Cloudflare** | Francfort / Irlande | toutes les 12 h, retour dans le temps sur 2 jours |
| **Neon** | 0 $ (1 Go, mise en veille) à ~19 $ (toujours allumée : les tâches de chaque minute l'empêcheraient de dormir) | Francfort | 6 h à 7 jours ; propose une API compatible PostgREST, à vérifier avec supabase-js |
| **Supabase Pro** (rester) | 25 $ | Irlande (actuel) | quotidiennes, 7 jours |

Cette voie demande **~20 à 28 jours** :

- lots 1, 5, 6, 7 identiques ;
- façade vers Postgres plus simple : 6–9 j ;
- temps réel publié par l'API : 3–5 j ;
- pas de lot 2 ni de lot 4.

La contrepartie : un fournisseur de plus, et 5 à 19 $ par mois.

## 5. Décisions pour la propriétaire

1. **Lot 1** : décidé et **fait** le 2026-11-02.
2. **Le moteur** : **D1, choisi le 2026-11-02**, sans se presser (voir « Rythme choisi »). La voie Postgres de la
   section 4 reste décrite pour mémoire.
3. **Un relevé `pg_dump --schema-only` de la production** : accordé et fait le 2026-11-02
   (`database/schema-prod.sql` dans conference-api). À refaire avant la copie (lot 5).
4. **Lot 2** : fait le 2026-11-03, base `owwomenscup-db` créée en juridiction `eu` (Europe de l'Est) sur ton accord.
5. **Latence** : mesurée le 2026-11-03 (section « Mesure de latence »). Francfort `eu` gardée, Londres supprimée.
6. **Lot 3, la façade** : fait le 2026-11-03 (« Go lot 3 »), avec 3g (colonnes sensibles) et la correction de trois
   pannes de production accordées le même jour.
7. **Lot 4, la logique de la base dans le code** : **fait le 2026-11-03** (« go lot 4 »), sous-lots 4a à 4g un par
   un (4f coupé en deux sur ton accord : TCG, puis Women's Library), ainsi que la correction de la façade (`ilike`
   sur une table embarquée). Les 36 fonctions que l'API appelle sont réécrites et comparées à Postgres, les 15
   autres tranchées, les déclencheurs repris.
8. **Lot 5, copie et répétition** : lancé le 2026-11-03 (« go lot 5 »). 5a fait le même jour : copie identique sur
   la sauvegarde (186 tables, 14 631 lignes, environ 13 s). **5b attend deux accords** (section « Lot 5 ») :
   copier chaque nuit les données dans la base D1, puis la brancher sur l'API en lecture seule.
