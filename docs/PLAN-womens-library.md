# Plan — Women's Library (monde virtuel du TCG)

> Établi le **2026-10-19**. La **Women's Library** est un monde isométrique : les joueuses s'y
> baladent, achètent des meubles avec les pièces du TCG et décorent leur appartement. Les lieux
> communs sont :
> - le **hall**, qui affiche les annonces Discord ;
> - la **Grande salle de lecture**, un lieu de sécurité qui a la taille d'une bibliothèque
>   universitaire ;
> - les **QG d'équipe**.
>
> Le partage du travail est le même que pour le TCG ([PLAN-tcg-2.md](./PLAN-tcg-2.md)) : le code
> métier (routes, services, SQL, migrations) va dans **conference-api**, ce dépôt porte l'UI, les
> assets graphiques et les copies synchronisées. Les règles du TCG s'appliquent sans rediscussion :
> la monnaie se gagne, elle ne s'achète pas, et aucune nouvelle source de pièces n'est créée.
>
> Dans le code, le préfixe est `library_` (tables, routes, `features/player/library`). La salle de
> sécurité a le type `reading_room`.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) · M (quelques
> heures) · L (chantier).

---

## 0. Décisions

| Sujet | Décision | Conséquence |
|---|---|---|
| Nom | **Women's Library** | « The Women's Library » est aussi le nom d'un fonds d'archives de la LSE, à Londres. Le domaine est différent et le risque faible, mais il faut le savoir avant d'en faire une marque |
| Style graphique | **Réaliste et léger** : de la 3D rendue hors ligne en sprites 2D, sans voxels (voir la section 2) | Pipeline Blender en place depuis le lot 1 (`tools/library-assets/`) |
| Taille des cases | **0,5 m** (décidé le 2026-10-19) | Déco plus fine, proportions proches de Habbo : un avatar fait environ 130 px CSS de haut |
| Avatars | **Faits maison** : pas de MakeHuman ni de Mixamo | Seul le corps vient du bundle CC0 « Human Base Meshes ». Squelette, poids, vêtements, cheveux et animations sont générés par `render_avatar.py` |
| Chat | **Un chat interne**, dans le hall, les appartements ouverts et les QG (voir le lot 6). La Grande salle de lecture reste silencieuse | Il faut un vrai dispositif de modération, et une équipe pour le tenir |
| Accès | **Compte obligatoire** | Pas de visite anonyme, même en lecture |
| Mineures | **Interdites** | Attestation de majorité à l'entrée (voir le lot 2). Les contenus de sécurité restent ouverts à toutes hors du monde (voir le lot 8) |
| Charte | **Écrite plus tard** | Elle bloque l'ouverture publique, pas la bêta fermée. En attendant, `/about` et `/association` continuent d'annoncer une charte qui n'existe pas |

## 1. Sur quoi on s'appuie

| Brique | Existant | Ce que la Library en fait |
|---|---|---|
| Pièces | `tcg_wallets` (un cache) et `tcg_wallet_entries` (le registre, une écriture unique par source). Le débit atomique `tcg_purchase_booster` verrouille la ligne du porte-monnaie | `library_buy_furniture` en est une copie conforme |
| Économie | Au 13/10 : 35 440 pièces produites, 11 600 dépensées, 28 comptes à 300 pièces ou plus | La boutique de meubles est le débouché qui manque |
| Annonces Discord | `news-forwarder.js` (bot) envoie vers `/api/news` avec le tag `announcements` | Le panneau du hall lit ces news, sans rien changer au bot |
| Équipes | `team_members` (user_id, team_id, role) et `teams.discord_channel_id` | Accès aux QG et porte vers le salon Discord |
| Temps réel | Presence déjà en service (`useCasterPresence`). Pas de Broadcast. Tables métier réservées au service role | Presence et Broadcast sur canaux privés |
| Signalement | `support_tickets` : anonyme possible, ping de la modération en gravité haute. Page `/support` et commande bot `/signalement` | Le guichet et le bouton « signaler » y versent |
| Blocage | Seul `tcg_trade_blocks` existe (unilatéral, silencieux) | Modèle du blocage dans la Library |
| Âge | Seule la table `adherents` a une `birth_date`. Un compte joueuse n'a pas d'âge | Il faut une attestation, et refuser les adhérentes mineures connues |
| PWA | Un service worker en prod (`public/sw.js`) | Il met les sprites en cache après la première visite |

