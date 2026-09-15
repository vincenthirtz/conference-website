# TCG — cartes à collectionner

> Document de référence de la fonctionnalité TCG (_trading card game_) :
> pourquoi elle existe sous cette forme, ce que le schéma garantit, et ce qui
> reste à faire. Écrit d'après le code au **2026-09-14**.
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
(`/player/[userId]`, sa propre carte, sans lien vers elle-même) et la fiche
d'une équipe (`/team/[slug]`) ; et surtout **la monnaie reste gagnée, jamais
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
`booster_purchase`, `admin_grant`, `card_recycled`, `twitch_drop`
(`tcg_twitch_drop.sql`, 2026-09-13), `welcome_gift` (`tcg_welcome_gift.sql`,
2026-09-14), `supporter_welcome` (`tcg_supporter_welcome.sql`, 2026-09-14),
`checkin_streak` et `tournament_placement`
(`tcg_earn_sources_drop_streak_placement.sql`, appliquée le 2026-09-15). Côté paquets, `tcg_packs.source_kind` admet `victory`, `purchase`,
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

L'ordre des écritures diffère volontairement entre les deux gestes : l'achat
**débite avant de livrer**, le recyclage **marque avant de créditer**. Même
raison dans les deux cas — mieux vaut un état réparable (des pièces prélevées
sans paquet, une carte retirée sans crédit ; les deux sont relâchés en cas
d'échec) que de la monnaie ou un paquet créés à partir de rien.

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
| `tcg_packs`          | `id`                   | un paquet : `victory`, `purchase`, `welcome`, `drop`, `placement` ou `streak` |
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

| Route                                                | Méthodes          | Auth                                 | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/player/tcg/photo`                              | GET, POST, DELETE | joueuse                              | L'état de **ma** carte ; déposer une photo (vaut consentement, repasse en `pending`) ; retirer son accord. 5/min en POST, 10/min en DELETE.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/player/tcg/packs`                              | GET, POST         | joueuse                              | Mes paquets + solde + `boosterPrice`, `earn`, `recycleRefund` (GET, 60/min) — **paginé** : `limit` (1..200, défaut 200), `cursor`, `status=unopened\|opened`, `nextCursor` ; `unopened` compte TOUS les paquets fermés. Ouvrir un paquet et **révéler** ses cartes, faces comprises, chacune avec `isNew` (POST, 30/min).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/api/player/tcg/collection`                         | GET               | joueuse                              | Ma collection, déduite des paquets ouverts, recyclées exclues, agrégée par sujet, les plus rares d'abord. Chaque carte porte `recyclable` : le couple `{ packId, position }` d'un exemplaire à recycler, ou `null` dès qu'il n'y en a qu'un — la route de recyclage refuse le dernier, et un bouton qu'elle rejetterait promettrait un geste impossible. L'exemplaire désigné est le **moins précieux** (plus basse rareté, non brillant à rareté égale) : la carte s'affiche avec sa MEILLEURE rareté, et recycler « ce doublon » ne doit jamais coûter la meilleure des copies. **Paginée** : `limit` (1..200), `cursor`, `nextCursor` ; sans paramètre, tout comme avant. 60/min.                                                                                                                                       |
| `/api/player/tcg/booster`                            | POST              | joueuse                              | Acheter un paquet **fermé** avec ses pièces. 20/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/api/player/tcg/recycle`                            | POST              | joueuse                              | Recycler un **doublon** contre `RECYCLE_REFUND_COINS`. 30/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/player/tcg/wallet`                             | GET               | joueuse                              | « D'où viennent mes pièces ? » — 50 derniers mouvements, `shownTotal`, `truncated`. 60/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/tcg/photos`                              | GET, PATCH        | staff, permission `manage_tcg`       | La file de relecture (`pending`, la plus ancienne d'abord) ; approuver ou refuser. Chaque élément porte `displayName` et `email`, résolus en un appel par la RPC `fetchAdminUserProfiles` — un **enrichissement, jamais une condition** : une résolution en échec rend `null` et la file reste servie, parce qu'une relectrice doit d'abord voir l'image. Journalisé. 60/min en GET, 30/min en PATCH. |
| `/api/admin/tcg/overview`                            | GET               | staff, permission `manage_tcg`       | État de l'économie en un appel : paquets, pièces, cartes par rareté, photos, sujets les plus distribués. Tout est agrégé côté serveur — aucune ligne de détail ne sort. `null` ≠ `0` : une clé en échec vaut « pas mesurable », jamais « mesuré et vide ». 30/min, `Cache-Control: private, max-age=30`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/api/bot/v1/players/by-discord/{discordUserId}/tcg` | GET               | bot, `x-api-key` par tenant          | Solde, paquets en attente et **résumé** de collection pour Discord. `discordUserId` : 15 à 25 chiffres (la spec est alignée sur le code, des identifiants courts existant chez les comptes anciens). 60/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/webhooks/twitch/tcg-drop`                      | POST              | signature HMAC Twitch EventSub       | Webhook entrant : créditer une spectatrice qui échange des points de chaîne. Corps lu brut (`bodyParser: false`), signature vérifiée **avant** tout parsing, fenêtre anti-rejeu de 10 min, tenant résolu par la chaîne et non par `x-tenant-id`. **En service** depuis le 2026-09-13. Une `revocation` est lue et non seulement acquittée : son `status` dit laquelle des trois causes s'applique. Crédite **pièces + un paquet `drop`** (pièces d'abord) ; `packGranted` dans la réponse, `pack: { id } \| null` dans `tcg.drop_granted`. 600/min.                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/tcg/overlay-token`                       | GET, POST, DELETE | staff, permission `manage_tcg`       | Le lien de la source navigateur OBS. Un seul jeton actif par espace : émettre révoque le précédent. Journalisé **sans** le jeton. 30/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/api/admin/tcg/overlay-theme`                       | GET, PUT          | staff, permission `manage_tcg`       | L'habillage de l'overlay (couleur, position, deux formulations, image ou vidéo). **Patch partiel** ; `null` = revenir au défaut. Média validé par **magic bytes** avant dépôt en bucket public. 30/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/api/admin/tcg/welcome-gift`                        | GET, POST         | staff, permission `manage_tcg`       | Simuler puis distribuer le cadeau d'accueil de l'édition en cours. `GET` n'écrit rien. `POST` honore `Idempotency-Key`. Journalisé. 20/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/tcg/grant`                               | POST              | staff, permission `manage_tcg`       | Corriger le solde d'une joueuse (`admin_grant`, crédit ou retrait, valeur absolue ≤ 10 000, motif obligatoire). **Une correction tracée, pas une vente.** Registre d'abord, `source_ref` = `idempotencyKey` : l'unicité du registre porte l'idempotence, un rejeu rend `replayed: true` sans double crédit. Un retrait ne passe jamais sous zéro (`409 INSUFFICIENT_BALANCE`) : réservation conditionnelle du cache, disponible = minimum du cache et du registre. Motif journalisé `tcg_admin_grant` (le registre n'a pas de colonne pour lui). 30/min. |
| `/api/admin/tcg/players`                             | GET               | staff, permission `manage_tcg`       | Recherche de comptes pour la carte « Ajuster un solde » (RPC `admin_search_users`, 20 résultats), sans exiger `manage_staff`. |
| `/api/player/tcg/welcome-gift`                       | GET, POST         | joueuse (**`withSubjectRoute`**)     | `GET` : « Ai-je reçu un cadeau ? » — `{ gift: { coins, receivedAt } \| null, supporterClaimable }`, les DEUX accueils confondus (`welcome_gift` et `supporter_welcome`) ; `supporterClaimable` vient de `grantSupporterWelcome({ dryRun: true })`, donc des conditions EXACTES du POST — proposer un bouton que le serveur refuserait serait pire que ne rien proposer. `POST` : réclamer le cadeau **supportrice**, une fois par compte, `{ status, coins, packGranted }` — `packGranted: false` DIT l'écriture partielle au lieu de la masquer. Seule route `tcg/` à honorer `?as=`, mais **sans `allowActAs`** : le `POST` est donc refusé en inspection, un cadeau réclamé ne se rendant pas. 60/min en GET, 6/min en POST. |
| `/api/overlay/tcg/{token}`                           | GET               | **public**, porté par le jeton       | Le flux d'annonces d'une source navigateur OBS, plus l'habillage. Réduit au déjà-public : pseudo Twitch et origine d'événement, jamais un nom de compte ni une photo. `s-maxage=5`. 120/min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Quelques conventions transverses :

- **Deux routes hors `tcg/` écrivent au TCG en effet de bord** :
  `POST /api/admin/tournament/[id]/finalize` (palmarès, compte rendu additif
  `tcg_placement_rewards`) et `redeemCheckinToken`, derrière
  `POST /api/checkin/[token]` et `POST /api/bot/v1/matches/[matchId]/checkin`
  (série de check-ins, réponse inchangée). Toutes deux annoncent le gain par
  `tcg.reward_granted` (`utils/tcg/announceReward.ts`), un événement par
  joueuse créditée, jamais sur un rejeu — le bot en fait un DM.

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
- **Le `pattern` partagé `DiscordUserId` d'`openapi.yaml` reste `{17,20}`.**
  L'écart est tranché pour la route TCG (paramètre déclaré en ligne, `{15,25}`,
  comme le code) ; les autres routes `by-discord` valident elles aussi par
  `discordIdSchema` (`{15,25}`) et gardent la spec plus stricte. Élargir le
  composant partagé réglerait tout d'un coup.
