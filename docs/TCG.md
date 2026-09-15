# TCG — cartes à collectionner

> Document de référence de la fonctionnalité TCG (_trading card game_) :
> pourquoi elle existe sous cette forme, ce que le schéma garantit, et ce qui
> reste à faire. Écrit d'après le code au **2026-09-15**.
>
> Sources : [`utils/tcg/`](../utils/tcg), [`pages/api/player/tcg/`](../pages/api/player/tcg),
> [`pages/api/admin/tcg/`](../pages/api/admin/tcg),
> [`pages/api/webhooks/twitch/tcg-drop.ts`](../pages/api/webhooks/twitch/tcg-drop.ts),
> [`pages/api/bot/v1/players/by-discord/[discordUserId]/tcg.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/tcg.ts),
> les migrations `create_tcg_tables.sql`, `create_tcg_currency_tables.sql`,
> `tcg_packs_allow_purchased.sql`, `tcg_recycle_duplicates.sql`,
> `tcg_twitch_drop.sql`, `add_tcg_overlay_tokens.sql`, `tcg_overlay_theme.sql`,
> `tcg_welcome_gift.sql`, `tcg_welcome_gift_pack_coherence.sql`,
> `tcg_supporter_welcome.sql`, `tcg_earn_sources_drop_streak_placement.sql`,
> `tcg_battlenet_verified.sql`, `tcg_collection_set.sql`, `tcg_showcases.sql`,
> `tcg_card_trades.sql` (échanges, cf. §4 « Les échanges »),
> `tcg_wallet_atomic_balance.sql`, `tcg_admin_search_players_scoped.sql` et
> `tcg_scrim_win_stable_ref.sql` (correctifs de sécurité du 2026-09-15, §7),
> [`components/tcg/TcgCard.tsx`](../components/tcg/TcgCard.tsx),
> [`components/overlay/TcgAnnouncement.tsx`](../components/overlay/TcgAnnouncement.tsx) et
> [`pages/player/tcg.tsx`](../pages/player/tcg.tsx).

## 1. Ce que c'est, et pour qui

Une carte représente **une joueuse, une équipe ou une map** du circuit. Un paquet
de cinq cartes est offert à chaque victoire, aux joueuses du camp gagnant ; il
s'ouvre depuis l'espace joueuse (`/player/tcg`), et ce qu'on possède forme une
collection.

Les trois sujets ne se ressemblent pas et c'est voulu : une joueuse est une
**personne** (d'où toute la section 2), une équipe est une entité **déjà
publique**, une map est un **objet de jeu** qui n'appartient à personne. Le
vivier des maps vient d'ailleurs d'un registre en mémoire
([`config/maps/overwatch.ts`](../config/maps/overwatch.ts)) et non de la base —
conséquence pratique : il n'est jamais vide.

Le public est celui de l'espace joueuse — mais plus seulement les personnes qui
jouent. **Révision du 2026-09-14** : un compte `supporter` s'inscrit désormais
en propre depuis `/register`, pour suivre la compétition et collectionner sans
être sur un roster. La formulation d'origine — « les personnes qui jouent, pas
les visiteuses du site » — est donc **levée délibérément**, et non par dérive.
Elle décrivait d'ailleurs mal l'existant : au moment de la révision, 26 comptes
sur 97 n'étaient ni sur un roster ni staff, sans que rien ne les désigne.

Ce que la révision ne change PAS. La page reste en `noindex` (une collection
personnelle n'a rien à faire dans un moteur de recherche) ; les deux seuls
endroits publics où une carte apparaît restent la fiche d'une joueuse
(`/player/[userId]`, sa propre carte, sans lien vers elle-même — plus, depuis le
2026-09-15 et **seulement si elle l'active**, sa vitrine de trois cartes, cf.
§2.5) et la fiche d'une équipe (`/team/[slug]`) ; et surtout **la monnaie reste gagnée, jamais
achetée**. Une supportrice n'a aucune victoire à son actif : sa voie est le
**drop Twitch** pendant un direct, qui n'exige pas d'équipe et fonctionne déjà.
Faire un don ne crédite RIEN — soutenir l'association et collectionner sont deux
capacités du même compte, jamais un échange de l'une contre l'autre. Le rôle
n'ouvre donc aucune permission : il donne une porte et un nom.

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
(permission `manage_tcg`, journalisé `tcg_photo_approve` /
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

**On n'approuve que la photo qu'on a vue** (correctif de sécurité du
2026-09-15). La décision désignait la joueuse, pas le fichier : la relectrice
voyait A, la joueuse la remplaçait par B (de nouveau `pending`), et « approuver »
publiait B, que personne n'avait regardée — la modération contournée par un
simple remplacement. Symétriquement, un refus concurrent vidait le chemin de B
et supprimait A : B restait orpheline dans le bucket public. Le `GET` rend donc
`photoPath`, le `PATCH` l'exige, et l'écriture est **conditionnelle** :
`photo_status = 'pending' AND photo_path = <affiché>`, avec `.select()` pour
savoir si une ligne a été touchée. Zéro ligne → `409 PHOTO_CHANGED`, rien n'est
écrit ni supprimé, l'écran rafraîchit. Le fichier supprimé au refus est le
chemin que l'écriture a **confirmé**, jamais une relecture antérieure.

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

**Une lecture ratée n'est pas une absence** (2026-09-15). Le retrait lisait le
chemin du fichier sans regarder l'erreur : sur un 504, il vidait quand même la
colonne, et le fichier restait dans le bucket public sans plus aucune ligne pour
le désigner — impossible à retirer, ni par la joueuse ni par le staff. Il rend
désormais `500` sans rien écrire, et son effacement est conditionnel au chemin lu
(un dépôt intercalé est relu, `409 PHOTO_CHANGED` après trois courses). Le dépôt,
de même, lit l'ancienne photo **avant** d'envoyer la nouvelle et s'arrête en
`500` si cette lecture échoue.

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
faire consentir. Les **maps** encore moins : ce sont des lieux de jeu, et leurs
visuels sont des maquettes voxel produites par le projet — jamais une capture de
l'éditeur, jamais une image générée. L'asymétrie entre les trois sujets est
délibérée : une seule des trois représente quelqu'un.

**Corollaire : l'illustration de carte d'une équipe n'est pas modérée.** Depuis
`add_tcg_team_card_image.sql`, une équipe peut déposer un vrai visuel à la place
de son logo (`teams.tcg_image_path`, chemin dans le bucket `teams-images`, préfixe
`tcg/`). Ce dépôt est **publié immédiatement**, sans file d'attente — là où la
photo d'une joueuse attend une approbation. Ce n'est pas une inconséquence, c'est
la même règle appliquée : ce qui justifie une relecture, c'est qu'une image
expose une PERSONNE. Une équipe engage sa propre vitrine, sa capitaine est
identifiée, et le staff peut corriger après coup — `hasTeamPermission` lui donne
la main sur toutes les équipes.

Qui dépose : quiconque porte `manage_team_info` sur l'équipe — la même permission
que le nom et le logo, puisque c'est la même chose : l'identité de l'équipe. La
route est unique pour la capitaine et pour le staff
([`/api/teams/[teamId]/tcg-image`](../pages/api/teams/[teamId]/tcg-image.ts)), et
le remplacement supprime le fichier précédent.

**Le repli reste le logo.** Sans illustration, `readTeamFaces` rend
`cardImageUrl: null` et la carte prend `logoUrl` — cadré `object-contain`, parce
qu'un logo n'est pas fait pour être rogné, là où une illustration remplit son
cadre. Les deux champs restent donc distincts jusqu'au rendu, au lieu d'être
fusionnés à la lecture.

### 2.5 La vitrine : montrer ses cartes, en opt-in

Une joueuse peut exposer **jusqu'à trois cartes** de sa collection sur SA fiche
publique (`/player/[userId]`) —
[`utils/tcg/showcase.ts`](../utils/tcg/showcase.ts),
[`pages/api/player/tcg/showcase.ts`](../pages/api/player/tcg/showcase.ts),
[`components/tcg/TcgShowcaseEditor.tsx`](../components/tcg/TcgShowcaseEditor.tsx)
(réglage sur `/player/tcg`) et
[`components/tcg/TcgShowcaseSection.tsx`](../components/tcg/TcgShowcaseSection.tsx)
(affichage). C'est l'interaction qui donne un public à une collection ; elle
touche des photos de personnes, d'où les mêmes exigences qu'aux trois
garde-fous ci-dessus.

- **Désactivée par défaut.** Sans ligne `tcg_showcases`, ou `enabled = false`,
  la fiche n'en montre rien — pas même un titre vide. Le reste de la collection
  reste privé et `/player/tcg` reste `noindex`.
- **Désactiver ne s'attend pas et ne se refuse pas.** La case se sauvegarde dès
  qu'on la décoche (le choix des cartes, lui, s'enregistre explicitement), et le
  `PUT enabled: false` ne vérifie RIEN — ni collection lisible, ni cartes encore
  possédées : un retrait refusé laisserait en ligne ce qu'on demande de retirer.
  La fiche est régénérée tout de suite (`revalidatePlayerCard`), comme pour une
  photo.
- **Des références, jamais des images.** `subject_keys` porte `player:<uuid>`,
  `team:<uuid>` ou `map:<slug>` — un SUJET, pas un exemplaire : céder une copie
  dont on garde un double ne vide pas la vitrine.
- **Relue contre la possession réelle, à chaque affichage.** Une carte recyclée
  jusqu'au dernier exemplaire ou **échangée** (lot « échanges ») sort de la
  vitrine sans que personne ne nettoie la ligne ; la rareté montrée est la
  meilleure encore possédée. Activer exige de posséder chaque carte
  (`409 not_owned`).
- **Les faces passent par `readCardFaces`.** Une joueuse exposée dans la
  vitrine d'une AUTRE qui retire sa photo y retombe sur son avatar ou l'aplat.
  Et parce que la fiche est en ISR, `revalidatePlayerCard` régénère désormais
  aussi les fiches dont la vitrine ACTIVE expose sa carte (lecture
  `readShowcaseOwnersShowing`, index GIN partiel) — sinon la photo retirée
  resterait jusqu'à cinq minutes chez les autres. Tous tenants confondus : une
  page régénérée de trop ne coûte rien.
- **Dans le doute, rien.** Une lecture en échec au rendu de la fiche rend
  `null` : pas de vitrine plutôt qu'une vitrine invérifiable.
- **Hors de `PlayerProfileResponse`**, comme la photo : ce type nourrit l'API
  partenaire `/api/public/v1/players/[userId]`, où la vitrine n'a pas été
  consentie.

Limites connues : la fiche publique lit l'espace par défaut et n'existe que
pour une joueuse classée ou sur un roster — une supportrice peut régler sa
vitrine, l'écran lui dit qu'elle ne s'affiche encore nulle part
(`publicProfileUrl: null`). Un **échange** ne régénère pas la fiche de la
cédante : la carte cédée disparaît à la prochaine régénération ISR (≤ 300 s).

## 3. Le barème de rareté

Quatre paliers : `common`, `rare`, `epic`, `legendary`
([`utils/tcg/rarity.ts`](../utils/tcg/rarity.ts), réducteur pur).

**Une carte de map a une rareté fixe** (`MAP_CARD_RARITY`, la même pour toutes).
Une map ne gagne rien et ne progresse pas : elle n'a aucun palmarès, donc aucun
prestige à mesurer, et lui attribuer une rareté variable inventerait une seconde
échelle de valeur à côté de celle des joueuses — exactement ce que la suite de
cette section refuse. Elle se distingue par la **brillance** seule (`FOIL_CHANCE`),
qui est une variante d'impression et non un degré de mérite.

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
| `TWITCH_DROP_COINS`    | 25     | `SCRIM_WIN_COINS / 2`, plancher à 1 — + un paquet      |
| `CHECKIN_STREAK_COINS` | 50     | `SCRIM_WIN_COINS` — + un paquet, tous les 5 check-ins  |
| `PLACEMENT_TIERS`      | 1→8    | rang 1 : 500 + 3 paquets · 2 : 300 + 2 · 3 : 200 + 1 · 4-8 : 100 + 1 |
| `BATTLENET_VERIFIED_COINS` | 100 | `MATCH_WIN_COINS`, **sans paquet** — une fois à vie, compte Battle.net prouvé |
| `COLLECTION_SET_COINS` | 100 | `MATCH_WIN_COINS`, **sans paquet** — une fois par série complétée (cf. « Les séries ») |
| `MATCH_PREDICTION_COINS` | 25 | `SCRIM_WIN_COINS / 2`, plancher à 1, **sans paquet** — un pronostic juste par match (cf. « Les pronostics ») |

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

**La somme est faite par la base, sous verrou** (correctif de sécurité du
2026-09-15, migration `tcg_wallet_atomic_balance.sql`). `refreshBalance` sommait
en JavaScript un `select('amount')` **non paginé** : PostgREST coupe à 1000
lignes, le solde se figeait au-delà, sans erreur. Il appelle désormais
`tcg_refresh_wallet_balance(tenant, user)` : `SELECT … FOR UPDATE` de la ligne de
porte-monnaie, `SUM(amount)` du registre, réécriture du cache — une transaction.
Le verrou le fait attendre derrière un achat en vol au lieu d'écraser son débit
([`utils/tcg/walletRpc.ts`](../utils/tcg/walletRpc.ts)). Fonction absente →
repli sur une somme **paginée** (le plafond est levé, la course résiduelle ne
touche que le cache) ; une **panne** de la fonction, elle, n'écrit rien : on ne
se replie pas sur un chemin moins sûr à cause d'un 504. Toute écriture qui
**décide** sur un solde (achat, retrait staff) passe par une fonction SQL et ne
se replie jamais.

`source_kind` accepté par le schéma : `match_win`, `scrim_win`,
`booster_purchase`, `admin_grant`, `card_recycled`, `twitch_drop`
(`tcg_twitch_drop.sql`, 2026-09-13), `welcome_gift` (`tcg_welcome_gift.sql`,
2026-09-14), `supporter_welcome` (`tcg_supporter_welcome.sql`, 2026-09-14),
`checkin_streak` et `tournament_placement`
(`tcg_earn_sources_drop_streak_placement.sql`, appliquée le 2026-09-15), et
`battlenet_verified` (`tcg_battlenet_verified.sql`, **non appliquée** à la
rédaction, 2026-09-15), et `collection_set` (`tcg_collection_set.sql`, **non
appliquée** à la rédaction, 2026-09-15). Côté paquets, `tcg_packs.source_kind` admet `victory`, `purchase`,
`welcome`, et avec la même migration `drop`, `placement` et `streak`.
`admin_grant` est écrit par `POST /api/admin/tcg/grant` (correction tracée
par l'équipe, `source_ref` = clé d'idempotence). Son **motif est lisible par
la joueuse** : recopié dans `tcg_wallet_entries.note` (seule source à en porter
un, migration `tcg_wallet_entries_note.sql`) et affiché sous « Ajustement par
l'équipe » dans son historique — la carte staff le dit avant la saisie. Il
reste aussi au journal staff, avec l'auteur.

**Qui gère le TCG côté staff : la permission `manage_tcg`**, et non
`moderate_support`. Toutes les routes `/api/admin/tcg/*` et les onglets TCG de
`/admin/moderation` en dépendent ; `owner` et `admin` l'ont par rôle, un
`caster` seulement si on la lui accorde. Le TCG était d'abord gardé par
`moderate_support`, décrit « traiter les signalements et les tickets » :
accorder le support ouvrait du même geste la correction des soldes et la
relecture des photos. La recherche de comptes de la carte d'ajustement passe par
`/api/admin/tcg/players`, sous le même droit, plutôt que par
`/api/admin/users/search` (`manage_staff`).

⚠️ **`manage_tcg` n'est pas un droit de confiance plateforme** (audit du
2026-09-15) : tout `owner` d'espace l'a par rôle, y compris l'owner d'un espace
**développeur** créé en libre-service. Deux routes le traitaient comme tel :

- la recherche appelait la RPC **globale** `admin_search_users` — emails,
  BattleTags et équipes de **tous** les comptes. Elle appelle désormais
  `admin_search_tcg_players(tenant, q)` (migration
  `tcg_admin_search_players_scoped.sql`), filtrée **en base** sur les comptes
  rattachés à l'espace, par pseudo et BattleTag ; l'email n'est ni cherché ni
  rendu. Fonction absente → `503 SEARCH_UNAVAILABLE`, jamais de repli global ;
- la correction acceptait **n'importe quel** `userId`. Un owner tiers créditait
  +1 pièce à une étrangère — ce qui lui créait un porte-monnaie chez lui — puis
  son rattrapage Battle.net (qui tenait « un porte-monnaie » pour un
  rattachement) consommait chez lui la récompense **unique** de la joueuse. La
  cible doit désormais être rattachée, sinon `404 USER_NOT_FOUND`, indiscernable
  d'un compte inexistant et rendu avant toute lecture GoTrue.

**« Rattachée à l'espace »** a une seule définition,
[`utils/tcg/tenantAttachment.ts`](../utils/tcg/tenantAttachment.ts), recopiée à
l'identique dans la fonction SQL (un test compare les deux listes) : une ligne de
**roster** du tenant, **ou** un **gain réel** au registre du tenant — liste
blanche `match_win`, `scrim_win`, `twitch_drop`, `welcome_gift`,
`supporter_welcome`, `checkin_streak`, `tournament_placement`,
`battlenet_verified`. Exclus : `admin_grant` (le geste même qu'on empêche de
fabriquer un rattachement), `booster_purchase` et `card_recycled` (dérivés de
pièces qui peuvent venir d'un `admin_grant`), et toute source future tant que
personne ne l'a ajoutée exprès — une liste blanche oublie une joueuse, elle
n'invite jamais une étrangère. **Limite connue** : un owner peut encore ajouter
un compte existant à un roster de son espace sans son consentement
(`POST /api/admin/teams/[teamId]/members`, par email ou par id) ; le
rattachement « roster » reste donc fabricable par un staff malveillant. Le
fermer relève d'un flux d'invitation acceptée.
**Un match qui a payé ne se supprime plus physiquement** (2026-09-15). Supprimer
un match terminé effaçait ses paquets en cascade — cartes ouvertes comprises —
alors que les pièces restaient, et un match recréé repayait. Désormais
`DELETE /api/admin/matches/[id]?hard=1` et la suppression groupée d'une phase
répondent `409 MATCH_HAS_TCG_REWARDS` dès qu'il existe un paquet `victory` OU
une écriture `match_win` pour le match (`utils/tcg/paidMatches.ts`, lecture en
échec = refus) : on l'annule à la place. La base porte la même règle :
`tcg_packs.source_match_id` est en `ON DELETE RESTRICT`
(`tcg_packs_source_match_restrict.sql`), si bien que supprimer un tournoi dont un
match a payé échoue au lieu de vider les collections.

**Le rattachement à l'espace exige l'ACCORD de la personne** (2026-09-15,
`team_members_accepted_at.sql`). `team_members.accepted_at` est posé quand elle a
créé son équipe, demandé à la rejoindre (ou un transfert) ou accepté une
invitation — les trois fonctions SQL d'adhésion le posent, et `NULL` par défaut
signifie « ajoutée par un tiers » (staff, capitaine, import). Le rattachement TCG
(correction de solde, rattrapage Battle.net, recherche de joueuses) ne compte que
les appartenances acceptées et, au registre, les seuls gains nés de SON geste :
`twitch_drop`, `supporter_welcome`, `battlenet_verified`, `collection_set`. Les
victoires, check-ins, palmarès et cadeaux d'accueil sont pilotés par
l'organisation : un owner pouvait les provoquer pour une personne ajoutée de
force. Les appartenances antérieures ont reçu `accepted_at = created_at`.
**L'ajout staff passe par une invitation** (`utils/teams/staffInvitation.ts`).
Les deux routes staff (`/api/admin/teams/add-member`, `/api/admin/teams/[teamId]/members`)
créent par défaut une invitation en attente (`demandes` type `invite`, source
`staff`) avec lien privé par email : la personne rejoint en acceptant, ce qui pose
`accepted_at`. L'ajout direct reste ouvert aux corrections (`mode: 'direct'`),
avec un motif obligatoire journalisé (`staff_logs`) et un email qui rappelle le
bouton « Quitter l'équipe » de l'espace joueuse ; il laisse `accepted_at` à `NULL`.
Restent des ajouts directs sans accord, donc sans prise TCG : capitaine
(`/api/teams/add-member`), Discord et imports de roster.

**Un scrim annulé ne se re-clôt plus.** `applyScrimResult` n'écrit que si le scrim
n'est ni `completed` ni `cancelled` (409 `SCRIM_CLOSED`, miroir noté non touché) ;
les PATCH staff (admin et bot) ne changent un statut que s'il est toujours celui
qu'ils ont lu (409 `SCRIM_CHANGED`), et le PATCH bot réaligne désormais le miroir
noté (un scrim annulé depuis Discord gardait ses points au rating et à la saison).

**Les routes staff d'équipe sont bornées à l'espace** (2026-09-15) :
`/api/admin/teams/[teamId]/members` (toutes méthodes), `/roster-bulk` et
`/api/admin/teams/add-member` chargent l'équipe avec `tenant_id = ctx.tenantId`
(`utils/teams/loadTeamInTenant.ts`) ; une équipe d'un autre espace répond 404.

`source_ref` est du **texte**,
et non un uuid, parce que les sources n'ont pas toutes la même clé (un match, un
paquet, une carte `<pack_id>:<position>`, un tournoi, un tenant, un direct,
`<tournoi>:<match>`).

⚠️ **Une table peut porter plusieurs `CHECK` sur la même colonne.** `tcg_packs`
en a deux : `tcg_packs_source_kind_check` **et** `tcg_packs_source_coherent`,
dont le nom ne dit pas qu'elle contraint `source_kind`. Le 2026-09-14, élargir
la première sans la seconde a fait rejeter **58 paquets** en `23514`, sans que
rien ne s'arrête : l'appelant journalisait l'échec et continuait, et l'écran
d'administration a affiché un succès. Avant d'ajouter une valeur, **énumérer**
plutôt que corriger celle dont le nom ressemble au sujet :

```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = ANY (ARRAY['public.tcg_packs'::regclass,
                            'public.tcg_wallet_entries'::regclass])
  AND contype = 'c';
```

Le mock Supabase des tests unitaires **n'évalue aucun `CHECK`** : cette panne
était structurellement intestable. `setTableWriteError` (ajouté depuis) ne
simule pas la contrainte — il permet de tester ce que le code FAIT face à un
refus, ce qui est là que ce genre d'incident se joue.

### Achat, ouverture, recyclage

- **L'achat ne crée qu'un paquet fermé.** Le tirage appartient à l'ouverture :
  séparer les deux permet de montrer « tu as N paquets » sans avoir figé leur
  contenu, et de rejouer une ouverture ratée sans re-débiter.
- **L'achat est une transaction SQL** (`tcg_purchase_booster`, correctif de
  sécurité du 2026-09-15). L'ancien débit « conditionnel au solde lu »
  (`.eq('balance', avant)`) enchaînait trois requêtes — débit du cache, paquet,
  registre — et ne protégeait que de deux achats lisant la même valeur : un
  recalcul intercalé (un gain, un recyclage, un autre achat) relisait un registre
  pas encore débité et **écrasait** le débit. Trois achats rapides en livraient
  trois pour le prix de deux, le registre passait sous zéro, et le plafond du
  recalcul le ramenait silencieusement à 0. La fonction verrouille la ligne de
  porte-monnaie (`FOR UPDATE`), relit le solde par `SUM(amount)` sur le
  **registre**, crée le paquet, écrit la dépense et le cache — tout ou rien. Le
  contrat HTTP est inchangé (`400 insufficient_funds`, `409 balance_changed` si le
  verrou n'est pas obtenu) ; fonction absente → `503 purchase_unavailable` : on
  **refuse** plutôt que d'acheter sans verrou. Un 504 après commit ne laisse plus
  ni paquet gratuit ni remboursement à orchestrer.
- **Le tirage précède la consommation.** Un vivier vide ne coûte pas son paquet
  (`409 empty_pool`, paquet toujours fermé). La réservation est atomique
  (`opened_at IS NULL`) et **relâchée** si l'écriture des cartes échoue : mieux
  vaut un paquet fermé qu'un paquet ouvert et vide, que rien ne permettrait de
  rejouer.
- **Un paquet contient cinq cartes : trois joueuses, une équipe, une map**
  ([`utils/tcg/drawPack.ts`](../utils/tcg/drawPack.ts)). Ce sont des
  **emplacements réservés**, pas des probabilités par carte : tirer chaque
  emplacement indépendamment laisserait sortir des paquets entièrement composés
  d'équipes — rare, mais absurde le jour où ça arrive. Les maps ne s'**ajoutent**
  pas au paquet, elles y occupent une place ; quand un vivier manque, le
  comblement va aux joueuses d'abord, aux équipes ensuite, aux maps en dernier.

  Effet de bord à connaître : le vivier des maps étant un registre en mémoire,
  il n'est jamais vide, et le refus `409 empty_pool` est devenu **quasi
  inatteignable**. Un espace sans aucune joueuse ni équipe classée reçoit un
  paquet complet de maps plutôt qu'un refus — un paquet non vide valant mieux
  qu'un paquet refusé. La garde reste en place pour le jour où le registre
  serait vidé.
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
  **Recompte après réservation** (2026-09-15) : le contrôle « au moins deux
  exemplaires » est une lecture, et `recycled_at IS NULL` protège une carte, pas
  un sujet — deux recyclages simultanés des deux derniers exemplaires passaient
  tous les deux. La route recompte donc **après** avoir réservé sa carte ; s'il ne
  reste plus aucun exemplaire, elle relâche sa réservation (conditionnée à son
  horodatage) et refuse. Deux requêtes croisées peuvent se refuser toutes les
  deux — un refus rejouable, jamais la dernière carte détruite.

L'achat n'a plus d'ordre d'écriture à arbitrer : sa transaction est tout ou
rien. Le recyclage, lui, **marque avant de créditer** — mieux vaut un état
réparable (une carte retirée sans crédit, relâchée en cas d'échec) que de la
monnaie créée à partir de rien.

### Le drop Twitch : des pièces et un paquet

[`pages/api/webhooks/twitch/tcg-drop.ts`](../pages/api/webhooks/twitch/tcg-drop.ts)
crédite `TWITCH_DROP_COINS` — **25 pièces**, la moitié d'un scrim : regarder
n'est pas jouer, et le drop reste la plus petite récompense du barème — **et un
paquet** d'origine `drop` depuis le 2026-09-15. Le registre le lui attribuait
depuis le début ; seul le paquet manquait.

**Pourquoi le paquet n'emprunte pas un match.** Prêter au drop le match en cours
le ferait entrer en collision avec le paquet de victoire du même match (même
`UNIQUE (tenant_id, user_id, source_match_id)`) : la spectatrice qui joue ce
match perdrait l'une des deux récompenses. Un paquet `drop` a donc
`source_match_id NULL` — et deux `NULL` étant distincts dans une contrainte
`UNIQUE`, `tcg_packs` n'offre plus aucune ancre d'idempotence.

**L'ancre est le porte-monnaie, et l'ordre d'écriture est le garde-fou**
([`utils/tcg/grantCoinsThenPacks.ts`](../utils/tcg/grantCoinsThenPacks.ts),
partagé avec la série et le palmarès ci-dessous) : les pièces d'abord, en
`ON CONFLICT DO NOTHING ... RETURNING` sur `source_ref = <broadcaster>:<startedAt>`,
puis le paquet à la seule ligne rendue. Un retry de Twitch — autre
`message-id`, même direct — rend `replayed` : **ni pièces ni paquet**, ni
annonce, ni remboursement.

**Un paquet refusé ne fait pas échouer le drop.** Si l'insertion du paquet
échoue (la migration de l'origine `drop` non appliquée, typiquement), les
pièces sont écrites, la demande Twitch est honorée, la réponse porte
`packGranted: false` et l'annonce `pack: null`. Rendre un 503 aurait fait
retenter Twitch, le retry serait tombé sur `replayed` et la demande n'aurait
jamais été honorée. Le pire cas reste « des pièces sans paquet », visible et
réparable à la main — jamais « deux paquets ».

L'annonce bot `tcg.drop_granted` porte, **en ajout rétrocompatible**,
`pack: { id: string } | null` : un bot ancien l'ignore, un bot à jour ne dit
« un paquet t'attend » que lorsque c'est vrai.

### Le cadeau de bienvenue

[`utils/tcg/grantWelcomeGift.ts`](../utils/tcg/grantWelcomeGift.ts) offre, une
fois par édition, **un paquet et `MATCH_WIN_COINS`** à chaque participante
engagée. Il ouvre la porte plutôt que de la montrer : sans lui, une joueuse
arrive sur un TCG au porte-monnaie vide et le reste jusqu'à sa première
victoire — c'est-à-dire au moment précis où on voudrait qu'elle découvre la
collection.

**Les participantes sont les rosters des équipes engagées (`stage_teams`), pas
les feuilles de match.** Vérifié en base : la Cup 2026 comptait 30 matchs
planifiés et **zéro** ligne dans `match_participants` avant son début — un
cadeau calculé sur les feuilles n'aurait crédité personne. Remplaçantes
comprises, comptes dédoublonnés (une joueuse peut figurer dans deux équipes).

L'**ordre d'écriture est le garde-fou** : pièces d'abord, en
`ON CONFLICT DO NOTHING ... RETURNING` sur
`(tenant_id, user_id, source_kind, source_ref = <tournoi>)`, puis un paquet aux
seules lignes rendues. L'ordre inverse laisserait, sur échec intermédiaire, un
paquet sans pièces — et la relance en ajouterait un second, `tcg_packs` n'ayant
aucune unicité exploitable ici. Distribuer reste un **geste de staff** explicite
et journalisé (`tcg_welcome_gift_grant`), jamais un effet de bord de
déploiement.

### Le cadeau d'accueil d'une supportrice

[`utils/tcg/grantSupporterWelcome.ts`](../utils/tcg/grantSupporterWelcome.ts)
offre **un paquet et `MATCH_WIN_COINS`**, une fois par compte, à qui porte le
rôle de compte `supporter` (cf. §1). Les six autres sources supposent toutes
qu'on joue : sans lui, une supportrice arrive sur une collection vide et sa
seule voie — le drop Twitch — n'existe que pendant un direct.

**Une fois par COMPTE, pas par édition**, et c'est toute la différence avec le
cadeau ci-dessus. L'unicité du registre étant
`(tenant_id, user_id, source_kind, source_ref)`, `source_ref` porte ici le
**tenant** et non le tournoi. Faire porter à une seule clé deux règles
d'unicité aurait rendu « une fois » ambigu — d'où deux `source_kind` distincts
plutôt qu'un réemploi, et un `refKind` déclaré par source dans le registre.

Le corollaire est voulu : une supportrice qui rejoindrait plus tard un roster
recevra aussi le cadeau de son édition. Ce sont deux accueils différents.
L'inverse est **refusé** — on ne sert pas le cadeau supportrice à qui figure
déjà sur un roster, le rôle de compte n'étant qu'une étiquette choisie à
l'inscription et rien n'empêchant une joueuse de la cocher.

Il se **réclame** (`POST /api/player/tcg/welcome-gift`), il n'est pas distribué :
un geste par personne, jamais un effet de bord. La route n'active pas
`allowActAs`, donc `?as=` y est refusé — un staff qui inspecte ne peut pas
réclamer à la place de quelqu'un, et un cadeau réclamé ne se rend pas. Le même
ordre d'écriture protège que partout ailleurs (pièces d'abord en
`ON CONFLICT DO NOTHING ... RETURNING`, paquet ensuite), et `packGranted` est
**rendu à l'appelant** : si le paquet échoue, l'écran le dit au lieu d'afficher
un succès.

**Aucun rapport avec le don.** Soutenir l'association et collectionner sont deux
capacités du même compte, jamais un échange de l'une contre l'autre : brancher
ce cadeau sur un paiement en ferait une loot box payante (cf. « La monnaie se
gagne, elle ne s'achète pas »).

### La série de check-ins

[`utils/tcg/grantCheckinStreak.ts`](../utils/tcg/grantCheckinStreak.ts) offre
`CHECKIN_STREAK_COINS` (50, le prix d'un scrim) **et un paquet** `streak` quand
une équipe fait son check-in à `CHECKIN_STREAK_LENGTH` (5, le seuil du badge
`win_streak`) matchs consécutifs d'un même tournoi. La ponctualité est ce qui
évite les forfaits : elle mérite une contrepartie, sans être payée comme une
victoire.

**Branchée dans `redeemCheckinToken`**, l'entonnoir unique du lien public
(`POST /api/checkin/[token]`) et du bouton Discord
(`POST /api/bot/v1/matches/[matchId]/checkin`), et **seulement sur un check-in
neuf** : un rejeu retombe sur `alreadyCheckedIn` avant d'y arriver. L'écrivain
ne lève jamais ; un échec ne change rien au check-in, déjà écrit.

**Ce qu'est une série.** Les matchs de l'équipe dans le tournoi, triés par
horaire prévu, jusqu'au match validé inclus ; on compte à rebours les check-ins
consécutifs. Un **forfait** (match sans check-in) **rompt** la série. Un bye, un
match supprimé, annulé ou reporté ne compte **ni ne rompt** : l'équipe n'y
pouvait pas être présente. Une fenêtre se ferme à chaque multiple de 5 (5, 10,
15…).

**La clé est le match qui ferme la fenêtre** : `source_ref = <tournoi>:<match>`.
Un numéro de série (« 1ʳᵉ série ») aurait été recalculé à 1 après une rupture,
et la contrainte `UNIQUE` aurait jeté la série suivante comme un doublon.

**Choix produit par défaut — le plus conservateur : les TITULAIRES du roster.**
Au check-in, aucune feuille de match n'existe encore (`match_participants` est
figé à la fin du match) : impossible de savoir qui jouera. Sont donc
récompensés les `team_members` avec un compte, **hors remplaçantes**
(`is_substitute`) et **hors encadrement** (coach, manager — le filtre du
snapshot `match_participants`). Payer toutes les inscrites aurait récompensé
une remplaçante jamais présente. Écart assumé avec la victoire, qui paie les
remplaçantes : celle-là sait qui a joué, celle-ci non.

### Le palmarès de fin de tournoi

[`utils/tcg/grantPlacementRewards.ts`](../utils/tcg/grantPlacementRewards.ts)
paie le top 8 selon `PLACEMENT_TIERS` — les seuils des badges `champion`,
`finalist`, `podium` et `top_cut`, pas une nouvelle échelle. Il est appelé par
`POST /api/admin/tournament/[id]/finalize`, **après** l'écriture de
`final_rankings` et du statut : on ne paie qu'un podium figé, jamais un bracket
qu'une contestation pourrait encore déplacer.

**Choix produit par défaut — le plus conservateur : les titulaires qui ont
JOUÉ pour l'équipe dans ce tournoi**, c'est-à-dire au moins une ligne
`match_participants` (tournoi, équipe) avec `is_substitute = false` et un compte.
C'est exactement la définition du palmarès d'une joueuse (`readPlayerProfile`) :
la récompense suit le badge que sa fiche affichera. Écartés : le roster courant
(il paierait une recrue arrivée après le tournoi et oublierait une joueuse
partie) et les remplaçantes (plus généreux que le badge lui-même). Une équipe
sans feuille de match figée ne rapporte **rien** — on ne devine pas un roster.

**Une récompense par personne et par tournoi** (`source_ref` = le tournoi). Une
joueuse passée par deux équipes classées ne touche que son **meilleur** rang.

**Conséquences de la clé, assumées :**

- une finalisation **relancée à l'identique** (no-op sur le classement) rappelle
  l'écrivain : un rejeu sain ne crédite personne, et c'est la **voie de
  reprise** après une panne ou une migration appliquée après coup ;
- un classement **réécrit** (`force: true`) ne repaie pas la différence de rang
  et **ne reprend rien** — un paquet ouvert ne se reprend pas ; seules les
  joueuses **entrées** dans le top 8 sont créditées.

Des participations illisibles rendent `status: 'error'` sans rien écrire :
payer sur une lecture partielle oublierait des joueuses que la clé rendrait
irrattrapables. La lecture est paginée (pages de 1 000, ordre stable). Le compte
rendu `{ status, eligible, granted, packsExpected, packsGranted }` est **rendu
dans la réponse** de la finalisation (`tcg_placement_rewards`).

**Annonce.** Série et palmarès émettent `tcg.reward_granted`
(`reason: 'checkin_streak' | 'tournament_placement'`) pour les seules joueuses
que l'insertion vient de créditer : `grantCoinsThenPacks` rend `credited`, vide
sur un rejeu, donc relancer une finalisation ne renotifie personne. `packs` est
le nombre de paquets RÉELLEMENT créés, pour ne jamais annoncer un paquet refusé.
Le bot en fait un DM (raison d'abord, gain ensuite), dédoublonné par
`(joueuse, source, sourceRef)`.

### La vérification d'un compte Battle.net

[`utils/tcg/grantBattlenetVerified.ts`](../utils/tcg/grantBattlenetVerified.ts)
crédite `BATTLENET_VERIFIED_COINS` — **100 pièces, sans paquet** — la première
fois qu'une joueuse prouve un compte Battle.net. **Une fois à vie.**

**Pourquoi c'est sain : la vérification est une preuve, pas une déclaration.**
Le flux est un OAuth Blizzard réel (`pages/api/auth/battlenet/callback.ts`) :
code d'autorisation échangé côté serveur avec le secret client, `sub` et
`battletag` lus sur `oauth/userinfo` avec le jeton rendu, state signé HMAC +
nonce en cookie httpOnly + liaison à la session. Recopier le BattleTag d'une
autre personne dans un roster ne rapporte rien : seul le retour d'OAuth crédite.
Si la vérification avait été une simple saisie, on n'aurait rien crédité — une
récompense sur une affirmation aurait payé l'usurpation qu'elle combat.

Ce que la preuve **ne dit pas** : qu'il s'agit d'un compte Overwatch ancien ou
unique. Un compte Battle.net est gratuit. D'où les limites ci-dessous, portées
par le schéma.

**Branché à un seul endroit** : le callback de vérification, juste après que
`upsertBattlenetLink` — seul écrivain de `user_battlenet_links` — a réussi,
quel que soit le statut du roster (`verified`, `linked`, `linked_no_match`) :
c'est le compte qu'on récompense, pas la concordance d'un tag déclaré. La
connexion par Battle.net (compte déjà lié) ne prouve rien de neuf et ne crédite
rien. Effet de bord **best-effort** : son résultat est journalisé, jamais rendu
dans la redirection, et ni un refus d'écriture ni une exception ne change le
statut `?battlenet=`.

**Trois règles, trois garde-fous en base, aucune relecture préalable :**

| Règle | Garde-fou |
| --- | --- |
| Un rejeu (même personne, même compte, même tenant) ne crédite pas | clé du registre, `ON CONFLICT DO NOTHING` → zéro ligne rendue |
| **Une fois par personne**, tous comptes Blizzard et tous tenants confondus | index unique partiel `tcg_wallet_entries_battlenet_once_per_user (user_id)` |
| **Une fois par compte Blizzard**, toutes personnes et tous tenants confondus | index unique partiel `tcg_wallet_entries_battlenet_once_per_account (source_ref)` |

La clé du registre contient `user_id` : seule, elle aurait laissé une joueuse
changer de compte Blizzard et recréditer à chaque fois — de quoi remplir **un**
porte-monnaie avec autant de comptes gratuits qu'on veut en créer. Le
`ON CONFLICT` ne visant que la clé du registre, une violation des index partiels
lève `23505` ; `grantCoinsThenPacks` la rend en `reason: 'conflict'` (distincte
de `rejected` et `failed`), et l'écrivain la lit « déjà récompensée ». Retirer
puis reposer la vérification ne recrédite donc rien. `tcg_wallet_entries.user_id`
n'ayant pas de clé étrangère, supprimer un compte ne libère pas non plus le
compte Blizzard.

**`source_ref = bnet:<sha256("battlenet:" + battle_net_id)>`.** La référence
circule dans l'historique rendu à la joueuse, l'outbox du bot et le DM :
l'identifiant Blizzard n'y figure pas en clair. C'est une pseudonymisation — un
identifiant numérique se retrouve par force brute — pas un secret. Pas de sel
serveur : sa rotation casserait la règle « une fois par compte ».

**Choix produit par défaut — les plus conservateurs :**

- **Un seul tenant, celui de la requête**, résolu comme les routes
  `/api/player/tcg/*` : le porte-monnaie que la joueuse consulte. La
  vérification est un geste unique et global (le lien n'a pas de tenant) ; la
  payer dans chaque organisation où elle joue la multiplierait, et l'index « une
  fois par personne » l'interdit de toute façon.
- **Des pièces, pas de paquet.** Exception assumée au « un paquet dans toute
  source » : les cadeaux d'accueil donnent un paquet parce qu'ils ouvrent la
  porte du TCG, la vérification n'ouvre rien. Un paquet aurait aussi exigé
  d'élargir les deux contraintes de `tcg_packs` — celles des 58 paquets du
  2026-09-14 — pour une récompense ponctuelle.
- **100 pièces, soit une victoire de match et un tiers de booster** : de quoi
  rapprocher du prochain paquet sans en offrir un, et moins que chacun des deux
  cadeaux d'accueil (mêmes pièces, plus un paquet).
- **Aucune rétroactivité automatique.** Les comptes vérifiés avant la
  fonctionnalité ne reçoivent rien au déploiement — un gain n'est jamais l'effet
  de bord d'un déploiement. L'interface n'offrant plus le bouton une fois le
  compte lié, le rattrapage est un **geste staff** (ci-dessous).

**Annonce.** `tcg.reward_granted` avec `reason: 'battlenet_verified'`,
`tournamentId` et `tournamentName` à `null`, `packs: 0`, émis sur la seule
ligne insérée. Ajout **additif** du contrat : le bot écarte toute raison
inconnue sans DM, il doit donc apprendre celle-ci **avant** que le site l'émette.

**La monnaie reste gagnée.** Vérifier un compte est un geste de la joueuse ;
aucun paiement ni don n'y est lié.

**Le rattrapage (geste staff).** `GET/POST /api/admin/tcg/battlenet-backfill`
([`utils/tcg/battlenetBackfill.ts`](../utils/tcg/battlenetBackfill.ts), carte
`TcgBattlenetBackfillCard` dans l'onglet Économie TCG de `/admin/moderation`),
calqué sur le cadeau d'édition : simuler, confirmer (nombre, montant, total, DM
Discord), distribuer, journaliser (`tcg_battlenet_backfill`). Chaque lien passe
par **le même écrivain** que le callback : mêmes index, même annonce, relance
sûre.

**Choix d'audience — l'espace du staff, pas tous les liens.** Les liens
Battle.net sont globaux, le crédit va dans `ctx.tenantId`, et l'index « une fois
par personne » est global : rattraper depuis l'espace A une joueuse qui ne joue
que dans B **consommerait dans A** sa récompense unique, et B ne pourrait plus la
lui verser. Sont donc rattrapés les seuls comptes **rattachés** au tenant au sens
de [`utils/tcg/tenantAttachment.ts`](../utils/tcg/tenantAttachment.ts) : **une
ligne de roster** (`team_members`, la définition de « participante » des deux
cadeaux d'accueil) **ou un gain réel au registre** (elle collectionne déjà ici —
supportrice, drop — sans roster). ⚠️ **Plus « un porte-monnaie »** depuis le
2026-09-15 : un porte-monnaie naît du premier crédit, `admin_grant` compris, et un
owner tiers s'en servait pour détourner la récompense unique d'une étrangère (cf.
« Qui gère le TCG côté staff »). Les liens écartés sont comptés
(`outsideSpace`) plutôt que tus. Limite assumée : un compte vérifié sans roster
ni collection dans l'espace n'est rattrapable nulle part tant qu'il n'y entre
pas — il peut aussi le rattacher lui-même en collectionnant, puis être rattrapé.

Lectures paginées (1000) et par lots de 100 identifiants ; **une audience
illisible rend `500 AUDIENCE_UNREADABLE` et le `POST` n'écrit rien** — une
distribution sur audience partielle afficherait un succès en oubliant des
joueuses. Écritures par vagues de 5. **DM** : un `tcg.reward_granted` par
joueuse créditée ; la simulation dit combien partiront (`discordDms`, comptes
reliés à Discord parmi `wouldGrant`, `null` si non mesurable) et la
confirmation le répète.

**L'incitation.** `GET /api/player/battlenet-status` porte
`reward: { coins, claimable } | null` (additif) : montant du registre,
`claimable: false` si déjà reçue **ou registre illisible** — une promesse faite à
l'aveugle serait démentie au retour. `BattlenetVerifyCard` annonce alors
« vérifier ton compte te rapporte N pièces, une seule fois » à qui n'est pas
encore lié ; aucun nombre n'est écrit côté client, et le composant n'importe pas
le registre (le moteur de rating entrerait dans le bundle) — la logique vit dans
[`utils/tcg/battlenetRewardDisplay.ts`](../utils/tcg/battlenetRewardDisplay.ts),
module pur. Au retour d'OAuth, le callback ajoute **`&tcg=battlenet_reward`**
(ex. `/player/profile?battlenet=verified&tcg=battlenet_reward`) **seulement**
quand l'écrivain rend `granted` ; rejeu, déjà récompensée, refus, exception →
paramètre absent, jamais une erreur de vérification. La carte en fait un toast
« +N pièces créditées », N relu dans l'état (`reward.coins`), jamais dans l'URL :
un paramètre forgé ne crédite rien et n'affiche qu'à son auteur un montant
exact. Le paramètre est retiré de l'URL avec `battlenet`, seulement s'il porte
cette valeur.

### Les séries (collections à compléter)

[`utils/tcg/collectionSets.ts`](../utils/tcg/collectionSets.ts) (calcul pur),
[`utils/tcg/readCollectionSets.ts`](../utils/tcg/readCollectionSets.ts)
(lecture), [`utils/tcg/grantCollectionSets.ts`](../utils/tcg/grantCollectionSets.ts)
(récompense et annonce), [`components/tcg/TcgSetsPanel.tsx`](../components/tcg/TcgSetsPanel.tsx)
(progression sur `/player/tcg`). Une série est un ensemble de cartes à réunir ;
la compléter rapporte `COLLECTION_SET_COINS` — **100 pièces, sans paquet, une
fois par série et par joueuse**.

**Une série se dérive, elle ne se saisit pas.** Trois types, calculés sur les
tables existantes :

| Type | Cartes | `source_ref` |
| --- | --- | --- |
| `map_mode` | toutes les maps d'un mode (registre `config/maps/overwatch.ts`) | `maps:<mode>` |
| `tournament_teams` | toutes les équipes engagées dans une édition (`stage_teams` de ses phases non supprimées) | `tournament:<tournoi>` |
| `team_roster` | la carte d'une équipe + ses joueuses POUR l'édition | `roster:<tournoi>:<équipe>` |

Pourquoi ceux-là : les maps ne représentent personne et sont complétables par
construction ; les équipes d'une édition sont des sujets publics rattachés à un
moment vécu ; le roster est la série la plus parlante (« j'ai toute mon
équipe »). **Écartés** : « toutes les joueuses d'un tournoi » (une chasse aux
personnes à grande échelle, sans le lien du roster) et les séries par rareté
(figée au tirage, elle varie d'un exemplaire à l'autre). Seuls comptent les
tournois visibles (`published`, `running`, `completed`, les 10 plus récents),
et une série a au moins **3 cartes** — un roster sans joueuse tirable, créé en
deux clics depuis `/team/create`, ne rapporte donc rien.

**L'effectif d'une édition** : `match_participants` du tournoi s'il est
`completed` (qui a réellement joué, la définition du palmarès), sinon
`team_members` hors encadrement (aucune feuille de match n'existe avant le
début). Quand l'édition se termine, un roster peut changer de contenu : une
récompense versée reste acquise, une série incomplète suit le nouvel effectif.

**Jamais incomplétable.** Chaque carte d'une série appartient au vivier du
tirage, lu par le module partagé
[`utils/tcg/readDrawPool.ts`](../utils/tcg/readDrawPool.ts) — que l'ouverture de
paquet utilise désormais aussi : une lecture, deux usages, aucune série qui
exigerait une carte qu'aucun paquet ne peut donner. Une équipe inactive ou une
joueuse sans ligne `player_ratings` sort de la série au lieu de la bloquer.

**Consentement.** Une joueuse qui refuse ou retire sa photo garde sa carte
(avatar, aplat), donc sa place dans la série : le consentement n'est même pas
une entrée du calcul. Et **les joueuses manquantes ne sont jamais nommées** —
l'API rend `missingPlayers` (un nombre), seules les équipes et maps manquantes
sont nommées (`missingNamed`). Nommer « il te manque X » ferait de la série un
avis de recherche. Limite assumée : le roster d'une équipe est public sur sa
fiche, une déduction reste possible ; aucun écran ne la fait à la place de la
collectionneuse. Il **n'existe pas** au 2026-09-15 de mécanisme permettant à une
joueuse de ne pas figurer dans le TCG ; s'il est créé en la retirant du vivier
du tirage, elle sortira d'office de toutes les séries, qui rétréciront.

**Deux déclencheurs, une clé.** À l'ouverture d'un paquet (le moment où la
série se complète ; la réponse porte `setsCompleted`) ET à chaque lecture de
`GET /api/player/tcg/sets` (vérification paresseuse : séries déjà complètes
avant la fonctionnalité, migration appliquée après coup, effet de bord raté).
Les deux passent par `checkCollectionSets` → `grantCoinsThenPacks`
(`packSourceKind: null`), un appel par série. La lecture préalable des séries
déjà récompensées ne sert qu'à l'affichage : seul le `RETURNING` décide qu'on
a crédité, et seul lui déclenche l'annonce.

- **Recycler après la récompense ne la reprend pas** : la série se relit sur ce
  qu'on possède (le compteur redescend, `rewarded` reste vrai), la récompense
  vit dans le registre. **Recompléter ne la reverse pas** : la clé est prise.
- **Lecture partielle = aucune écriture** : une phase, un effectif ou le vivier
  illisible rend `500 sets_unreadable` ; un roster lu à moitié paraîtrait
  complet.
- **Migration absente** : l'écriture est refusée en `23514` et journalisée ; la
  lecture suivante retente, rien n'est perdu. Le drapeau `schemaReady` est levé
  avec le code, comme `battlenet_verified`.
- **Pas de `?as=`** : une inspection staff ne récompense pas au nom de
  quelqu'un.

**Le montant.** Une victoire de match, un tiers de booster. Pas de paquet : la
série se complète en ouvrant des paquets, en rendre un nourrirait la boucle
qu'on récompense. Un espace d'une quinzaine de séries plafonne ce gain à ~5
boosters sur toute la vie d'un compte, là où les compléter toutes demande des
dizaines de paquets.

**Annonce.** `tcg.set_completed`
`{ userId, discordUserId, discordUsername, setKey, setLabel, coins, ctaUrl }`,
un par joueuse, sur la seule écriture réelle. `setLabel` est composé en français
par le site (`Maps — Contrôle`, `Équipes — Cup 2026`,
`Roster Hinode Sparkles — Cup 2026`) et **ne nomme jamais une joueuse** : un DM
se lit par-dessus l'épaule. Événement distinct de `tcg.reward_granted` : une
série n'a ni tournoi obligatoire, ni rang, ni paquet.

### Les échanges : carte contre carte

La première interaction entre collectionneuses
([`utils/tcg/tradeRules.ts`](../utils/tcg/tradeRules.ts),
[`utils/tcg/trades.ts`](../utils/tcg/trades.ts),
[`pages/api/player/tcg/trades/`](../pages/api/player/tcg/trades),
[`pages/player/tcg/echanges.tsx`](../pages/player/tcg/echanges.tsx), migration
`tcg_card_trades.sql`, **non appliquée** au 2026-09-15). Une joueuse propose des
cartes à elle contre des cartes qu'une autre montre en double ; l'autre accepte,
refuse ou laisse expirer.

**Carte contre carte, rien d'autre.** Aucune pièce, aucun paquet fermé, aucun
don : le corps d'une proposition est strict (zod `.strict()`), il n'a pas de
champ pour un montant, un paquet ou un message, et la migration n'écrit jamais
`tcg_wallet_entries`. Les deux côtés portent **au moins une carte et autant de
cartes** (1 à 5, parité). La monnaie reste gagnée, jamais transférée — un marché
de pièces rouvrirait la revente contre de l'argent réel (cf. « La monnaie se
gagne »).

**La carte se déplace, elle n'est pas recopiée.** À l'acceptation, la LIGNE de
`tcg_pack_cards` change de paquet : elle rejoint un paquet d'origine `trade`,
**ouvert dès sa création**, de la receveuse. Conséquences voulues :

- rareté et brillance restent celles du tirage (c'est la même ligne) ;
- aucun lecteur de collection n'a changé : « ce que je possède » se déduit
  toujours des paquets ouverts, et une carte ne peut pas compter deux fois ;
- un recyclage concurrent échoue proprement — son `UPDATE` exige l'ancien
  `pack_id` ;
- **aucune image ne voyage** : la face est relue par `readCardFaces` partout, y
  compris dans les propositions ; une photo retirée disparaît aussi chez la
  nouvelle propriétaire.

La provenance est gardée dans `tcg_trade_items` (`from_*` → `to_*`). Les paquets
`trade` sont **exclus des compteurs de paquets** (liste des paquets, vue
d'ensemble staff, route bot) : ils ne sortent d'aucune victoire ni d'aucun achat.

**Atomicité réelle.** PostgREST ne fait pas de transaction multi-requêtes ; deux
`update` successifs pourraient laisser une carte partie sans que l'autre arrive.
Proposer et accepter sont donc deux fonctions SQL `SECURITY DEFINER`
(`tcg_propose_trade`, `tcg_accept_trade`), exécutables par `service_role`
seule. L'acceptation, dans cet ordre : lecture de la paire sans verrou → verrous
consultatifs sur les **deux** joueuses, ordre stable (pas d'interblocage entre
deux acceptations qui partagent quelqu'un) → verrou de la proposition →
plafonds → **revérification de la possession sous verrou de ligne** (paquet
ouvert à elle, non recyclée, échangeable, même sujet) → deux paquets `trade` →
déplacements → statut. Une proposition déjà acceptée rend `already_accepted`
avant toute écriture : **double clic et retry sont idempotents**, sans seconde
annonce. Un 504 après commit se rattrape de la même façon.

**Engagement d'une carte : la caducité, pas le gel.** Une carte OFFERTE est un
exemplaire précis, figé à la proposition ; elle ne peut pas être promise dans
une seconde proposition en attente (vérifié sous le verrou de la proposante).
Elle **n'est pas gelée** pour autant : recycler reste possible, et la
proposition devient **caduque proprement** — à l'acceptation, l'exemplaire
manquant fait annuler la proposition par le système (`offered_unavailable`),
annoncée à la proposante. Quand un échange accepté déplace un exemplaire offert
ailleurs, ces autres propositions sont annulées sur-le-champ
(`card_unavailable`). Les cartes DEMANDÉES ne sont jamais verrouillées chez la
destinataire : sinon demander une carte suffirait à empêcher quelqu'un de la
recycler. Si elle ne l'a plus au moment d'accepter, la réponse est
`409 requested_unavailable` **sans rien changer ni annoncer** — l'annonce
apprendrait à la proposante ce que l'autre ne possède plus.

**Vie privée : on ne voit pas la collection d'une autre.** Trois choix liés :

- **opt-in, désactivé par défaut** (`tcg_trade_settings.accepts_proposals`) :
  dans un milieu où les joueuses subissent du harcèlement, être sollicitable est
  une décision. Même règle que la photo et que la découverte joueuse ;
- la liste des partenaires ne contient **que les volontaires du tenant**, servie
  à une volontaire (réciprocité), sans email, sans recherche plateforme ni RPC
  staff — ce n'est pas un annuaire ;
- d'une partenaire, on ne voit que ses **doubles échangeables** (au moins deux
  exemplaires, dont un échangeable), à la rareté de l'exemplaire qui partirait.
  Une demande « à l'aveugle » dans tout le catalogue aurait exigé de lister
  toutes les joueuses de l'espace et aurait sondé sa collection proposition
  après proposition. Côté destinataire, l'exemplaire cédé est le **moins
  précieux** (même règle que le recyclage), et l'écran avertit d'un dernier
  exemplaire.

**Anti-harcèlement.** Pas de texte libre ; une seule proposition en attente par
paire (index unique partiel) ; 5 envoyées et 10 reçues en attente au plus ;
**24 h après un refus** avant de reproposer à la même personne ; expiration à
**72 h** ; pas d'échange avec soi-même (`CHECK`). Désactiver les échanges ne
laisse rien en attente : reçues annulées par le système (annoncées), envoyées
retirées (non annoncées).

**Anti-abus multi-comptes** (retour de l'audit sécurité du 2026-09-15). Le rôle
`supporter` s'auto-attribue et rapporte un paquet par compte ; un roster se
gonfle de comptes secondaires avant un 5e check-in. L'échange en ferait un
filon. Gardes, **toutes par compte et portées par la base** (le rate-limit HTTP
lit une IP fournie par le client, il ne protège de rien seul) :

| Garde | Où |
| --- | --- |
| Seules les cartes de paquets `victory`, `placement`, `purchase`, `trade` s'échangent — **pas** `welcome` (cadeaux), `streak` (roster gonflable), `drop` (compte Twitch gratuit) | `tcg_pack_source_tradeable` ↔ `TRADEABLE_PACK_SOURCES` (test qui lit le SQL) |
| Compte d'au moins **14 jours** ET collection (premier paquet gagné) d'au moins **7 jours**, pour activer, proposer et accepter | `tcg_trade_eligibility` (lit `auth.users.created_at`) |
| Parité du nombre de cartes | `tcg_propose_trade` + zod |
| **3 échanges acceptés par 24 h glissantes**, par personne, des deux côtés | `tcg_accept_trade`, sous verrous consultatifs |
| Une carte reçue par échange **ne compte pas pour les séries** (ni récompense, ni progression) | `readOwnedCardRows(…, { excludeTradedIn: true })` dans `checkCollectionSets` |

`purchase` reste échangeable : un booster coûte 300 pièces gagnées, le cadeau
d'accueil (100) n'y suffit pas seul. Limite assumée : des comptes secondaires
qui GAGNENT réellement des matchs, patients, peuvent encore faire converger des
cartes — à parité, trois échanges par jour, cartes communes contre rares. La
valeur n'est pas équilibrée (cf. §7).

**Expiration : paresseuse ET planifiée.** Chaque route d'échange expire ce qui
concerne l'appelante avant de lire ; le cron horaire
[`/api/cron/tcg-trades-expire`](../pages/api/cron/tcg-trades-expire.ts)
(`netlify/functions/tcg-trades-expire-cron.ts`, `17 * * * *`) garantit que
l'annonce part à temps même si personne ne revient. L'écriture est
conditionnelle (`status = 'pending'`) : deux déclencheurs ne peuvent pas faire
basculer la même ligne, donc **une seule annonce**.

**Annonces bot** (contrat fixe, `docs/BOT_API_CONTRACT.md`) :
`tcg.trade_proposed` à la destinataire à la création, `tcg.trade_resolved` à la
proposante (`accepted`, `declined`, `expired`, et `cancelled` **seulement** si
le système annule). Aucune image, aucun sujet de carte dans la charge. Hors
`WEB_PUSH_EVENT_TYPES`. Accepter régénère aussi la fiche publique des deux
joueuses (`revalidatePlayerCard`, vitrine), en best-effort.

**Journalisation.** Les tables sont le journal durable (création, résolution,
motif, provenance de chaque carte) ; chaque transition est aussi journalisée
côté serveur (`[tcg/trades]`). Pas de `staff_logs` : ce sont des gestes de
joueuses.

### Les pronostics sur les matchs de tournoi

[`utils/predictions/rules.ts`](../utils/predictions/rules.ts) (règles pures),
[`utils/predictions/eligibility.ts`](../utils/predictions/eligibility.ts)
(exclusions), [`utils/predictions/settle.ts`](../utils/predictions/settle.ts)
(règlement et crédit), [`utils/predictions/readState.ts`](../utils/predictions/readState.ts)
(lectures), [`components/predictions/`](../components/predictions/) (carte de la
page match, panneau de `/player/tcg`). Migration
[`match_predictions.sql`](../database/migrations/match_predictions.sql).

Avant un match de tournoi, une personne connectée choisit l'équipe qu'elle voit
gagner. Un pronostic juste rapporte `MATCH_PREDICTION_COINS` — **25 pièces, sans
paquet, une fois par match et par personne**.

**Un pronostic, pas un pari.** Il ne coûte rien et les pièces ne s'achètent pas :
sans mise ni gain monétisable, ce n'est pas un jeu d'argent (ANJ). L'interface
n'emploie ni « mise », ni « parier », ni « cote ». Faire payer l'entrée, même en
pièces, changerait la nature de la fonctionnalité : une décision produit, pas un
réglage.

**Qui ne pronostique pas.** Les membres des deux rosters (accepté ou non) et
leurs capitaines, les personnes sur la feuille de match, le staff actif. C'est
vérifié à l'écriture (`403 participant` / `403 staff`) ET au règlement : une
remplaçante ajoutée après son pronostic est réglée `void`.

**Le verrou est en base.** Ouvert tant que le match est `pending`, non lancé
(`started_at` nul) et avant son heure prévue. Le déclencheur
`match_predictions_guard` relit le match dans la transaction d'écriture et
refuse un match verrouillé, un bye, un miroir de scrim, un match supprimé ou une
équipe hors match ; il pose `updated_at` lui-même. Le règlement ignore en plus
tout pronostic postérieur au lancement réel (défense en profondeur). La
répartition des pronostics n'est rendue qu'une fois le match verrouillé, pour
ne pas pousser à suivre la foule.

**Le règlement.** `applyMatchScore` appelle `settleMatchPredictions` après le
rating, sans jamais lever. Issue `finished` avec vainqueur → `won` / `lost` ;
forfait, walkover, annulation ou vainqueur illisible → `void` pour tout le monde
(sinon une équipe offrirait des pièces à qui a pronostiqué l'adversaire en
déclarant forfait) ; `ongoing` ou `disputed` → rien, on attend l'issue. Les
pièces passent par `grantCoinsThenPacks` (`source_ref = <matchId>`,
`packSourceKind: null`) **avant** le marquage : un crédit refusé ne marque rien
et le règlement suivant paie, un rejeu ne recrédite personne.

- **Le premier résultat règle.** Une correction de score ne reprend pas des
  pièces versées et ne rouvre pas les pronostics réglés — même posture que la
  victoire.
- **Pas de DM.** Un message par match juste serait du bruit : le gain apparaît
  dans l'historique du porte-monnaie et sur la carte du match. Aucun événement
  bot, donc aucun ordre de déploiement bot/site.
- **Pas de plafond par jour ou par tournoi.** La limite est la clé (un par
  match). Un tournoi de 60 matchs rapporte au mieux 1 500 pièces à qui les
  devine tous, soit 5 boosters — moins que le palmarès d'une championne. À
  revoir si l'usage montre du « farm ».
- **Ne rattache pas à l'espace** (`tenantAttachment.ts`) : l'issue est pilotée
  par l'organisation.

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

**Un scrim paie une fois, quel que soit son miroir** (correctif de sécurité du
2026-09-15). Un scrim classé est noté via un match **miroir**
([`utils/scrims/ratedMatch.ts`](../utils/scrims/ratedMatch.ts)), et la récompense
était clée sur l'id de ce miroir — pièces (`source_ref`) comme paquet
(`source_match_id`). Or le miroir était **supprimé** dès que le scrim cessait
d'être éligible, puis **recréé** sous un autre id. La boucle, sans complice : A
gagne, reports concordants → miroir M1 → paquet + 50 pièces ; la capitaine A
re-rapporte 0-1 → litige → M1 supprimé (le paquet part en cascade) ; elle
re-rapporte 1-0 → accord avec le report de B resté en base → M2 → nouveau paquet,
nouvelles pièces. À l'infini. Trois correctifs, chacun suffisant contre la
boucle des capitaines :

1. **La clé est le scrim.** Pièces `scrim_win` sous `source_ref = scrim:<scrimId>`
   (`refKind: 'scrim'` dans `earnSources.ts`), écrites **d'abord**, et paquet
   accordé aux **seules** joueuses que cette écriture vient de créditer — la
   discipline de `grantCoinsThenPacks`. Un scrim déjà payé, sous ce miroir ou un
   autre, ne rend aucune ligne, donc aucun paquet ni annonce. Une victoire de
   scrim sans `scrimId` ne paie **rien** plutôt que de retomber sur le miroir.
   Un arbitrage qui change de vainqueur paie les nouvelles gagnantes, sans rien
   reprendre aux anciennes (un paquet ouvert ne se reprend pas).
2. **Un scrim `completed` ne se re-rapporte plus.** `409 SCRIM_CLOSED` : un
   résultat validé par les deux équipes n'a pas à être défait par une seule ;
   une contestation passe par le staff. La bascule en litige est en outre
   **conditionnelle** (`status NOT IN (completed, cancelled)`) : un scrim clos
   entre la lecture et un report divergent n'est pas rouvert.
3. **Un miroir qui a payé est neutralisé, plus supprimé.** S'il a servi de source
   à un paquet (ou si on ne peut pas le lire), il passe `disputed` (scrim en
   litige) ou `cancelled`, sans vainqueur, et perd historique de rating et
   feuille ; il redevient `finished` **sous le même id** si le scrim redevient
   éligible. Les paquets — et les cartes déjà ouvertes, éventuellement échangées —
   ne partent plus en cascade. Un miroir neutralisé reste visible dans la liste
   des matchs du scrim (statut annulé / litige) : c'est le prix assumé.

Les gains versés **avant** le correctif portent l'id du miroir : la migration de
données `tcg_scrim_win_stable_ref.sql` les réécrit sous `scrim:<id>` quand le
miroir existe encore (cf. §7 pour l'ordre et ce qu'elle ne peut pas rattraper).
Les **matchs de tournoi** gardent leur clé (l'id du match) : le report d'un match
ne supprime pas le match, et le paquet reste accordé à toutes les gagnantes,
son unicité suffisant contre un rejeu.

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

Neuf tables, toutes en RLS `service_role` seul — rien n'est lu par le client en
direct, tout passe par les routes serveur.

| Table                | Clé                    | Rôle                                                  |
| -------------------- | ---------------------- | ----------------------------------------------------- |
| `tcg_player_cards`   | `(tenant_id, user_id)` | consentement + photo modérée d'une joueuse            |
| `tcg_packs`          | `id`                   | un paquet : `victory`, `purchase`, `welcome`, `drop`, `placement` ou `streak` |
| `tcg_pack_cards`     | `(pack_id, position)`  | contenu figé d'un paquet ouvert                       |
| `tcg_wallets`        | `(tenant_id, user_id)` | solde — **cache** du registre, `CHECK (balance >= 0)` |
| `tcg_wallet_entries` | `id`                   | registre des mouvements — **source de vérité**        |
| `tcg_showcases`      | `(tenant_id, user_id)` | vitrine opt-in : `enabled` (défaut `false`) + ≤ 3 références de sujet (`tcg_showcases.sql`, **non appliquée** au 2026-09-15) |
| `tcg_trade_settings` | `(tenant_id, user_id)` | « recevoir des propositions » — opt-in, défaut `false` (`tcg_card_trades.sql`, **non appliquée**) |
| `tcg_trades`         | `id`                   | une proposition d'échange et son issue (`pending`, `accepted`, `declined`, `cancelled` + motif, `expired`) |
| `tcg_trade_items`    | `(trade_id, side, ordinal)` | ses cartes : offerte = exemplaire figé ; demandée = sujet, exemplaire choisi à l'acceptation ; provenance `from_*` → `to_*`, aucune image |

**Les invariants sont dans le schéma, pas dans la prudence de l'appelant.** C'est
la leçon explicitement citée par les trois migrations : le 2026-09-12, quatre
publications Discord en double ont été produites par une protection uniquement
applicative — une relecture « ai-je déjà fait ? » laisse toujours une fenêtre
entre la lecture et l'écriture.

- `UNIQUE (tenant_id, user_id, source_match_id)` sur `tcg_packs` : un match ne
  peut pas offrir deux paquets à la même joueuse. L'attribution s'écrit donc en
  `upsert(..., ignoreDuplicates: true)` — un rejeu (reprise de cron, correction
  de score, double appel) ne crée rien et n'échoue pas. ⚠️ **Elle suit l'id du
  match, pas la rencontre** : `source_match_id` est en `ON DELETE CASCADE`, et un
  match supprimé puis recréé rouvre la récompense. C'est pourquoi la victoire de
  **scrim** s'ancre sur le registre (`scrim:<scrimId>`) et que son miroir n'est
  plus supprimé (cf. « Ce que la victoire déclenche ») ; le cas des matchs de
  tournoi est au §7.
- **Toute dépense se décide sous verrou** : `tcg_purchase_booster` et
  `tcg_admin_debit` verrouillent la ligne `tcg_wallets` (`FOR UPDATE`), relisent
  `SUM(amount)` et écrivent dans la même transaction ; `tcg_refresh_wallet_balance`
  prend le même verrou avant de réécrire le cache. Un gain n'a pas besoin du
  verrou pour s'écrire (il ne peut rien rendre négatif), seulement pour recalculer.
- `UNIQUE (tenant_id, user_id, source_kind, source_ref)` sur
  `tcg_wallet_entries` : une source ne peut créditer ou débiter qu'une fois. Pour
  le recyclage, `source_ref = <pack_id>:<position>` désigne **la** carte, ce qui
  donne l'idempotence gratuitement.
- Deux index uniques **partiels** sur `tcg_wallet_entries`, pour la seule
  source `battlenet_verified` (`tcg_battlenet_verified.sql`) : `(user_id)` et
  `(source_ref)`, **sans `tenant_id`** — une récompense par personne et par
  compte Blizzard, tous tenants confondus. Ils lèvent `23505` là où la clé du
  registre ferait `DO NOTHING` (cf. §4).
- `CHECK` d'exclusivité sur `tcg_pack_cards` : exactement **un** des trois sujets
  renseigné (`card_user_id`, `card_team_id`, `card_map_slug`), cohérent avec
  `subject_kind`. Sans lui, une carte pourrait n'avoir aucun sujet (invisible) ou
  deux (ambiguë) — deux états qu'aucun code d'affichage ne saurait traiter.
  L'identifiant d'une map est son **slug** et non un uuid : les maps vivent dans
  un registre, pas dans une table. C'est
  [`utils/tcg/subjectKey.ts`](../utils/tcg/subjectKey.ts) qui répond « de quel
  sujet parle cette carte ? », en un seul endroit — la question se posait dans
  cinq lecteurs, et l'arrivée des maps aurait demandé cinq modifications
  identiques dont une seule oubliée aurait suffi à compter une map comme une
  équipe sans sujet. Les lecteurs sautent une ligne sans sujet plutôt que d'afficher une
  carte vide : ce serait une corruption.
- `CHECK` de cohérence d'origine : `victory` **exige** un match, toutes les
  autres origines (`purchase`, `welcome`, `drop`, `placement`, `streak`)
  l'**interdisent**. Un achat qui citerait un match serait une victoire déguisée ;
  un drop ou une série qui en citerait un entrerait en collision avec le paquet
  de victoire du même match. Pour ces origines sans match, l'idempotence vient
  du registre des pièces, écrit **avant** le paquet (`grantCoinsThenPacks`).
- L'ouverture d'un paquet nullifie sa réservation via `opened_at IS NULL` dans le
  `WHERE`, et le recyclage via `recycled_at IS NULL` : deux clics simultanés ne
  peuvent pas réussir tous les deux, le second ne touche aucune ligne.
- **Échanges** (`tcg_card_trades.sql`) : `CHECK (proposer_id <> recipient_id)` ;
  index unique partiel `(tenant_id, proposer_id, recipient_id) WHERE status =
  'pending'` (une proposition en attente par paire) ; `CHECK` de cohérence
  statut / `resolved_at` / motif d'annulation ; aucune colonne de texte libre ni
  de montant. L'origine `trade` est ajoutée aux **deux** contraintes de
  `tcg_packs` (listes recopiées en entier — énumérer avant d'appliquer). La
  possession se revérifie **sous verrou** dans `tcg_accept_trade`, jamais par
  une relecture applicative.

Deux décisions de modélisation méritent d'être connues avant d'y toucher :

- **pas de table `collection`.** Ce qu'une joueuse possède se déduit de ses
  paquets ouverts. Un agrégat finit par diverger du détail qui le nourrit, et au
  volume attendu le comptage à la lecture est gratuit.
- **pas de table « séries ».** Une série se dérive du registre des maps, des
  équipes engagées et des effectifs ; seule sa RÉCOMPENSE est stockée, dans le
  registre (`collection_set`). La vitrine, elle, stocke des références de sujet
  et se relit contre la possession : aucune des deux ne copie une carte.
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

| Route                                                | Méthodes          | Auth                                 | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/player/tcg/photo`                              | GET, POST, DELETE | joueuse                              | L'état de **ma** carte ; déposer une photo (vaut consentement, repasse en `pending`) ; retirer son accord. Une lecture en échec rend `500` sans rien écrire ; retrait conditionnel au chemin lu (`409 PHOTO_CHANGED` après trois courses). 5/min en POST, 10/min en DELETE.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/player/tcg/packs`                              | GET, POST         | joueuse                              | Mes paquets + solde + `boosterPrice`, `earn`, `recycleRefund` (GET, 60/min) — **paginé** : `limit` (1..200, défaut 200), `cursor`, `status=unopened\|opened`, `nextCursor` ; `unopened` compte TOUS les paquets fermés. Ouvrir un paquet et **révéler** ses cartes, faces comprises, chacune avec `isNew` (POST, 30/min).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/api/player/tcg/collection`                         | GET               | joueuse                              | Ma collection, déduite des paquets ouverts, recyclées exclues, agrégée par sujet, les plus rares d'abord. Chaque carte porte `recyclable` : le couple `{ packId, position }` d'un exemplaire à recycler, ou `null` dès qu'il n'y en a qu'un — la route de recyclage refuse le dernier, et un bouton qu'elle rejetterait promettrait un geste impossible. L'exemplaire désigné est le **moins précieux** (plus basse rareté, non brillant à rareté égale) : la carte s'affiche avec sa MEILLEURE rareté, et recycler « ce doublon » ne doit jamais coûter la meilleure des copies. **Paginée** : `limit` (1..200), `cursor`, `nextCursor` ; sans paramètre, tout comme avant. 60/min.                                                                                                                                       |
| `/api/player/tcg/booster`                            | POST              | joueuse                              | Acheter un paquet **fermé** avec ses pièces — **une transaction SQL** (`tcg_purchase_booster`) ; `503 purchase_unavailable` sans la migration. 20/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/api/player/tcg/recycle`                            | POST              | joueuse                              | Recycler un **doublon** contre `RECYCLE_REFUND_COINS`. 30/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/player/tcg/wallet`                             | GET               | joueuse                              | « D'où viennent mes pièces ? » — 50 derniers mouvements, `shownTotal`, `truncated`. 60/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/tcg/photos`                              | GET, PATCH        | staff, permission `manage_tcg`       | La file de relecture (`pending`, la plus ancienne d'abord) ; approuver ou refuser. Chaque élément porte `displayName` et `email`, résolus en un appel par la RPC `fetchAdminUserProfiles` — un **enrichissement, jamais une condition** : une résolution en échec rend `null` et la file reste servie, parce qu'une relectrice doit d'abord voir l'image. Chaque élément porte aussi `photoPath`, **exigé** par le `PATCH` : l'écriture est conditionnelle au fichier affiché, `409 PHOTO_CHANGED` s'il a été remplacé. Journalisé. 60/min en GET, 30/min en PATCH. |
| `/api/admin/tcg/overview`                            | GET               | staff, permission `manage_tcg`       | État de l'économie en un appel : paquets, pièces, cartes par rareté, photos, sujets les plus distribués. Tout est agrégé côté serveur — aucune ligne de détail ne sort. `null` ≠ `0` : une clé en échec vaut « pas mesurable », jamais « mesuré et vide ». 30/min, `Cache-Control: private, max-age=30`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/api/bot/v1/players/by-discord/{discordUserId}/tcg` | GET               | bot, `x-api-key` par tenant          | Solde, paquets en attente et **résumé** de collection pour Discord. `discordUserId` : 15 à 25 chiffres (la spec est alignée sur le code, des identifiants courts existant chez les comptes anciens). 60/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/webhooks/twitch/tcg-drop`                      | POST              | signature HMAC Twitch EventSub       | Webhook entrant : créditer une spectatrice qui échange des points de chaîne. Corps lu brut (`bodyParser: false`), signature vérifiée **avant** tout parsing, fenêtre anti-rejeu de 10 min, tenant résolu par la chaîne et non par `x-tenant-id`. **En service** depuis le 2026-09-13. Une `revocation` est lue et non seulement acquittée : son `status` dit laquelle des trois causes s'applique. Crédite **pièces + un paquet `drop`** (pièces d'abord) ; `packGranted` dans la réponse, `pack: { id } \| null` dans `tcg.drop_granted`. 600/min.                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/tcg/overlay-token`                       | GET, POST, DELETE | staff, permission `manage_tcg`       | Le lien de la source navigateur OBS. Un seul jeton actif par espace : émettre révoque le précédent. Journalisé **sans** le jeton. 30/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/api/admin/tcg/overlay-theme`                       | GET, PUT          | staff, permission `manage_tcg`       | L'habillage de l'overlay (couleur, position, deux formulations, image ou vidéo). **Patch partiel** ; `null` = revenir au défaut. Média validé par **magic bytes** avant dépôt en bucket public. 30/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/api/admin/tcg/welcome-gift`                        | GET, POST         | staff, permission `manage_tcg`       | Simuler puis distribuer le cadeau d'accueil de l'édition en cours. `GET` n'écrit rien. `POST` honore `Idempotency-Key`. Journalisé. 20/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/tcg/grant`                               | POST              | staff, permission `manage_tcg`       | Corriger le solde d'une joueuse (`admin_grant`, crédit ou retrait, valeur absolue ≤ 10 000, motif obligatoire). **Une correction tracée, pas une vente.** Registre d'abord, `source_ref` = `idempotencyKey` : l'unicité du registre porte l'idempotence, un rejeu rend `replayed: true` sans double crédit. **Joueuse rattachée à l'espace seulement** (sinon `404 USER_NOT_FOUND`). Un retrait ne passe jamais sous zéro (`409 INSUFFICIENT_BALANCE`) : fonction SQL `tcg_admin_debit`, sous verrou ; `503 WITHDRAWAL_UNAVAILABLE` sans la migration. Motif journalisé `tcg_admin_grant` (le registre n'a pas de colonne pour lui). 30/min. |
| `/api/admin/tcg/battlenet-backfill`                  | GET, POST         | staff, permission `manage_tcg`       | Rattraper la récompense Battle.net des comptes liés avant elle, **dans l'espace du staff** (roster ou gain réel au registre du tenant — plus un simple porte-monnaie). `GET` simule (`eligible`, `alreadyRewarded`, `wouldGrant`, `discordDms`, `outsideSpace`, `ready`, `reward`) ; `POST` passe chaque lien par l'écrivain du callback, rend `{ eligible, granted, already, errors, reward }`. Audience illisible → `500`, rien écrit. `Idempotency-Key`. Journalisé `tcg_battlenet_backfill`. 20/min. |
| `/api/admin/tcg/players`                             | GET               | staff, permission `manage_tcg`       | Recherche de comptes pour la carte « Ajuster un solde », **cantonnée à l'espace** (RPC `admin_search_tcg_players`, pseudo + BattleTag, 20 résultats, `email` toujours `null`), sans exiger `manage_staff`. `503 SEARCH_UNAVAILABLE` sans la migration. |
| `/api/player/tcg/welcome-gift`                       | GET, POST         | joueuse (**`withSubjectRoute`**)     | `GET` : « Ai-je reçu un cadeau ? » — `{ gift: { coins, receivedAt } \| null, supporterClaimable }`, les DEUX accueils confondus (`welcome_gift` et `supporter_welcome`) ; `supporterClaimable` vient de `grantSupporterWelcome({ dryRun: true })`, donc des conditions EXACTES du POST — proposer un bouton que le serveur refuserait serait pire que ne rien proposer. `POST` : réclamer le cadeau **supportrice**, une fois par compte, `{ status, coins, packGranted }` — `packGranted: false` DIT l'écriture partielle au lieu de la masquer. Seule route `tcg/` à honorer `?as=`, mais **sans `allowActAs`** : le `POST` est donc refusé en inspection, un cadeau réclamé ne se rendant pas. 60/min en GET, 6/min en POST. |
| `/api/player/tcg/sets`                               | GET               | joueuse                              | Mes séries : `{ sets[], rewardCoins, newlyRewarded[] }`. Chaque série : `key`, `kind`, faits bruts (`mode`, `tournamentName`, `teamName`), `total`, `owned`, `complete`, `missingNamed` (équipes et maps SEULEMENT), `missingPlayers` (un nombre), `rewarded`, `justRewarded`. **Lecture qui peut écrire** (récompense idempotente, `tcg.set_completed`). Lecture partielle → `500 sets_unreadable`, rien d'écrit. Pas de `?as=`. 30/min. |
| `/api/player/tcg/trades`                             | GET, POST         | joueuse                              | **Échanges.** GET : mes propositions `box=received\|sent`, `state=open\|closed`, curseur ; expiration paresseuse avant lecture ; faces relues ; `ownedCopies` de l'appelante sur les cartes demandées d'une reçue en attente, rien de la collection de l'autre. POST : proposer (corps strict, parité, 1..5) par `tcg_propose_trade` — `201`, annonce `tcg.trade_proposed`. 60/min, 10/min. |
| `/api/player/tcg/trades/{tradeId}`                   | POST              | joueuse                              | `accept` (`tcg_accept_trade`, atomique, **idempotent**), `decline`, `cancel`. 404 hors de la paire ou du tenant. Annonce `tcg.trade_resolved`. 30/min. |
| `/api/player/tcg/trades/settings`                    | GET, PUT          | joueuse                              | Opt-in (défaut `false`), éligibilité (compte 14 j + collection 7 j), plafonds, compteurs. Désactiver annule tout ce qui est en attente. 60/min, 10/min. |
| `/api/player/tcg/trades/partners`                    | GET               | joueuse (volontaire)                 | Les volontaires du tenant, pseudo seul, jamais d'email. 30/min. |
| `/api/player/tcg/trades/cards`                       | GET               | joueuse                              | Mes cartes (`copies`, `tradeableCopies`, `available`), ou les doubles échangeables d'une partenaire volontaire. 60/min. |
| `/api/cron/tcg-trades-expire`                        | GET, POST         | `CRON_SECRET`                        | Expire les propositions échues, tous tenants, une annonce par proposition. Horaire. |
| `/api/player/tcg/showcase`                           | GET, PUT          | joueuse                              | Ma vitrine : `{ enabled, cards[], unavailable, maxCards, publicProfileUrl }`, désactivée par défaut. `PUT { enabled, cards }` (≤ 3 clés de sujet) : `409 not_owned` pour activer une carte non possédée, désactivation jamais bloquée, fiche régénérée. 60/min en GET, 20/min en PUT. |
| `/api/player/predictions`                            | GET               | joueuse                              | **Pronostics.** Matchs à venir encore ouverts (hors matchs de ses équipes, rien pour le staff) et ses 20 derniers pronostics avec résultat. Affiche, ne décide pas. |
| `/api/player/predictions/{matchId}`                  | GET, PUT, DELETE  | joueuse                              | État (`window`, `locksAt`, `reward`, `ineligibility`, `prediction`, `distribution` une fois verrouillé) ; pronostiquer `{ teamId }` ou changer d'avis ; retirer. `409 locked\|not_predictable`, `403 participant\|staff`, `400 invalid_team`, 404 hors tenant. Gratuit, crédité au résultat. 30/min en écriture. |
| `/api/overlay/tcg/{token}`                           | GET               | **public**, porté par le jeton       | Le flux d'annonces d'une source navigateur OBS, plus l'habillage. Réduit au déjà-public : pseudo Twitch et origine d'événement, jamais un nom de compte ni une photo. `s-maxage=5`. 120/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Quelques conventions transverses :

- **Trois routes hors `tcg/` écrivent au TCG en effet de bord** :
  `POST /api/admin/tournament/[id]/finalize` (palmarès, compte rendu additif
  `tcg_placement_rewards`), `redeemCheckinToken`, derrière
  `POST /api/checkin/[token]` et `POST /api/bot/v1/matches/[matchId]/checkin`
  (série de check-ins, réponse inchangée), et `GET /api/auth/battlenet/callback`
  (vérification Battle.net, redirection inchangée). Toutes annoncent le gain par
  `tcg.reward_granted` (`utils/tcg/announceReward.ts`), un événement par
  joueuse créditée, jamais sur un rejeu — le bot en fait un DM.
- **L'ouverture d'un paquet récompense aussi les séries** qu'elle complète
  (`POST /api/player/tcg/packs`, champ additif `setsCompleted`), avec
  `tcg.set_completed` — cf. « Les séries ».

- **404 plutôt que 403** sur un paquet ou une carte qui n'est pas le sien : on ne
  confirme pas l'existence de ce qui n'appartient pas à l'appelante.
- **Codes stables** (`already_opened`, `empty_pool`, `insufficient_funds`,
  `balance_changed`, `not_a_duplicate`, `already_recycled`, `NOT_PENDING`,
  `PHOTO_CHANGED`, `purchase_unavailable`, `SEARCH_UNAVAILABLE`,
  `WITHDRAWAL_UNAVAILABLE`, `SCRIM_CLOSED`,
  `sets_unreadable`, `invalid_body`, `invalid_card`, `not_owned`) : c'est
  l'interface qui traduit, le message n'est qu'un repli.
- **L'API rend le fait, l'interface le formule.** `sourceKind` part brut, jamais
  un libellé : traduire au serveur l'obligerait à connaître la langue de la
  lectrice et figerait le vocabulaire à deux endroits.
- **La route bot ne rend qu'un résumé**, jamais la collection ni les faces : un
  message Discord n'affiche pas quarante cartes, et renvoyer tout obligerait le
  bot à décider seul ce qui mérite d'être montré.
- **Pagination par curseur (2026-09-15)**, [`utils/tcg/pageCursor.ts`](../utils/tcg/pageCursor.ts).
  Rétrocompatible : sans paramètre, la forme d'avant plus `nextCursor`. Un
  curseur plutôt qu'un offset, parce qu'une collection bouge pendant qu'on la
  parcourt (ouvrir, recycler) et qu'un offset répète ou saute alors une carte.
  L'ordre est **total** — rareté puis clé de sujet pour la collection,
  `(granted_at, id)` décroissants pour les paquets — faute de quoi les ex æquo
  n'ont pas d'ordre garanti. La collection pagine l'**affichage**, pas la
  lecture : compter les exemplaires et désigner le pire doublon exigent toutes
  les cartes d'un sujet ; `distinct`/`total` restent donc globaux et seules les
  faces de la page sont relues. Le curseur ne porte **jamais d'URL d'image**, et
  les deux routes répondent `private, no-store`. Le curseur des paquets est
  interpolé dans un `.or(...)` PostgREST : il est validé en forme exacte
  (horodatage + UUID), jamais ignoré en silence (`400 invalid_cursor`).
- **Lecture sans plafond silencieux** : [`utils/tcg/readOwnedCards.ts`](../utils/tcg/readOwnedCards.ts)
  lit les paquets par pages de 1000 et leurs cartes par lots de 100 paquets.
  L'ancien `.limit(5000)` de la collection était en réalité servi à **1000
  lignes** par PostgREST (`max_rows`) : au-delà de 200 paquets ouverts, compteur,
  progression et doublons devenaient faux ensemble. Plafond restant :
  10 000 paquets, journalisé s'il est atteint. Le **recyclage** et la **route
  bot** lisent par le même module : les trois lecteurs comptent la même
  collection (la route bot compte en outre ses paquets en `head: true`).
- **« Nouvelle carte » est décidé par le serveur** (`isNew` à l'ouverture, via
  `readOwnedSubjectKeys`) : une collection paginée ne permet plus à la page de
  savoir ce qu'on possède. Requête ciblée sur les cinq sujets tirés, jamais une
  relecture de toute la collection ; omis si la lecture échoue.

## 7. Ce qui reste à faire

- **Correctifs de sécurité du 2026-09-15 : livrés, migrations NON appliquées.**
  Ordre de déploiement :
  1. appliquer `tcg_wallet_atomic_balance.sql` et
     `tcg_admin_search_players_scoped.sql` **avant** le site (fonctions seules,
     aucune table touchée) ;
  2. déployer le site ;
  3. appliquer `tcg_scrim_win_stable_ref.sql` **juste après** (données,
     rejouable — elle peut aussi passer avant ET après).

  Site déployé **sans** les deux premières : le recalcul de solde se replie sur
  une somme paginée (sans danger) ; l'achat de booster et le retrait staff sont
  **refusés** (`503`), la recherche de joueuses aussi — jamais un achat sans
  verrou ni une recherche globale. Tant que la troisième manque, un scrim déjà
  payé qui repasse de « litige » à « terminé » (geste staff désormais) crédite
  **une** fois de plus ses pièces, sans paquet.

  **Ce que la migration de données ne rattrape pas** : les gains `scrim_win` dont
  le miroir a déjà été supprimé (litiges passés, ou exploitation de la boucle) ne
  disent plus à quel scrim ils appartiennent. Les repérer pour audit — plusieurs
  lignes orphelines rapprochées pour la même joueuse sont la signature de
  l'exploitation :

  ```sql
  SELECT e.tenant_id, e.user_id, e.source_ref, e.amount, e.created_at
  FROM public.tcg_wallet_entries e
  LEFT JOIN public.matches m ON m.id::text = e.source_ref
  WHERE e.source_kind = 'scrim_win' AND e.source_ref NOT LIKE 'scrim:%'
    AND m.id IS NULL
  ORDER BY e.user_id, e.created_at;
  ```

  Les paquets correspondants ont disparu en cascade avec leur miroir ; seules
  les pièces restent, corrigeables par `admin_grant` négatif si l'abus est avéré.
  De même, un **solde gonflé** par la course des achats a laissé des registres
  négatifs (plafonnés à 0 dans le cache) : `SELECT tenant_id, user_id,
  SUM(amount) FROM tcg_wallet_entries GROUP BY 1, 2 HAVING SUM(amount) < 0`.


- **Séries et vitrine : livrées (2026-09-15), pas encore en service.** Ordre de
  déploiement : (1) le bot apprend `tcg.set_completed` ; (2) appliquer
  `tcg_collection_set.sql` (après avoir énuméré les `CHECK` en place : la liste
  recopiée est celle des onze valeurs en production) et `tcg_showcases.sql`,
  puis `node scripts/refresh-schema-snapshot.mjs` ; (3) déployer le site. Site
  sans migration : les séries s'affichent, les récompenses sont refusées et
  retentées à chaque lecture ; la vitrine répond `500` (écran d'erreur dans
  l'espace joueuse) et la fiche
  publique n'en montre aucune. Ni l'une ni l'autre n'a été vue en navigateur
  (aucun `next dev` pendant le lot) : relire `/player/tcg` et une fiche
  `/player/[userId]` à 360 / 768 / 1280 px, clavier et lecteur d'écran.
- **Échanges × séries : tranché (2026-09-15).** Une carte reçue par échange
  (paquet `trade`) ne compte ni pour la récompense ni pour la progression d'une
  série (`readOwnedCardRows(…, { excludeTradedIn: true })`). La règle est dite
  sur la page des échanges ; le panneau des séries, lui, ne l'explique pas
  encore.
- **Échanges × vitrine : fait.** Accepter régénère les fiches des deux
  joueuses (`revalidatePlayerCard`).
- **Échanges : livrés (2026-09-15), pas encore en service.** Ordre : (1) le bot
  apprend `tcg.trade_proposed` et `tcg.trade_resolved` ; (2) énumérer les
  `CHECK` de `tcg_packs` en place, puis appliquer `tcg_card_trades.sql` et
  `node scripts/refresh-schema-snapshot.mjs` ; (3) déployer le site (le cron
  horaire part avec). Site sans migration : les routes d'échange répondent
  `500`, rien d'autre n'est touché. **Le SQL n'a été exécuté nulle part** (aucun
  Postgres pendant le lot, tests par lecture du fichier) : le jouer sur une
  base LOCALE avec deux comptes — proposer, recycler la carte offerte, accepter
  (doit annuler), double-cliquer accepter, accepter deux échanges croisés en
  parallèle. Page non vue en navigateur (360 / 768 / 1280 px, clavier, lecteur
  d'écran).
- **Échanges : décisions laissées à l'humain.** (a) Aucun équilibre de VALEUR :
  la parité porte sur le nombre de cartes, pas sur la rareté — une commune
  contre une légendaire passe si la destinataire accepte ; (b) pas de blocage
  d'une personne précise (seulement le refus + 24 h, et la désactivation
  globale) ; (c) les seuils (72 h, 5/10, 3 par jour, 14 j / 7 j) sont des
  défauts prudents, non mesurés ; (d) `drop` exclu des échanges prive une
  supportrice sans achat de tout échange.
- **Un mécanisme « ne pas figurer dans le TCG »** n'existe pas. S'il est créé,
  le brancher sur `readDrawPool` : les séries suivront d'elles-mêmes.

- **Récompense de vérification Battle.net : pas encore en service.** Ordre de
  déploiement imposé : (1) le bot apprend `reason: 'battlenet_verified'` sans
  tournoi (`services/discord-bot/tcg-events.js`, `REWARD_REASONS` +
  `buildRewardGrantedDm`, et la clé de dédoublonnage qui filtre sur
  `REWARD_REASONS`) ; (2) appliquer `tcg_battlenet_verified.sql` ; (3) déployer
  le site. Site sans migration : vérification intacte, pièces rejetées en
  `23514` et journalisées, rien de perdu — une vérification ultérieure crédite.
- **Rattrapage et incitation Battle.net : livrés (2026-09-15), pas encore
  exercés.** Le rattrapage attend un geste staff APRÈS la migration et le bot ;
  à lancer depuis chaque espace concerné (audience = l'espace). Ni la carte ni le
  toast de retour n'ont été vus en navigateur (aucun `next dev` pendant le lot) :
  relire la phrase sur `/player/profile` et l'onboarding `manage-team?welcome=1`,
  et un vrai aller-retour Blizzard sur une base LOCALE.
- **L'aide du barème (`earnHint`, `/player/tcg`) ne cite toujours pas la
  vérification** : l'incitation vit sur la carte de vérification, là où le geste
  se fait. L'y ajouter demanderait un champ de plus dans `earn`.

- **La monnaie n'a pas de pièce côté admin.** L'espace joueuse affiche désormais
  le logo en pastille devant chaque montant ; la vue d'ensemble staff, non — et
  c'est délibéré : c'est un écran de MESURE, où `num()` rend « — » pour une
  valeur non mesurable, et une pièce accolée à un tiret n'aurait aucun sens.
  Le titre de la carte « Monnaie » ne la porte pas non plus, `WidgetCard.title`
  étant typé `string` : l'élargir pour un seul appelant coûterait plus que le
  gain.
- **Aucune joueuse n'a rattaché son compte Twitch** (0 sur 58 participantes au
  2026-09-14). Toute la chaîne fonctionne, mais sans `user_twitch_links` le
  webhook répond `identity_not_linked` et personne ne reçoit rien. La carte de
  rattachement est montée sur `/player/tcg`, et depuis le 2026-09-15 elle
  **argumente** quand le drop est branché : un titre et une phrase chiffrés
  (« chaque carte récupérée te rapporte N pièces », montant rendu par l'API) et
  le bouton en évidence, plus un lien « Rattacher Twitch » accolé au barème.
  Tant que rien n'est lié seulement ; ensuite, la confirmation habituelle. Le
  flux OAuth est inchangé. Reste à MESURER l'effet (compter les
  `user_twitch_links` dans deux semaines) — aucune donnée ne le dit encore.
- **Ni overlay émis, ni habillage réglé, ni cadeau distribué** au 2026-09-14 :
  les trois attendent un geste de la régie, par construction. Un lien d'overlay
  s'émet, un cadeau se distribue — ni l'un ni l'autre ne doit être l'effet de
  bord d'un déploiement.
- **La carte « Ajuster un solde » n'affiche pas le solde AVANT correction** :
  aucune route staff ne lit le porte-monnaie d'une autre joueuse, et le solde
  résultant n'arrive qu'avec la réponse.
- **Passe UX de `/player/tcg` et `/tcg` (2026-09-15) non vérifiée en
  navigateur ni couverte en e2e.** Livré : focus porté sur la révélation et
  rendu aux paquets à la fermeture, annonce `aria-live` du tirage (nom, rareté,
  brillante, nouvelle/doublon), apparition échelonnée neutralisée par
  `prefers-reduced-motion`, écran d'erreur distinct d'une collection vide,
  squelettes de chargement, état vide qui mène au paquet en attente, cibles
  tactiles de 44 px, rareté doublée d'un repère non chromatique (losanges),
  confirmation de recyclage chiffrée (gain, solde avant → après, exemplaires
  restants). Aucun `next dev` n'a pu être lancé pendant ce lot (travail
  parallèle) : relire à 360 / 768 / 1280 px et ajouter un scénario Playwright
  « charger plus » sur une base LOCALE avant de considérer le lot clos.
- **Le `pattern` partagé `DiscordUserId` de la spec OpenAPI (`docs/openapi/components/parameters.yaml`) reste `{17,20}`.**
  L'écart est tranché pour la route TCG (paramètre déclaré en ligne, `{15,25}`,
  comme le code) ; les autres routes `by-discord` valident elles aussi par
  `discordIdSchema` (`{15,25}`) et gardent la spec plus stricte. Élargir le
  composant partagé réglerait tout d'un coup.