**Ce qui manque et pèse sur le plan :**

- **Il n'existe aucune charte anti-harcèlement**, et il n'y a pas de page de ressources d'aide.
- On ne peut pas signaler un contenu, il n'y a pas de filtre de mots, et il n'y a pas de rôle staff
  dédié à la sécurité : seuls owner et admin ont `moderate_support`.
- [ETUDE-drive-et-chat.md](./ETUDE-drive-et-chat.md) déconseillait de construire un chat, et la
  messagerie entre capitaines n'a reçu aucun message. Le chat de la Library est voulu malgré tout :
  il ne vaut que si la modération est tenue (voir le lot 6).
- **Un bug existe déjà** : `tcg_buy_cosmetic` verrouille `tcg_showcases` au lieu du porte-monnaie,
  et `tcg_forge_card` ne verrouille rien. Lancée en même temps qu'un achat de booster, chacune peut
  valider un solde périmé.

## 2. Choix d'architecture

1. **Le rendu se fait en Canvas 2D, sans nouvelle dépendance.** Les salles restent petites (20×20
   cases et 30 avatars au plus). Le moteur couvre la projection isométrique, le tri de profondeur et
   la recherche de chemin (A*), et se teste en Vitest. Il est chargé par
   `next/dynamic({ ssr: false })` pour respecter le budget de bundle.
2. **Les graphismes sont de la 3D pré-rendue.** C'est la technique des jeux isométriques
   classiques : meubles et avatars sont modélisés en 3D, puis rendus **hors ligne** dans Blender en
   images WebP. Le rendu utilise une caméra orthographique isométrique, avec une lumière et des
   ombres de contact cuites dans l'image.
   - Côté navigateur, on se contente de poser des images. Le rendu est réaliste (matières, lumière,
     ombres) pour le coût d'un `drawImage`, sans 3D temps réel, sans shader et sans charge GPU.
   - **Meubles** : des modèles réalistes sous licence CC0 (Poly Haven), complétés au besoin par le
     Furniture Kit de Kenney (CC0, plus stylisé). Chaque meuble a 4 rotations, rendues en 2× pour
     les écrans haute densité.
   - **Avatars, faits maison** : seul le corps nu vient du bundle CC0 « Human Base Meshes » de la
     Blender Studio. `render_avatar.py` génère tout le reste :
     - le squelette et ses poids ;
     - les vêtements, taillés dans le corps, qui le couvrent toujours du cou aux chevilles ;
     - les cheveux, en volumes ;
     - les poses : attente, marche en 8 images et assise.
     - Les 8 directions sont rendues, sans miroir, pour que la lumière reste cohérente, soit
       80 images par avatar.
     - En v1, 12 avatars : 6 carnations, 6 coiffures, des tenues variées.
     - La personnalisation libre (coiffure, tenue et leurs couleurs) arrive au lot 13 : des calques
       rendus en niveaux de gris, teintés dans le navigateur (décidé le 2026-10-20).
   - **Le pipeline est scripté** (`tools/library-assets/`, Blender en ligne de commande).
     - Il lit le catalogue synchronisé depuis l'API et produit les WebP, plus un manifeste JSON
       (empreinte au sol, point d'ancrage, hauteur d'assise).
     - Les images sont servies depuis `public/library/` et chargées salle par salle.
     - **Seuls les sprites rendus sont versionnés**, jamais les fichiers sources Mixamo, dont la
       licence interdit la redistribution.
     - Un fichier `CREDITS` liste les sources. Les licences sont revérifiées à chaque import de pack.
   - **Budget** : environ 1 Mo par salle meublée et 300 Ko par feuille d'avatar. Aucune image n'est
     chargée hors de la Library, et une salle ne charge que les avatars présents.
   - Deux options sont écartées. three.js en temps réel est déjà en dépendance, mais il sollicite le
     GPU et la batterie sur mobile, et son rendu varie selon les appareils. L'illustration à la main
     dépendrait d'un·e artiste et demanderait 4 dessins par meuble.
