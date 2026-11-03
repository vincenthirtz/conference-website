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
- **Better Auth** a son dialecte D1 intégré : une ligne de configuration (déjà essayé, voir AUTH-BETTER-AUTH.md).
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
  - **Relevé : aucune fuite aujourd'hui par une route publique.** Le classement MVP public montre le BattleTag des
    MVP par une copie (`winner_battle_tag`) que la clé publique lit déjà.
- **3f, les pages publiques du site.** Leurs 147 lectures propres se traduisent toutes. Elles ne lisent que deux des
  21 colonnes, à dessein :
  - `team_members.user_id`, qui est l'identifiant du profil public `/player/[userId]` ;
  - `team_members.battle_tag`, masqué (sans le numéro après « # ») avant d'atteindre la page.

  Le mode public accepte ces deux exceptions nommées, avec leur raison. `*` sur `team_members` reste refusé. Ce
  contrôle lit le clone voisin du site ; il tourne sur ce PC et se met de côté dans la CI de l'API, comme au lot 1d.

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
7. **Lot 4, la logique de la base dans le code** : à lancer sur ton feu vert. C'est le lot le plus long (15–22 j) et le
   plus risqué : les 36 fonctions (argent virtuel du TCG et de la Bibliothèque compris), les 64 déclencheurs, les
   vues.
