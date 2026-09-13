# TCG — cartes à collectionner

> Document de référence de la fonctionnalité TCG (_trading card game_) :
> pourquoi elle existe sous cette forme, ce que le schéma garantit, et ce qui
> reste à faire. Écrit d'après le code au 2026-09-13.
>
> Sources : [`utils/tcg/`](../utils/tcg), [`pages/api/player/tcg/`](../pages/api/player/tcg),
> [`pages/api/admin/tcg/photos.ts`](../pages/api/admin/tcg/photos.ts),
> [`pages/api/bot/v1/players/by-discord/[discordUserId]/tcg.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/tcg.ts),
> les migrations `create_tcg_tables.sql`, `create_tcg_currency_tables.sql`,
> `tcg_packs_allow_purchased.sql`, `tcg_recycle_duplicates.sql`,
> [`components/tcg/TcgCard.tsx`](../components/tcg/TcgCard.tsx) et
> [`pages/player/tcg.tsx`](../pages/player/tcg.tsx).

## 1. Ce que c'est, et pour qui

Une carte représente **une joueuse ou une équipe** du circuit. Un paquet de cinq
cartes est offert à chaque victoire, aux joueuses du camp gagnant ; il s'ouvre
depuis l'espace joueuse (`/player/tcg`), et ce qu'on possède forme une
collection.

Le public est celui de l'espace joueuse : les personnes qui jouent, pas les
visiteuses du site. La page est en `noindex` — une collection personnelle n'a
rien à faire dans un moteur de recherche — et les deux endroits publics où une
carte apparaît sont la fiche d'une joueuse (`/player/[userId]`, sa propre carte,
sans lien vers elle-même) et la fiche d'une équipe (`/team/[slug]`).

Le TCG ne crée aucune donnée de compétition : il **relit** celle qui existe. Les
paquets sont attribués depuis `applyMatchRatingIncremental`, l'entonnoir unique
des deux sources de victoire (matchs de tournoi et scrims classés, qui miroitent
dans `matches`) ; la rareté dérive des badges déjà affichés sur les fiches ; la
face d'une carte d'équipe est le nom et le logo déjà publics. Le seul objet
réellement nouveau est la **photo** d'une joueuse — et c'est aussi le seul qui
demande des garanties.

## 2. Les trois garde-fous de consentement

**C'est la section importante de ce document.** Il s'agit de la photo d'une
personne réelle, posée sur un objet que d'autres collectionnent, dans un milieu
où les joueuses subissent du harcèlement. Une carte n'est pas un avatar : elle
circule chez des tiers, elle se garde, elle s'affiche sans que la personne
représentée soit là. Les trois garde-fous ci-dessous ne sont pas des précautions
décoratives, et aucun n'est délégué à la bonne volonté de l'appelant.

### 2.1 Opt-in explicite

Aucune photo n'entre dans le TCG sans un `POST /api/player/tcg/photo` fait par
la joueuse elle-même. Une joueuse qui n'a jamais déposé n'a **pas de ligne** dans
`tcg_player_cards` : pas de carte illustrée, et surtout aucune image d'elle en
circulation. Le premier dépôt vaut accord et pose `opted_in_at` ; un second
dépôt ne réécrit pas cette date.

Côté interface, [`components/player/TcgPhotoCard.tsx`](../components/player/TcgPhotoCard.tsx)
énonce ce qui va se passer — visibilité publique, relecture par l'équipe,
retrait rétroactif — **avant** de proposer le sélecteur de fichier : un simple
bouton « envoyer une photo » aurait obtenu un consentement sans qu'il soit
éclairé.

### 2.2 Modération avant publication

Une photo déposée est `pending`. Elle n'est affichée nulle part tant qu'une
personne du staff ne l'a pas approuvée via `PATCH /api/admin/tcg/photos`
(permission `moderate_support`, journalisé `tcg_photo_approve` /
`tcg_photo_reject`). **Une photo remplacée redevient `pending`**, y compris en
remplacement d'une photo déjà approuvée — sans quoi il suffirait de substituer
n'importe quoi à un cliché validé.

Un refus **supprime le fichier du bucket**, il ne le marque pas seulement : le
bucket `teams-images` est public, et un cliché refusé — précisément parce qu'il
pose problème — resterait sinon atteignable par son URL indéfiniment. La joueuse
conserve le motif du refus et peut redéposer ; c'est le fichier qui part, pas
l'explication.

Deux asymétries assumées :

- la joueuse voit **sa propre** photo même `pending` ou `rejected` (c'est son
  écran, masquer le fichier qu'elle vient d'envoyer rendrait la relecture
  incompréhensible) ; le filtrage strict appartient au lecteur des cartes que
  **d'autres** possèdent, [`utils/tcg/readCardFaces.ts`](../utils/tcg/readCardFaces.ts) ;
- si la joueuse retire sa photo pendant la relecture, le staff reçoit un `409`
  (`NOT_PENDING`) : **sa décision prime** sur celle du staff, l'écran rafraîchit
  au lieu d'écraser.

Le contenu du fichier est vérifié par ses **magic bytes**, pas par le `mimeType`
déclaré (2 Mio maximum, PNG/JPEG/WebP, pas de SVG) : le `mimeType` est une
affirmation du client, et le bucket est public. Cf.
[`utils/uploads/imageBytes.ts`](../utils/uploads/imageBytes.ts).

### 2.3 Retrait rétroactif

`DELETE /api/player/tcg/photo` pose `revoked_at`, vide `photo_path`, remet le
statut à `none` et supprime le fichier du bucket — dans cet ordre : la base cesse
de référencer le fichier **avant** que le fichier parte, sans quoi un échec
d'écriture laisserait une ligne pointant vers un fichier disparu, c'est-à-dire
une carte cassée plutôt qu'une carte sans photo. La ligne, elle, est conservée :
`revoked_at` et `opted_in_at` sont deux faits à garder, et effacer la ligne
effacerait cette histoire.

Le retrait atteint les cartes **déjà distribuées**, et c'est une propriété du
modèle, pas une opération de rattrapage :

- `tcg_pack_cards` ne référence **que le sujet**, jamais son image. Dénormaliser
  l'URL dans les cartes rendrait le retrait impossible à honorer ;
- la face est **relue à chaque affichage** par `readPlayerFaces`, avec le filtre
  de consentement en une clause : `photo_status = 'approved'` **et**
  `revoked_at IS NULL` ;
- toute lecture de face passe par ce module — la collection, la révélation à
  l'ouverture d'un paquet, la fiche publique. La route bot, elle, ne sert
  **aucune face** : ne pas les exposer évite d'ouvrir une seconde voie d'accès
  aux photos qu'il faudrait sécuriser séparément.

Enfin, [`utils/tcg/revalidatePlayerCard.ts`](../utils/tcg/revalidatePlayerCard.ts)
régénère la fiche publique de la joueuse à **chacune des quatre transitions**
(dépôt, approbation, refus, retrait). Sans ce déclencheur, l'ISR à 300 s
laisserait une photo retirée visible jusqu'à cinq minutes. Cinq minutes seraient
acceptables pour un titre de tournoi ; elles ne le sont pas pour la photo d'une
personne qui vient de demander son retrait — une promesse de ce genre se tient en
secondes ou ne se tient pas. La régénération est best-effort : elle ne fait
jamais échouer la mutation, déjà écrite en base.

En l'absence de photo consentie, la carte retombe sur l'avatar public (que la
joueuse a elle-même choisi), puis sur un aplat de marque avec l'initiale du nom.
**Jamais de portrait inventé** : le projet n'utilise pas d'imagerie générée, et
un visage fabriqué pour représenter une personne réelle serait pire qu'un aplat.

### 2.4 Ce qui n'a pas de consentement à demander

Les **équipes** n'ont pas d'équivalent de `tcg_player_cards`. Une équipe est déjà
publiquement identifiée sur le site par son nom et son logo : il n'y a rien à
faire consentir. L'asymétrie entre les deux sujets est délibérée.

## 3. Le barème de rareté

Quatre paliers : `common`, `rare`, `epic`, `legendary`
([`utils/tcg/rarity.ts`](../utils/tcg/rarity.ts), réducteur pur).

**Il n'y a pas de seconde échelle.** Le site affiche déjà un prestige, calculé
par `computeAchievements` : champion, finaliste, podium, top cut, vainqueure de
ligue, paliers de peak rating, vétérane, série de victoires — chacun avec un
palier bronze / silver / gold / platinum. Une échelle propre au TCG, calibrée
séparément, finirait par contredire celle-ci : une joueuse « légendaire » au TCG
et sans badge sur sa fiche, ou l'inverse. On réutilise donc la calibration déjà
arbitrée.

| Origine                                  | Rareté      |
| ---------------------------------------- | ----------- |
| Badge `champion` ou `league_winner`      | `legendary` |
| Badge de palier `platinum`               | `legendary` |
| Badge de palier `gold`                   | `epic`      |
| Badge de palier `silver`                 | `rare`      |
| Badge de palier `bronze`, ou aucun badge | `common`    |

On garde la **meilleure** rareté trouvée : une joueuse cumule les badges, c'est
son plus haut fait qui décide de sa carte. Deux conséquences voulues :

- **un titre l'emporte sur un chiffre.** `champion` et `league_winner` sont
  classés `gold` par le calcul des badges mais passent `legendary` ici. Gagner un
  tournoi ou une saison est un fait unique et daté ; un rating élevé est un état,
  qui peut redescendre. Les traiter à égalité ferait valoir moins une victoire
  qu'un bon classement ;
- **pas de cas particulier pour une joueuse non classée.** Sans ligne
  `player_ratings`, aucun badge `peak_*` n'est dérivé : elle sort `common`
  d'elle-même. Un titre de tournoi, lui, compte même sans classement.

`common` est un plancher, pas un échec : toute joueuse a une carte.

Les **équipes** n'ont pas de badges. On leur applique donc directement, sur
`team_ratings.rating`, les **mêmes seuils** que ceux dont les badges `peak_*`
sont dérivés (≥ 2000 → `legendary`, ≥ 1800 → `epic`, ≥ 1600 → `rare`), plus leur
palmarès : meilleur rang 1 → `legendary` (comme le titre `champion`), rang 2 →
`rare` (comme le badge `finalist`, silver) ; au-delà, `common`, puisque `podium`
et `top_cut` sont bronze chez les joueuses. On garde la meilleure des deux
dimensions ; un `bestRank` ou un `rating` absent est un état normal, la dimension
est simplement ignorée. Aligner les deux échelles est délibéré : une équipe 3ᵉ et
une joueuse 3ᵉ doivent valoir la même chose, sans quoi le TCG dirait deux vérités
différentes sur le même tournoi.

Cette lecture vit dans un seul module,
[`utils/tcg/readTeamRarity.ts`](../utils/tcg/readTeamRarity.ts), partagé entre
l'ouverture de paquet et la fiche publique d'équipe : les deux requêtes
(`team_ratings`, meilleur `final_rankings.rank`) recopiées des deux côtés
auraient donné deux barèmes jumeaux libres de diverger. Il ne lève jamais et
retombe sur `common` — perdre une nuance de rareté ne doit ni coûter son paquet à
quelqu'un, ni faire échouer le rendu d'une page publique.

**Le brillant (`foil`) n'est pas un cinquième palier.** Il tombe à 8 %,
indépendamment de la rareté : c'est une variante d'impression, pas un degré de
prestige. Sans cette séparation, une légendaire brillante deviendrait un palier
de fait et le barème cesserait de dire la vérité sur le parcours de la joueuse.
Côté rendu, les couleurs de rareté sont celles des badges du profil
(`common`↔bronze, `rare`↔silver, `epic`↔gold, `legendary`↔platinum) : une seconde
palette aurait donné des couleurs contradictoires sur la fiche de la même
joueuse.

Rareté et brillant sont **figés au tirage** dans `tcg_pack_cards` : le palmarès
évolue, mais la carte tirée un jour donné garde ce qu'elle valait ce jour-là.
Deux exemplaires du même sujet peuvent donc différer — la collection affiche la
meilleure rareté possédée.

## 4. L'économie

Deux voies pour obtenir un paquet : le **gagner** (une victoire, un paquet) ou
l'**acheter** avec des pièces gagnées. La seconde est plus lente et choisie ; elle
ne remplace pas la première.

| Constante              | Valeur | Dérivation                                             |
| ---------------------- | ------ | ------------------------------------------------------ |
| `MATCH_WIN_COINS`      | 100    | valeur de référence de tout le barème                  |
| `SCRIM_WIN_COINS`      | 50     | `MATCH_WIN_COINS × SCRIM_RATING_WEIGHT` (0,5)          |
| `BOOSTER_PRICE_COINS`  | 300    | `3 × MATCH_WIN_COINS` — trois victoires, ou six scrims |
| `RECYCLE_REFUND_COINS` | 30     | `BOOSTER_PRICE_COINS / 10`, plancher à 1               |

Aucun de ces montants n'est écrit en dur ailleurs : **le rapport scrim/match est
importé, pas recopié.** Le dépôt pondère déjà un scrim à `SCRIM_RATING_WEIGHT`
pour le rating, avec cette justification — « un scrim informe moitié moins qu'un
match officiel » ; le même rapport vaut pour la récompense. Le prix et le barème
sont rendus **par l'API** (`GET /api/player/tcg/packs` : `boosterPrice`, `earn`,
`recycleRefund`), jamais recopiés côté client : l'interface les affiche sans les
connaître, et importer `economy.ts` dans le navigateur y ferait entrer le moteur
de rating dont il dérive ses valeurs.

### La monnaie se gagne, elle ne s'achète pas

Aucune colonne, aucun endpoint, aucune fonction du TCG ne connaît de moyen de
paiement. **Ce n'est pas un oubli, c'est une décision** :

- une monnaie achetable en argent réel + des paquets à contenu aléatoire forment
  une **loot box payante** ;
- ce dispositif est **interdit en Belgique et aux Pays-Bas**, et **surveillé par
  l'ANJ en France** ;
- le public de ce site **compte des mineures**.

Y brancher un paiement (HelloAsso, par exemple) serait une décision produit prise
en connaissance de cause, pas l'extension naturelle d'un fichier existant. La
règle est répétée à l'identique dans la migration de la monnaie,
[`utils/tcg/economy.ts`](../utils/tcg/economy.ts) et l'endpoint d'achat, pour
qu'on ne puisse pas la contourner par ignorance.

### Le registre, et le solde qui n'en est que le cache

`tcg_wallet_entries` est la **source de vérité** : chaque mouvement y est une
ligne signée (positif = gain, négatif = dépense, jamais zéro). `tcg_wallets.balance`
n'en est qu'une somme dénormalisée. « Un solde qu'on ne peut pas expliquer est un
solde qu'on ne peut pas corriger », et il faut pouvoir répondre à « d'où viennent
mes pièces ? » — d'où `GET /api/player/tcg/wallet`.

Le solde est donc **recalculé, jamais incrémenté** (`refreshBalance`) : un
incrément perdu creuse un écart définitif, un recalcul se répare tout seul au
passage suivant. Une somme négative — signe d'un registre incohérent — est
plafonnée à zéro plutôt que de faire échouer l'écriture et de laisser le cache
figé sur une valeur encore plus fausse.

`source_kind` accepté par le schéma : `match_win`, `scrim_win`,
`booster_purchase`, `admin_grant`, `card_recycled`. `source_ref` est du **texte**,
et non un uuid, parce que les sources n'ont pas toutes la même clé (un match, un
paquet, une carte `<pack_id>:<position>`).

### Achat, ouverture, recyclage

- **L'achat ne crée qu'un paquet fermé.** Le tirage appartient à l'ouverture :
  séparer les deux permet de montrer « tu as N paquets » sans avoir figé leur
  contenu, et de rejouer une ouverture ratée sans re-débiter.
- **Le débit est conditionnel au solde lu** (`.eq('balance', avant)`), et non une
  lecture puis une écriture : deux achats simultanés ne peuvent pas dépenser deux
  fois les mêmes pièces — le second reçoit `409 balance_changed`. La contrainte
  d'unicité du registre ne protège pas de ce cas, chaque achat ayant sa propre
  référence.
- **Le tirage précède la consommation.** Un vivier vide ne coûte pas son paquet
  (`409 empty_pool`, paquet toujours fermé). La réservation est atomique
  (`opened_at IS NULL`) et **relâchée** si l'écriture des cartes échoue : mieux
  vaut un paquet fermé qu'un paquet ouvert et vide, que rien ne permettrait de
  rejouer.
- **Un paquet contient cinq cartes, dont un emplacement réservé à une équipe**
  ([`utils/tcg/drawPack.ts`](../utils/tcg/drawPack.ts)). Tirer chaque emplacement
  indépendamment laisserait sortir des paquets entièrement composés d'équipes —
  rare, mais absurde le jour où ça arrive. Quand un vivier manque, l'autre comble.
  La rareté est calculée **après** le tirage, pour les cinq sujets retenus
  seulement : l'ordre inverse aurait coûté une requête de palmarès par candidate,
  ou obligé à inventer un barème réduit « spécial tirage », c'est-à-dire la
  seconde échelle que le projet refuse.
- **Le recyclage d'un doublon** rend `RECYCLE_REFUND_COINS` et referme la boucle
  — gagner, ouvrir, recycler, racheter. Le **dernier exemplaire est intouchable**
  (`409 not_a_duplicate`) : sans ce contrôle, « recycler un doublon » deviendrait
  « détruire sa collection contre de la monnaie ». La carte n'est pas supprimée
  mais **marquée** (`recycled_at`), ce qui garde le crédit correspondant
  explicable dans l'historique ; les lecteurs de collection l'ignorent.

L'ordre des écritures diffère volontairement entre les deux gestes : l'achat
**débite avant de livrer**, le recyclage **marque avant de créditer**. Même
raison dans les deux cas — mieux vaut un état réparable (des pièces prélevées
sans paquet, une carte retirée sans crédit ; les deux sont relâchés en cas
d'échec) que de la monnaie ou un paquet créés à partir de rien.

### Le drop Twitch, et pourquoi il verse des pièces

[`pages/api/webhooks/twitch/tcg-drop.ts`](../pages/api/webhooks/twitch/tcg-drop.ts)
crédite `BOOSTER_PRICE_COINS` **en pièces**, et n'insère aucune ligne
`tcg_packs`. La raison invoquée est qu'un drop de live n'a aucun match légitime à
désigner, et que lui en prêter un entrerait en collision avec le paquet de
victoire du même match (même contrainte `UNIQUE`) : la spectatrice qui joue ce
match perdrait l'une des deux récompenses. Créditer le prix exact d'un booster la
laisse l'échanger par le chemin qui existe déjà, sans inventer une seconde
sémantique de paquet.

Cette route n'est **pas opérationnelle** aujourd'hui, et deux écarts avec le
reste du TCG sont à connaître avant de s'y fier — ils sont détaillés au § 7.

### Ce que la victoire déclenche

[`utils/tcg/grantVictoryRewards.ts`](../utils/tcg/grantVictoryRewards.ts) est
appelé en dernier par `applyMatchRatingIncremental`, dans le `try` : tous les
retours anticipés du moteur de rating sont des cas où le match n'est **pas**
compté (bye, statut non final, historique déjà présent), et un match non compté
ne doit rien payer. La fonction **ne lève jamais** — une récompense ratée ne doit
empêcher ni l'application d'un score ni le calcul d'un rating.

Les **remplaçantes sont récompensées** : elles figurent dans
`match_participants` et le moteur de rating les traite comme les autres.
Inventer ici une seconde définition de « avoir joué » ferait diverger deux
systèmes qui décrivent la même rencontre.

L'annonce (`tcg.pack_granted`, un événement **par gagnante**) n'est émise que
pour les paquets **réellement insérés** : l'`upsert ... ignoreDuplicates` ne rend
que les lignes nouvellement créées, donc un rejeu ne renotifie personne. Le lien
Discord est résolu côté site — lui seul connaît la correspondance compte ↔
Discord — et une joueuse sans compte lié n'est pas une erreur : l'événement part
avec `discordUserId: null` et le consommateur décide. Côté notifications, cet
événement est **push joueuse uniquement** (désactivable dans ses préférences),
jamais un push staff ni un digest e-mail : un paquet ne périme pas, il attend sur
la page.

## 5. Modèle de données et invariants portés par le schéma

Cinq tables, toutes en RLS `service_role` seul — rien n'est lu par le client en
direct, tout passe par les routes serveur.

| Table                | Clé                    | Rôle                                                  |
| -------------------- | ---------------------- | ----------------------------------------------------- |
| `tcg_player_cards`   | `(tenant_id, user_id)` | consentement + photo modérée d'une joueuse            |
| `tcg_packs`          | `id`                   | un paquet, gagné (`victory`) ou acheté (`purchase`)   |
| `tcg_pack_cards`     | `(pack_id, position)`  | contenu figé d'un paquet ouvert                       |
| `tcg_wallets`        | `(tenant_id, user_id)` | solde — **cache** du registre, `CHECK (balance >= 0)` |
| `tcg_wallet_entries` | `id`                   | registre des mouvements — **source de vérité**        |

**Les invariants sont dans le schéma, pas dans la prudence de l'appelant.** C'est
la leçon explicitement citée par les trois migrations : le 2026-09-12, quatre
publications Discord en double ont été produites par une protection uniquement
applicative — une relecture « ai-je déjà fait ? » laisse toujours une fenêtre
entre la lecture et l'écriture.

- `UNIQUE (tenant_id, user_id, source_match_id)` sur `tcg_packs` : un match ne
  peut pas offrir deux paquets à la même joueuse. L'attribution s'écrit donc en
  `upsert(..., ignoreDuplicates: true)` — un rejeu (reprise de cron, correction
  de score, double appel) ne crée rien et n'échoue pas.
- `UNIQUE (tenant_id, user_id, source_kind, source_ref)` sur
  `tcg_wallet_entries` : une source ne peut créditer ou débiter qu'une fois. Pour
  le recyclage, `source_ref = <pack_id>:<position>` désigne **la** carte, ce qui
  donne l'idempotence gratuitement.
- `CHECK` d'exclusivité sur `tcg_pack_cards` : exactement un sujet renseigné,
  cohérent avec `subject_kind`. Sans lui, une carte pourrait n'avoir aucun sujet
  (invisible) ou deux (ambiguë) — deux états qu'aucun code d'affichage ne saurait
  traiter. Les lecteurs sautent une ligne sans sujet plutôt que d'afficher une
  carte vide : ce serait une corruption.
- `CHECK` de cohérence d'origine : `victory` **exige** un match, `purchase`
  l'**interdit**. Un achat qui citerait un match serait une victoire déguisée et
  fausserait la contrainte d'unicité.
- L'ouverture d'un paquet nullifie sa réservation via `opened_at IS NULL` dans le
  `WHERE`, et le recyclage via `recycled_at IS NULL` : deux clics simultanés ne
  peuvent pas réussir tous les deux, le second ne touche aucune ligne.

Deux décisions de modélisation méritent d'être connues avant d'y toucher :

- **pas de table `collection`.** Ce qu'une joueuse possède se déduit de ses
  paquets ouverts. Un agrégat finit par diverger du détail qui le nourrit, et au
  volume attendu le comptage à la lecture est gratuit.
- **rien n'est supprimé, tout est marqué.** `revoked_at` conserve l'accord passé,
  `recycled_at` garde le crédit explicable, le registre justifie le solde ligne à
  ligne. Effacer serait plus court et rendrait l'histoire illisible.

Quand `tcg_packs` a dû accueillir les paquets achetés, `source_match_id` est
devenu nullable **sans reconstruire l'unicité** : dans une contrainte `UNIQUE`,
deux `NULL` sont distincts en Postgres. L'idempotence des victoires survit donc
intacte, tandis que les paquets achetés coexistent librement.

## 6. Surface HTTP

Toutes les routes joueuse sont authentifiées par `withAuthRoute` (Bearer
joueuse) et scopées au tenant résolu par `resolveTenantIdForUserRequest`.

| Route                                                | Méthodes          | Auth                                 | Rôle                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/player/tcg/photo`                              | GET, POST, DELETE | joueuse                              | L'état de **ma** carte ; déposer une photo (vaut consentement, repasse en `pending`) ; retirer son accord. 5/min en POST, 10/min en DELETE.                                                                                                                                                              |
| `/api/player/tcg/packs`                              | GET, POST         | joueuse                              | Mes paquets + solde + `boosterPrice`, `earn`, `recycleRefund` (GET, 60/min) ; ouvrir un paquet et **révéler** ses cartes, faces comprises (POST, 30/min).                                                                                                                                                |
| `/api/player/tcg/collection`                         | GET               | joueuse                              | Ma collection, déduite des paquets ouverts, recyclées exclues, agrégée par sujet, les plus rares d'abord. 60/min.                                                                                                                                                                                        |
| `/api/player/tcg/booster`                            | POST              | joueuse                              | Acheter un paquet **fermé** avec ses pièces. 20/min.                                                                                                                                                                                                                                                     |
| `/api/player/tcg/recycle`                            | POST              | joueuse                              | Recycler un **doublon** contre `RECYCLE_REFUND_COINS`. 30/min.                                                                                                                                                                                                                                           |
| `/api/player/tcg/wallet`                             | GET               | joueuse                              | « D'où viennent mes pièces ? » — 50 derniers mouvements, `shownTotal`, `truncated`. 60/min.                                                                                                                                                                                                              |
| `/api/admin/tcg/photos`                              | GET, PATCH        | staff, permission `moderate_support` | La file de relecture (`pending`, la plus ancienne d'abord) ; approuver ou refuser. Journalisé. 60/min en GET, 30/min en PATCH.                                                                                                                                                                           |
| `/api/admin/tcg/overview`                            | GET               | staff, permission `moderate_support` | État de l'économie en un appel : paquets, pièces, cartes par rareté, photos, sujets les plus distribués. Tout est agrégé côté serveur — aucune ligne de détail ne sort. `null` ≠ `0` : une clé en échec vaut « pas mesurable », jamais « mesuré et vide ». 30/min, `Cache-Control: private, max-age=30`. |
| `/api/bot/v1/players/by-discord/{discordUserId}/tcg` | GET               | bot, `x-api-key` par tenant          | Solde, paquets en attente et **résumé** de collection pour Discord. 60/min.                                                                                                                                                                                                                              |
| `/api/webhooks/twitch/tcg-drop`                      | POST              | signature HMAC Twitch EventSub       | Webhook entrant : créditer une spectatrice qui échange des points de chaîne. Corps lu brut (`bodyParser: false`), signature vérifiée **avant** tout parsing, fenêtre anti-rejeu de 10 min, tenant résolu par la chaîne et non par `x-tenant-id`. Non opérationnel : cf. § 7. 600/min.                    |

Quelques conventions transverses :

- **404 plutôt que 403** sur un paquet ou une carte qui n'est pas le sien : on ne
  confirme pas l'existence de ce qui n'appartient pas à l'appelante.
- **Codes stables** (`already_opened`, `empty_pool`, `insufficient_funds`,
  `balance_changed`, `not_a_duplicate`, `already_recycled`, `NOT_PENDING`) : c'est
  l'interface qui traduit, le message n'est qu'un repli.
- **L'API rend le fait, l'interface le formule.** `sourceKind` part brut, jamais
  un libellé : traduire au serveur l'obligerait à connaître la langue de la
  lectrice et figerait le vocabulaire à deux endroits.
- **La route bot ne rend qu'un résumé**, jamais la collection ni les faces : un
  message Discord n'affiche pas quarante cartes, et renvoyer tout obligerait le
  bot à décider seul ce qui mérite d'être montré.
- **Bornes de lecture partagées** : 500 paquets et 5 000 cartes côté collection,
  recyclage et route bot ; au-delà, la collection se paginera (v2).

## 7. Ce qui reste à faire

- **Le recyclage n'a pas d'interface.** `POST /api/player/tcg/recycle`, sa
  migration, ses libellés (`recycleAction`, `recycling`, `recycleSuccess`,
  `errNotADuplicate`, `errAlreadyRecycled`) et le montant `recycleRefund` rendu
  par `GET /api/player/tcg/packs` existent, mais `pages/player/tcg.tsx` n'appelle
  jamais la route : seul le libellé `card_recycled` de l'historique est utilisé.
  La boucle « gagner, ouvrir, recycler, racheter » est donc fermée côté serveur
  et ouverte côté écran.
- **`utils/tcg/earnSources.ts` n'est encore lu par personne.** Ce registre décrit
  six voies d'obtention et dit lui-même (`schemaReady: false`) que trois d'entre
  elles — `tournament_placement`, `checkin_streak`, `twitch_drop` — ne sont pas
  acceptées par les `CHECK` en base : une migration est requise **avant** toute
  écriture, et aucun distributeur ne l'utilise pour l'instant.
- **Le drop Twitch est bloqué sur deux migrations non écrites**, et il le dit
  franchement plutôt que de deviner : (1) `user_twitch_links` n'existe pas — aucune
  table ne relie un compte Twitch à un compte du site, et se rabattre sur le pseudo
  Twitch auto-déclaré dans `user_metadata` laisserait n'importe qui encaisser les
  récompenses d'une autre ; (2) le `CHECK` sur `tcg_wallet_entries.source_kind`
  n'admet pas `twitch_drop`, une insertion serait rejetée (23514). En attendant, la
  route acquitte en `200` avec le statut `identity_not_linked` : toute la plomberie
  (signature, poignée de main, révocation, idempotence par `source_ref` = identifiant
  de l'échange) est en place, l'identité seule manque.
- **Le registre et le webhook ne disent pas la même chose du drop.**
  `earnSources.ts` annonce `twitch_drop` à `TWITCH_DROP_COINS` (25, « demi-scrim :
  regarder n'est pas jouer ») **plus un paquet** ; le webhook crédite
  `BOOSTER_PRICE_COINS` (300) et aucun paquet. Douze fois l'écart, et deux
  raisonnements également argumentés. À trancher avant d'ouvrir la voie — c'est
  précisément le genre de divergence que le registre existe pour empêcher.
- **Le panneau d'administration ne parle pas la langue de son API.**
  `components/admin/tcg/TcgOverviewPanel.tsx` normalise une réponse en
  `packs.granted / pending / bySource` et `coins.inCirculation / earned / wallets` ;
  `GET /api/admin/tcg/overview` rend `packs.total / unopened / byOrigin` et
  `coins.circulating / issued / holders`. Les deux jeux de tests figent chacun leur
  version. Comme le panneau affiche « — » sur tout champ absent, le désaccord ne
  produirait aucune erreur : juste un tableau de bord vide. Ni le panneau ni
  `components/tcg/TcgCollectionProgress.tsx` ne sont montés dans une page à ce jour
  — et le second attend une API de vivier qui n'existe pas encore.
- **`admin_grant` n'a pas d'écrivain.** Le `source_kind` est accepté par le
  schéma, affiché par l'historique (« Ajustement par l'équipe ») et décrit comme
  « la correction manuelle tracée par `logStaffAction` », mais aucun endpoint ne
  crée une telle écriture. Un solde ne peut donc pas être corrigé autrement qu'à
  la main en base.
- **La file de modération n'affiche pas les pseudos.** Elle rend `userId` et
  renvoie vers la fiche publique ; résoudre les noms passe par la RPC
  `fetchAdminUserProfiles` (le profil vit dans `auth.users.raw_user_meta_data`,
  il n'existe pas de table `profiles`). Ce serait un ajout, pas une réécriture.
- **La collection n'est pas paginée** : bornes fixes à 500 paquets / 5 000 cartes,
  pagination annoncée en v2. La liste des paquets, elle, est bornée à 200 —
  divergence à réduire si un compte dépasse ce volume.
- **Contrats à réaligner.** `/api/player/tcg/recycle` vient d'être ajouté à
  `docs/openapi.yaml` et à `docs/BOT_API_CONTRACT.md`, mais `/api/admin/tcg/overview`
  et `/api/webhooks/twitch/tcg-drop` n'y figurent nulle part, pas plus que le champ
  `recycleRefund` de `GET /api/player/tcg/packs` ni le `source_kind`
  `card_recycled` dans la description du porte-monnaie. La règle de synchronisation
  du dépôt impose de les y ajouter avec le lot correspondant.
- **Écart de validation assumé sur la route bot** : le code accepte un
  `discordUserId` de 15 à 25 chiffres, volontairement plus large que le `pattern`
  de la spec, parce que des identifiants courts existent chez les comptes les plus
  anciens. À trancher : aligner la spec, ou resserrer le code.