3. **Le client ne porte rien d'important.** Les positions et les emotes passent par Supabase
   Realtime (Presence et Broadcast) sur des **canaux privés**, protégés par Realtime Authorization
   (policies sur `realtime.messages`). Un clic produit un seul message, la case visée, et rien de
   tout cela n'est enregistré.
   - Les achats, le placement des meubles, les accès et les signalements passent par l'API
     (idempotente et rate-limitée), qui diffuse elle-même l'événement après l'écriture.
4. **Le catalogue de meubles est en code** (`config/library/furniture.ts` dans l'API, synchronisé
   vers le site). Chaque meuble a une clé, une empreinte, un prix, des rotations et des propriétés
   (assise, empilable). C'est la source de vérité, à la fois pour les collisions côté API et pour le
   pipeline graphique.
5. **Le chat passe par l'API, jamais directement de navigateur à navigateur.** Un message est
   envoyé à l'API, qui le vérifie (accès à la salle, mute, rate-limit, filtre), l'enregistre, puis
   le diffuse elle-même.
   - Il circule sur un canal `library:chat:<room>` où seul le serveur a le droit d'écrire, ce qui
     rend impossible de parler sous le nom d'une autre.
   - Le message s'affiche en bulle au-dessus de l'avatar et dans le fil de la salle. Les emotes
     restent disponibles.
6. **Rien n'appartient à Habbo** : ni le nom, ni les sprites, ni les sons, qui sont la propriété de
   Sulake.

**Données** (une migration dans conference-api) :

- `library_avatars` (tenant_id, user_id, nickname, look jsonb, **adult_attested_at**)
- `library_inventory` (id, tenant_id, user_id, furniture_key, acquired_at, source_ref unique)
- `library_rooms` (id, tenant_id, kind `hall|reading_room|team_hq|apartment`, owner_user_id,
  team_id, name, access `private|open|team`)
- `library_room_items` (room_id, inventory_id unique, x, y, z, rotation)
- `library_blocks` (tenant_id, blocker_user_id, blocked_user_id) et `library_bans` (posés par le
  staff)
- `library_messages` (id, tenant_id, room_id, user_id, body, created_at, hidden_at, hidden_by) et
  `library_mutes` (tenant_id, user_id, room_id, null pour toute la Library, until, by, reason)
- La fonction SQL `library_buy_furniture` reprend `tcg_purchase_booster` : verrou sur le
  porte-monnaie, somme du registre, puis écriture. Elle ajoute le `source_kind` `furniture_purchase`
  à la contrainte, en supprimant puis recréant la liste complète. **Relire `pg_constraint` avant
  d'appliquer.**
- Conventions habituelles : `tenant_id NOT NULL` en `RESTRICT`, RLS avec une policy service_role, et
  `schema-snapshot.json` mis à jour.

## 3. Séquencement

| Lot | Titre | Impact | Effort | Où |
|---|---|---|---|---|
| 0 | Correctif des verrous du porte-monnaie | 🟥 | S | api |
| 1 | Spike : moteur, pipeline graphique, canaux privés | 🟥 | M | site |
| 2 | Données, boutique, avatar, attestation de majorité | 🟥 | M | api |
| 3 | Assets de départ : catalogue, avatars, décors | 🟥 | L | site + api |
| 4 | Mon appartement (en solo) | 🟥 | L | site + api |
| 5 | Multijoueur et sécurité de base | 🟥 | L | api + site |
| 6 | Chat interne et sa modération | 🟥 | L | api + site |
| 7 | Le hall et ses annonces | 🟧 | M | site (+ api) |
| 8 | La Grande salle de lecture, lieu de sécurité | 🟥 | M | site + api |
| — | **Bêta fermée** (staff et 2 ou 3 équipes) | | | |
| — | **Ouverture publique**, une fois la charte écrite et la modération organisée | | | asso |
| 9 | Les QG d'équipe | 🟧 | M | api + site |
| 10 | Après l'ouverture | 🟩 | — | — |
| 11 | Le grand catalogue : 200 meubles et plus, variantes de couleur, sets thématiques | 🟧 | L | site + api |
| 12 | Le décor de pièce : sols, papiers peints, fenêtres, portes | 🟧 | M | site + api |
| 13 | L'avatar personnalisable, par calques | 🟧 | L | site + api |
| 14 | Durcissement avant la bêta (audit du 2026-10-20, P1) | 🟥 | L | api + site |

**Rien n'ouvre, même en bêta, avant la fin des lots 5, 6 et 8.** Les lots 11 à 13 (ajoutés le
2026-10-20) ne bloquent pas l'ouverture : ils avancent en parallèle.

---

## Lot 0 · Correctif du porte-monnaie — 🟥 / S (api)

- `tcg_buy_cosmetic` et `tcg_forge_card` doivent verrouiller `tcg_wallets ... FOR UPDATE`, comme
  l'achat de booster. Ça passe par une migration et un `tcgWalletAtomicSql.test.ts` étendu.
- Ce correctif est à faire même si la Library ne se fait pas.

## Lot 1 · Spike — 🟥 / M (site)

- **Moteur** (`features/player/library/engine/`) : projection, tri de profondeur, A* et clic pour
  marcher, sur une salle en dur, sans réseau.
- **Pipeline graphique** :
  - installer Blender ;
  - rendre 3 meubles Poly Haven (un rayonnage, un fauteuil, une lampe) et des avatars animés faits
    maison ;
  - revérifier les licences des sources.
- **Temps réel** : deux navigateurs sur un canal privé de test. Presence et Broadcast doivent
  passer, et la policy doit refuser un compte non autorisé.
- **Mesures** :
  - images par seconde avec 30 avatars sur un téléphone moyen ;
  - poids des sprites et du chunk ;
  - quotas Realtime de notre plan Supabase.
- **Fini quand** le go/no-go est écrit ici, avec un rendu jugé assez réaliste et un budget tenu.

**Résultat (2026-10-19) — GO pour Canvas 2D et la 3D pré-rendue, deux mesures restent à faire.**

- **Moteur** : `features/player/library/engine/` (projection, A*, tri de profondeur topologique,
  marche, rendu à la demande, feuilles d'avatars), testé par 80 tests unitaires. La démo est sur
  `/dev/library-spike`, avec un 404 en production.
  - Cases de 0,5 m (décidé le 2026-10-19). Le contrat est dans `tools/library-assets/iso_common.py`
    et dans le manifeste (`tile.meters`), et le moteur refuse un manifeste qui ne le respecte pas.
  - Directions des avatars : 0 = haut de l'écran, puis dans le sens horaire jusqu'à 7, 4 étant vers
    la caméra.
  - La marche avance selon la distance parcourue (`strideMeters` = 1,33 m par cycle), donc sans
    pieds qui glissent.
- **Pipeline** : `tools/library-assets/` (voir son README).
  - **Meubles** : les 3 meubles Poly Haven sont rendus en 4 rotations, soit 162 Ko pour 12 sprites.
  - **Avatars faits maison** : 12 avatars, sur une feuille de 80 images chacun (8 directions ×
    attente, marche en 8 images, assise). Le rendu prend environ 2 min par avatar, et une feuille
    pèse **de 325 à 356 Ko** (4 Mo pour les 12), un peu au-dessus des 300 Ko visés.
  - **Licences** : Poly Haven et le bundle « Human Base Meshes » sont en CC0. Aucun outil extérieur
    n'est nécessaire (ni MakeHuman ni Mixamo).
- **Performances** : 60 images par seconde avec 30 avatars, soit environ 1 ms de JS par image.
  Mesuré sur ordinateur, en Chromium headless, à DPR 1.
- **Reste à faire** :
  - la mesure sur téléphone ;
  - le test des canaux privés Realtime (lot 5), qui demande une policy sur `realtime.messages`, donc
    une migration à appliquer ;
  - le poids du chunk du moteur ;
  - des morphologies variées : les 12 avatars partagent le même corps.
- **Le rayonnage Poly Haven est vide** : le lot 3 le garnit de livres (sets CC0).

## Lot 2 · Données, boutique, majorité — 🟥 / M (api)

- Écrire la migration de la section 2 dans `conference-api/database/migrations/`. C'est toi qui
  l'appliques.
- Créer le catalogue (`config/library/furniture.ts`) et les routes `features/player/library/*` avec
  `defineSubjectRoute`, qui exige un compte :
  - `GET catalog`
  - `GET me` (avatar, inventaire, solde)
  - `POST furniture/buy` (Idempotency-Key, rate-limit)
  - `PUT avatar` (pseudo filtré)
  - `POST attest-adult`
- **Attestation de majorité** :
  - À la première entrée, la joueuse coche « j'ai 18 ans ou plus », et la date est enregistrée.
  - Sans attestation, toutes les routes renvoient `403 LIBRARY_ADULT_REQUIRED`, et la policy
    temps réel refuse aussi.
  - Une adhérente dont la `birth_date` connue la rend mineure est refusée, même si elle a attesté.
  - On ne vérifie pas de pièce d'identité : ce serait disproportionné, et ce sont des données
    sensibles.
- Caler le barème sur le booster (300 pièces) : de 50 à 100 pour un petit meuble, de 500 à 1 000 pour
  une pièce maîtresse. On ne revend pas un meuble contre des pièces.
- Écrire l'OpenAPI et les tests (routes et SQL), puis synchroniser vers le site.
- **Fini quand** un double clic sur « acheter » ne débite qu'une fois, et qu'un compte sans
  attestation est refusé partout.

## Lot 3 · Assets de départ — 🟥 / L (site + api)

- Un catalogue d'environ 40 meubles. Il comprend le mobilier de la Grande salle de lecture :
  rayonnages, tables de lecture, lampes à abat-jour vert, fauteuils, échelles, globes.
- Une douzaine d'avatars, ainsi que les sols, murs et fenêtres.
- Le décor fixe du hall et de la Grande salle de lecture.
- Les sprites sont dans `public/library/`, le manifeste est généré et `CREDITS` est à jour.
- **Fini quand** le pipeline régénère tout d'une seule commande, et que chaque meuble du catalogue
  de l'API a ses 4 rotations.

## Lot 4 · Mon appartement — 🟥 / L

- Page `/player/library`, en français et en anglais, chargée à la demande. Chaque joueuse a un
  appartement, créé à sa première visite et privé par défaut.
- Mode déco : poser, déplacer, pivoter et ranger. L'API vérifie la propriété du meuble, les bornes
  de la salle et les collisions. La boutique et l'inventaire s'ouvrent en panneaux. S'y ajoute un
  choix d'avatar et de couleur de tenue.
- Points d'entrée : un lien dans le menu compte (`PLAYER_LINKS`) et une tuile sur l'écran TCG. On
  n'ajoute pas de 6e onglet de navigation, car la barre est figée à 5 entrées, test compris.
- **Fini quand** une joueuse meuble son appartement, recharge la page et retrouve tout à sa place.

## Lot 5 · Multijoueur et sécurité de base — 🟥 / L

C'est la condition de toute ouverture.

- Canaux privés `library:room:<id>`, avec une fonction SQL `library_can_join(topic)` qui vérifie
  l'attestation, l'accès à la salle, les bannissements et les blocages.
- Presence indique qui est là. Broadcast transporte la case visée, les emotes et les phrases
  prédéfinies.
- L'appartement peut être privé ou ouvert, et sa propriétaire peut expulser une visiteuse.
- **Bloquer** : les deux personnes ne se voient plus et n'entrent plus l'une chez l'autre. La
  personne bloquée n'en est pas avertie.
- **Signaler un avatar** : crée un `support_tickets` de catégorie `behavior`, avec la salle en
  contexte. Un motif « mineure présumée » mène à un bannissement par le staff.
- **Bannir de la Library** : réservé au staff qui a `moderate_support`.
- **Fini quand** deux comptes se voient bouger, et qu'un blocage ou un bannissement s'applique sans
  recharger la page.

## Lot 6 · Chat interne et sa modération — 🟥 / L

- **Où** : le hall, les appartements ouverts et les QG. La Grande salle de lecture reste
  silencieuse, puisqu'on y est invisible par défaut et que parler y révélerait sa présence.
- **Envoi** : `POST /api/player/library/rooms/:id/messages`. L'API applique dans l'ordre :
  - les mêmes droits que l'entrée dans la salle ;
  - le mute et le bannissement ;
  - le rate-limit, environ 5 messages par 10 s ;
  - le refus des doublons ;
  - 200 caractères au plus ;
  - le filtre.
  Elle enregistre ensuite le message et le diffuse sur `library:chat:<room>`. La policy refuse
  toute écriture cliente sur ce canal.
- **Filtre** : une liste FR/EN d'insultes et d'injures haineuses, versionnée dans l'API. Un message
  qui tombe sous la liste est refusé, avec un message à son autrice. Les numéros de téléphone et les
  e-mails sont masqués, pour éviter qu'on divulgue les coordonnées de quelqu'un.
- **Pas de lien cliquable, pas d'image, pas de message privé.** Un message privé échappe aux yeux de
  la salle, et c'est le premier canal du harcèlement.
- **Bloquer** masque aussi les messages de la personne bloquée.
- **Signaler un message** crée un `support_tickets` qui fige une copie du message et des
  10 précédents. La preuve survit ainsi à la purge.
- **Modération** :
  - Le staff qui a `moderate_support` masque un message (il disparaît chez toutes), met en sourdine
    une personne pour une durée donnée, dans une salle ou partout, ou la bannit.
  - La propriétaire d'un appartement peut mettre en sourdine ou expulser chez elle.
  - Un écran staff dans le hub de modération montre les messages récents par salle, avec ces
    actions.
- **Conservation** : 30 jours, puis une purge par cron. Les messages entrent dans l'export et la
  suppression de compte (`utils/player/personalDataTables.ts`).
- **Prérequis humain** : avant l'ouverture publique, l'association désigne qui modère et à quelles
  heures. Sans ça, le chat reste fermé et seules les emotes fonctionnent. Un interrupteur par tenant
  permet de couper le chat sans redéployer.
- **Fini quand** :
  - un message envoyé apparaît chez les autres en moins d'une seconde ;
  - un message filtré est refusé ;
  - un message masqué disparaît partout ;
  - une personne en sourdine ne peut plus écrire ;
  - un signalement contient bien la copie du message.

## Lot 7 · Le hall — 🟧 / M

- Une seule salle commune par tenant, avec un décor fixe.
- **Le panneau d'annonces** affiche les dernières news publiées avec le tag `announcements`, qu'elles
  viennent de Discord ou du site. Un clic ouvre l'article, avec le rendu markdown existant (sans
  HTML brut). Si aucune route publique ne filtre par tag, il faut en ajouter une dans l'API.
- Portes vers la Grande salle de lecture, vers le QG de son équipe, et vers les appartements ouverts
  (seulement ceux dont la propriétaire a choisi d'apparaître dans la liste).
- **Fini quand** une annonce postée sur Discord apparaît sur le panneau à l'entrée suivante dans le
  hall.

## Lot 8 · La Grande salle de lecture, lieu de sécurité — 🟥 / M

- C'est le cœur de la Library : une immense salle de bibliothèque universitaire, avec rayonnages,
  tables de lecture et recoins. Elle est **silencieuse** : pas de phrases, seulement quelques emotes
  douces.
- **Le mode discret est activé par défaut.** On entre sans être vue, et personne ne sait qui est
  là. On ne devient visible que par choix explicite. La fréquentation de la salle n'est jamais
  mesurée par personne.
- Les rayonnages donnent accès aux contenus :
  - les ressources d'aide (3018 cyberharcèlement, 3919 violences faites aux femmes, 17 ou 112, 114
    par SMS, 119), **liste à faire valider par l'association** ;
  - des guides pour réagir au harcèlement en jeu, sur Discord et en stream ;
  - la façon dont l'association traite un signalement ;
  - la charte, avec un emplacement réservé jusqu'à son écriture.
- **Le guichet** ouvre `/support` pré-rempli (catégorie `behavior`, option anonyme proposée) via
  `utils/support/prefill.ts`.
- **Une sortie rapide** : un bouton quitte la Library pour une page neutre.
- **Les mêmes contenus vivent aussi hors du monde**, sur une page simple sans canvas et sans compte.
  Elle reste ouverte à toutes, **mineures comprises**, car ce sont elles que le 119 et le 3018
  concernent d'abord. La page sert aussi les lecteurs d'écran.
- Dans l'API, on corrige deux écarts du ticket de signalement :
  - le captcha annoncé dans l'OpenAPI n'est pas vérifié ;
  - `reporter_user_id` n'est jamais rempli pour un signalement non anonyme.
- **Fini quand** un signalement part bien du guichet, et que la page publique des ressources est en
  ligne.

## Lot 9 · Les QG d'équipe — 🟧 / M

- Chaque équipe a une salle, créée à la première visite. Seuls ses membres ayant attesté leur
  majorité, et le staff, y entrent.
- Déco : chaque membre prête des meubles de son inventaire. Ils lui reviennent si elle quitte
  l'équipe ou si l'équipe est dissoute.
- Un panneau affiche le prochain match, à partir des données du tableau de bord. Une porte ouvre le
  salon Discord de l'équipe (`teams.discord_channel_id`).
- Le chat du QG (lot 6) est réservé aux membres. La capitaine et la manager peuvent y masquer un
  message.
- **Fini quand** une membre entre, qu'une non-membre est refusée par la policy, et qu'un départ
  d'équipe rend bien les meubles prêtés.

## Lot 10 · Après l'ouverture — 🟩

- ~~Des avatars personnalisables par calques~~ : avancé au lot 13.
- Des permanences du staff dans la Grande salle de lecture (badge « bibliothécaire »), et un rôle
  staff dédié à la sécurité.
- ~~Des meubles d'événement~~ : avancés au lot 11.
- Un tableau de bord agrégé : pièces dépensées en meubles, appartements meublés, visites. La salle de
  lecture n'y figure jamais.

## Lot 11 · Le grand catalogue — 🟧 / L (site + api)

Ajouté le 2026-10-20. Le but est de passer de 49 meubles à **200 et plus**.

- **Sources** : des modèles CC0 uniquement (Poly Haven, Kenney, Quaternius), ou faits maison dans
  le pipeline. Les licences sont revérifiées à chaque import, et `CREDITS` est tenu à jour.
- **Variantes de couleur** : une variante est **une clé de catalogue à part entière** (`sofa_blue`),
  rattachée à une `family`. L'achat, l'inventaire et le placement restent inchangés, et il n'y a pas
  de migration. La boutique regroupe les variantes d'une famille et propose de choisir la teinte.
- **Sets thématiques** : esport, bibliothèque, cosy, jardin d'hiver… Un set est un regroupement dans
  le catalogue, pas un paquet vendu à part.
- **Meubles d'événement** (Halloween, Octobre Rose) : limités **dans le temps**, jamais en quantité.
  La fenêtre de vente vit dans le catalogue, et l'achat la vérifie côté API.
- **Barème** : celui du lot 2, calé sur le booster (de 50 à 1 000 pièces). La monnaie se gagne, elle
  ne s'achète pas.
- **Boutique** : catégories, sets, recherche, filtres et pagination, dans un panneau accessible.
- **Poids** : les images sont chargées salle par salle, et le manifeste ne doit pas grossir pour
  chaque visite (il faut le découper ou le compacter). Le budget reste d'environ 1 Mo par salle
  meublée.
- **Fini quand** le catalogue de l'API compte au moins 200 entrées, chacune avec ses 4 rotations
  rendues, et qu'une joueuse retrouve un meuble par set, par teinte ou par recherche.

## Lot 12 · Le décor de pièce — 🟧 / M (site + api)

Ajouté le 2026-10-20.

- Plus de sols, des papiers peints et des habillages de murs, des fenêtres et des portes. La liste
  vit dans `config/library/decor.ts` (API, synchronisée), et les sprites sortent du pipeline
  (`render_decor.py`).
- Le choix se fait dans les réglages de l'appartement, avec un aperçu. En v1, le décor reste
  **gratuit** : un décor payant demanderait une table de possession, à décider plus tard.
- Une valeur enregistrée qui disparaît de la liste retombe sur le décor par défaut
  (`resolveApartmentDecor`).
- **Fini quand** une joueuse change de sol, de murs et de fenêtres, recharge, et retrouve son décor.

## Lot 13 · L'avatar personnalisable — 🟧 / L (site + api)

Ajouté le 2026-10-20. Il reprend le premier point du lot 10.

- **Par calques** : le corps (6 carnations), la coiffure, la tenue. Chaque calque est rendu par
  `render_avatar.py` sur les mêmes 80 images (8 directions × attente, marche, assise), en **niveaux
  de gris avec un masque**. La couleur des cheveux et celle de la tenue sont **appliquées dans le
  navigateur**, puis mises en cache. Ainsi, le poids ne se multiplie pas par le nombre de teintes.
- **Le look** est un objet borné, validé par l'API (`library_avatars.look`, liste fermée en code).
  Il voyage dans la présence temps réel sous une forme compacte. Les 12 avatars actuels deviennent
  des looks prédéfinis.
- **L'éditeur** : un aperçu animé, des choix accessibles au clavier, et l'enregistrement par l'API.
- **Fini quand** une joueuse compose son avatar, et que les autres le voient tel quel dans la salle.

## Lot 14 · Durcissement avant la bêta — 🟥 / L (api + site)

Ajouté le 2026-10-20, après l'audit de la Library déployée en bêta réservée à l'owner. Ces quatre
points bloquent l'ouverture de la bêta fermée.

- **14a · Une identité fiable dans les salles.** Jusqu'ici, la présence Realtime est déclarée par la
  cliente (`userId`, pseudo, look) : une cliente modifiée peut prendre l'identité d'une autre, et le
  menu Signaler / Bloquer / Expulser viserait alors la victime. L'API remet désormais, à l'entrée
  dans la salle, un **jeton de présence signé** (salle, joueuse, pseudo, look, échéance). Les
  clientes ignorent toute présence sans jeton valide, et les gestes de modération ne visent que des
  identités vérifiées. Les déplacements et les emotes restent cosmétiques.
- **14b · Des bannissements qui survivent à la suppression du compte.** Un bannissement garde des
  empreintes d'identité **hachées avec un sel secret** (pas d'adresse en clair), sur le modèle de la
  blacklist des joueurs. Elles sont vérifiées à l'attestation de majorité et à l'entrée. Le motif
  « mineure présumée » ne doit plus se contourner en recréant un compte.
- **14c · Une bêta par liste.** En plus de `owner`, `staff` et `all`, un mode `beta` ouvre la Library
  au staff et à une liste d'équipes et de joueuses. Le staff règle le mode et la liste depuis l'admin,
  sans redéployer. Une lecture impossible du réglage laisse la porte fermée.
- **14d · Un kit de départ.** Quelques meubles offerts **en objets**, une seule fois par joueuse, à la
  création de son appartement. Aucune pièce n'est créée : la règle « la monnaie se gagne » tient.
- **Fini quand** une présence forgée n'apparaît pas et ne peut pas être signalée, un compte banni
  puis supprimé et recréé reste refusé, deux équipes de test entrent pendant que les autres sont
  refusées, et une nouvelle joueuse trouve son kit dans un appartement qui n'est plus vide.

---

## 4. Ce qu'on ne fait pas

- Aucun achat en euros : ni pièces, ni meubles, ni pass.
- Pas de revente de meubles contre des pièces, et pas d'échange de meubles en v1.
- Pas de chat dans la Grande salle de lecture.
- Pas de messages privés, de liens cliquables ni d'images dans le chat.
- Pas de chat ouvert au public sans une équipe de modération désignée.
- **Aucun accès sans compte, ni pour les mineures.** En revanche, les contenus de sécurité restent
  publics hors du monde.
- Pas de vérification d'identité.
- Pas de 3D en temps réel dans le navigateur, et pas de voxels.
- Pas d'annuaire des appartements ni des avatars. Seuls les appartements volontairement ouverts sont
  listés.
- Aucune trace de qui fréquente la Grande salle de lecture.
- Aucun nom, sprite ou son de Habbo.
- Aucune notification de plus, comme dans [PLAN-tcg-2.md](./PLAN-tcg-2.md).
