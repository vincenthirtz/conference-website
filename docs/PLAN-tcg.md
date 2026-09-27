# Plan — TCG (cartes à collectionner)

> Établi le **2026-09-27**, à partir d'une mesure de la base de production faite
> le jour même. Périmètre : `utils/tcg/*` (51 modules), `pages/api/player/tcg/*`,
> `pages/api/admin/tcg/*`, le webhook `webhooks/twitch/tcg-drop`, la route bot
> `by-discord/[discordUserId]/tcg`, les composants `components/tcg/*` et les 29
> migrations `tcg_*`.
>
> Référence de la fonctionnalité : [TCG.md](./TCG.md) — ce qu'elle est, ce que le
> schéma garantit, et les trois garde-fous de consentement. **Ce plan ne les
> rediscute pas** : ils encadrent chaque lot ci-dessous.
>
> Ne pas confondre avec la « passe 10 lots » du 2026-09-20, consignée dans
> [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) (Q028–Q035) : c'était une
> passe QUALITÉ, close. Celui-ci est un plan PRODUIT.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) ·
> M (quelques heures) · L (chantier).

---

## 1. État des lieux (prod, 2026-09-27)

| Rail | Mesure | Valeur |
|---|---|---|
| Audience | porte-monnaie ouverts | **63** |
| Économie | pièces gagnées (cumul) | **10 805** |
| Économie | pièces **dépensées** | **0** |
| Économie | comptes pouvant s'offrir un booster (300) | 12 — **aucun ne l'a fait** |
| Boucle | paquets distribués | 100 |
| Boucle | paquets **jamais ouverts** | **53** |
| Boucle | comptes avec au moins un paquet en attente | **40 sur 63** |
| Photos | cartes de joueuse avec photo | **15** |
| Vitrines | vitrines configurées | 2 |
| Échanges | réglages / propositions | **0 / 0** |
| Fan art | œuvres soumises | **0** |
| Twitch | comptes rattachés / crédits versés | **18 / 0** |
| Vie | dernier gain / dernière ouverture | 25/09 · 26/09 |

**Répartition des gains**, qui dit à elle seule où va le jeu :

| Source | n | Pièces |
|---|---|---|
| `welcome_gift` | 58 | 5 800 |
| `match_win` | 39 | 3 900 |
| `match_prediction` | 15 | 375 |
| `battlenet_verified` | 4 | 400 |
| `supporter_welcome` | 2 | 200 |
| `staff_welcome` | 1 | 100 |
| `card_recycled` | 1 | 30 |

`checkin_streak`, `placement`, `collection_set` et `twitch_drop` : **jamais
versés, pas une fois**. Ces quatre voies figurent au barème affiché aux joueuses.

### Ce que ces chiffres disent

**Le problème n'est pas la distribution, c'est le retour.** Tout ce qui devait
être produit l'est : 58 comptes accueillis, 39 victoires récompensées, 100
paquets attribués. Mais **plus d'un paquet sur deux n'est jamais ouvert**, et
sur 63 personnes qui possèdent des pièces, **aucune n'en a dépensé une seule**.

Deux ruptures distinctes, qui appellent deux réponses distinctes :

1. **Une moitié des paquets n'est annoncée à personne.** La rédaction initiale
   de ce plan disait « rien ne ramène personne ». C'ÉTAIT FAUX, et la
   vérification l'a montré avant qu'un lot ne parte dessus : `tcg.pack_granted`
   existe, 22 événements sont partis, tous délivrés, avec un identifiant
   Discord. Le partage par origine est sans appel :

   | origine  | paquets | jamais ouverts |
   |----------|---------|----------------|
   | victoire | 39      | 16 (**41 %**)  | ← annoncée en DM
   | accueil  | 61      | 37 (**61 %**)  | ← silencieuse

   Vingt points d'écart sur la seule différence d'être prévenue. L'annonce
   n'était pas absente : elle vivait chez un seul producteur, et le cadeau
   d'accueil — la voie la PLUS nombreuse — ne l'appelait pas.
2. **Il n'y a rien à faire de ce qu'on possède.** Le seul débit existant est le
   booster à 300 pièces, c'est-à-dire « plus de la même chose ». Douze personnes
   peuvent se l'offrir ; aucune n'en a envie. Une monnaie qu'on accumule sans
   jamais la dépenser cesse d'être une monnaie : c'est un compteur.

Et trois briques complètes dorment : les **échanges** (déployés, zéro réglage —
un opt-in que personne n'a coché), le **fan art** (dépôt et modération montés,
zéro soumission) et le **drop Twitch** (18 comptes rattachés, la chaîne attend
deux gestes manuels côté Twitch).

**Aucun lot de ce plan n'ajoute une source de gain.** Le robinet coule déjà bien
au-delà de ce qui se consomme.

---

## 2. Séquencement

| Lot | Titre | Impact | Effort | Pourquoi à ce rang |
|---|---|---|---|---|
| T1 | Ramener la joueuse à son paquet | 🟥 | S | ✅ **livré le 2026-09-27** |
| T2 | Donner une raison de dépenser | 🟥 | L | ✅ **livré le 2026-09-27** |
| T3 | Activer les échanges | 🟥 | M | ✅ **livré le 2026-09-27** (activation = opt-in joueuse) |
| T4 | Finir la chaîne du drop Twitch | 🟧 | S | 18 personnes rattachées attendent, deux gestes manquent |
| T5 | Les quatre voies qui n'ont jamais payé | 🟧 | M | ✅ **instruit le 2026-09-27** — aucune n'est cassée |
| T6 | Faire monter l'opt-in photo, sans le forcer | 🟧 | M | ✅ **livré le 2026-09-27** |
| T7 | Amorcer le fan art | 🟧 | S | zéro soumission n'est pas une panne, c'est un silence |
| T8 | Un set d'événement | 🟩 | M | le premier motif de revenir qui ne dépende pas d'une victoire |
| T9 | « Ne pas figurer dans le TCG » | 🟧 | M | ✅ **livré le 2026-09-27** |
| T10 | Vérifier ce qui n'a jamais été vu | 🟧 | M | UX non relue en navigateur, 12 figurines, garde des types de carte |

---

## T1 · Ramener la joueuse à son paquet — ✅ LIVRÉ (2026-09-27)

**Le constat, après vérification — et il n'était pas celui qu'on croyait.** Ce
lot devait « ajouter une notification ». Elle existait : `tcg.pack_granted`
part depuis `grantVictoryRewards`, 22 événements sont sortis, tous délivrés,
avec un identifiant Discord. Partir sur la rédaction initiale aurait produit un
doublon de DM.

Ce qui manquait n'était pas l'annonce, c'étaient ses APPELANTS. Elle vivait
chez un seul producteur — la victoire — et le cadeau d'accueil, qui pose un
paquet à chaque compte créé, n'y touchait pas. 61 paquets d'accueil, 37 jamais
ouverts, contre 41 % pour les victoires annoncées.

**Ce qui a été fait.**
- `utils/tcg/announcePackGranted.ts` : l'annonce sort de `grantVictoryRewards`
  et devient le passage unique. Une annonce qui vit chez un producteur est une
  annonce que le producteur suivant oublie, sans que rien ne le signale.
- Les deux voies d'accueil (`grantWelcomeGift`, `grantSelfWelcome`) l'appellent,
  et rendent désormais l'identifiant du paquet créé — sans match, le couple
  (joueuse, match) ne fait pas une clé de déduplication.
- Le DM du bot distingue le cadeau de la victoire : « ta victoire t'a rapporté »
  est faux pour un accueil, et absurde pour une supportrice qui ne joue pas. Un
  `reason` absent retombe sur `victory`, pour les événements restés en outbox
  pendant le déploiement.

**Les deux bords sont tenus, et tous deux sont silencieux en production :** on
n'annonce que ce qui a été écrit (le 2026-09-14, 58 paquets ont été rejetés
pendant que les pièces étaient créditées — annoncer là enverrait vers une page
vide), et un rejeu du cadeau ne renotifie personne.

**Ce qui reste à mesurer.** Le taux d'ouverture des paquets d'accueil, dans deux
semaines. C'est la seule chose qui dira si les 20 points d'écart tenaient bien à
l'annonce.

## T2 · Donner une raison de dépenser — ✅ LIVRÉ (2026-09-27)

**Le constat.** 10 805 pièces gagnées, **zéro dépensée**. Le booster à 300
pièces était le seul débit : payer pour cinq cartes de plus quand un paquet non
ouvert attend déjà n'a aucun intérêt, et douze personnes qui en avaient les
moyens l'avaient compris avant nous.

**Deux débits, et ils ne vendent pas la même chose.**

**La forge** — trois doublons d'une même rareté plus 150 pièces contre UNE carte
de joueuse du palier au-dessus, *que l'on ne possède pas*. Elle relie les deux
manques : les doublons s'entassaient (le recyclage à 30 pièces avait servi UNE
fois en tout) pendant que les collections stagnaient (la meilleure réunissait 3
équipes sur 10, personne n'avait complété une série).

Le barème se défend dans les deux sens, et un test le fige : on abandonne 3
doublons (90 pièces au recyclage) et on en paie 150, soit 240 contre 300 pour un
booster — moins cher, moins de cartes, mais une certitude que le hasard n'offre
pas. Défavorable au volume, favorable à la collection.

Cartes de JOUEUSE seulement : une map (`common`) et une mascotte (`rare`) ont
une rareté fixe, « un palier au-dessus » n'y veut rien dire.

**Les habillages de vitrine** — un cadre, un fond, sur les trois cartes de la
fiche publique. Deux vitrines seulement étaient configurées sur 63 comptes :
rien n'y récompensait l'effort. `unlocked_cosmetics` (acheté) est séparé de
`frame`/`background` (posé), pour que changer d'avis ne coûte rien — si essayer
se payait, personne n'essaierait, et le débit n'existerait que sur le papier.

**Tout ce qui touche à la monnaie est TRANSACTIONNEL.** `tcg_forge_card` et
`tcg_buy_cosmetic` font leurs écritures en une fois. Ce n'est pas de la
prudence abstraite : `booster.ts` débitait puis livrait côté application, et un
504 PostgREST entre les deux — mode d'échec constaté ici, ~1,7 % — faisait
perdre 300 pièces pour rien. La forge et l'achat suivent le chemin que ce
correctif avait ouvert.

**Les refus sont doublés, exprès.** Une fois dans le module pur (message utile,
et surtout aucune écriture tentée : `pool_exhausted` refuse AVANT la
transaction, sinon on prélèverait et on détruirait trois cartes pour ne rien
rendre), une fois dans la transaction (l'invariant tient même si une autre
requête est passée entre la lecture et l'écriture).

**Ce qui ne bouge pas.** La monnaie se gagne, elle ne s'achète pas : aucun de
ces débits n'ouvre une voie en euros, ni directement ni par un intermédiaire.
C'est ce qui tient la fonctionnalité hors du régime des boîtes à butin.

**Ce qui reste à mesurer.** Le premier coin dépensé, et le nombre de forges par
semaine. Si le compteur reste à zéro dans quinze jours, le problème n'était pas
l'absence de débit — et T3 passe devant.

## T3 · Activer les échanges — ✅ LIVRÉ (2026-09-27)

**Le constat, corrigé au passage.** Ce lot annonçait « activer pour le
tenant ». `tcg_trade_settings` est en réalité une ligne PAR JOUEUSE
(`accepts_proposals`, faux par défaut) : zéro ligne veut dire que **personne
n'a coché son propre opt-in**, pas qu'un réglage staff manque. Il n'y a rien à
activer de notre côté — ce qu'il fallait, c'est rendre l'opt-in tenable.

**Les deux arbitrages qui demandaient du code sont livrés.**

**L'écart de rareté, dit avant d'accepter.** La parité porte sur le NOMBRE de
cartes, jamais sur leur valeur : une commune contre une légendaire passe si la
destinataire accepte. On garde cette règle — arbitrer la valeur à sa place
serait décider pour elle — mais « elle accepte » n'a de sens que si elle voit.
Chaque carte affichait déjà sa rareté ; avec cinq cartes de chaque côté,
comparer est un travail qu'on ne fait pas. `utils/tcg/tradeBalance.ts` en fait
la somme et rend un verdict en un mot, surligné quand l'échange est à son
désavantage. Informatif, jamais bloquant.

Le barème est ORDINAL, pas monétaire : on additionne des rangs de rareté, pas
des « valeurs ». Inventer une monnaie de la rareté créerait un prix, donc une
spéculation — ce que ce plan refuse explicitement.

**« Pas avec elle ».** Les échanges n'offraient que deux réponses à une
sollicitation non désirée : refuser (et subir 24 h de répit avant la suivante),
ou couper les échanges POUR TOUT LE MONDE. Dans un milieu où les joueuses
subissent du harcèlement, devoir se couper de tous pour se protéger d'une
seule, c'est la faire gagner.

`tcg_trade_blocks` est ORIENTÉ (elle ne peut plus me solliciter, l'inverse reste
ouvert) et **la personne bloquée n'apprend rien** : sa proposition reçoit
`recipient_unavailable`, indistinguable d'une destinataire qui n'accepte pas les
échanges. Un refus qui se distingue est un refus qui informe, et qui invite la
représaille ailleurs. Aucun plafond sur le nombre de blocages : on ne rationne
pas une protection.

Le refus vit dans `tcg_propose_trade`, avec tous les autres invariants de
l'échange — une garde de sécurité ne doit pas être la seule à dépendre du chemin
emprunté pour l'atteindre. La fonction a été patchée depuis sa définition RÉELLE
(`pg_get_functiondef`), pas depuis une copie recollée : 250 lignes de
consentements et de verrous ne se retranscrivent pas de mémoire.

**Les deux autres arbitrages, inchangés et pour cause.**
- Les seuils (72 h, 5/10, 3 par jour, 14 j / 7 j) restent des défauts prudents,
  à relire après un mois d'usage réel — il n'y en a eu aucun.
- `drop` reste exclu des échanges : la rouvrir n'a de sens qu'une fois T4
  livré, sinon la règle protège un vide.

**Ce qui reste à mesurer.** Le premier opt-in coché, puis la première
proposition. Si personne n'active encore, le frein n'était pas le risque
d'insistance — et c'est l'entrée du parcours qu'il faut regarder, pas ses
garde-fous.

## T4 · Finir la chaîne du drop Twitch — 🟧 / S

**Le constat.** 18 comptes ont rattaché leur Twitch — la carte argumentée du
2026-09-15 a marché (elle en comptait **0** au 2026-09-14). Et `twitch_drop`
n'apparaît dans **aucun** gain : pas un crédit versé.

**Ce qu'on fait.** Les deux gestes qui restent sont MANUELS par construction, et
ne sont pas du code : connecter la chaîne (OAuth broadcaster) et créer la
récompense de points de chaîne dans la console Twitch. Les faire, puis regarder
le premier direct.

**Ce qu'on ne fait pas.** Automatiser ces deux gestes. Ils engagent le compte
Twitch de l'association ; ils se font une fois, à la main, en connaissance de
cause.

**Vérification.** Un crédit `twitch_drop` en base après le prochain direct. Tant
qu'il n'y en a pas, la voie reste affichée au barème sans rien verser — ce que
T5 traite.

---

## T5 · Les quatre voies qui n'ont jamais payé — ✅ INSTRUIT (2026-09-27)

**Le constat de départ.** `checkin_streak`, `placement`, `collection_set` et
`twitch_drop` figurent au barème montré aux joueuses et n'ont jamais écrit une
ligne. La rédaction initiale en concluait qu'« un barème qui promet ce qu'il ne
verse pas abîme la confiance ». **Vérification faite, aucune des quatre n'est
cassée** — et c'est une conclusion différente, qui change ce qu'il y a à faire.

| voie | verdict | ce que dit la base |
|---|---|---|
| `checkin_streak` | **inatteignable** | seuil à 5 check-ins consécutifs ; la meilleure équipe en compte **3**. Câblé depuis `utils/checkin.ts`. |
| `collection_set` | **inatteignable** | la meilleure collection réunit **3 équipes sur 10** et **3 maps sur 22**. Dépend du volume d'ouverture, donc de T1 et T2. |
| `placement` | **en attente d'un geste** | 2 tournois clos, et `final_rankings` **vide** : la finalisation n'a jamais été lancée. Le manque est en AMONT de la récompense. |
| `twitch_drop` | **en attente d'un geste** | cf. T4 — deux actions manuelles dans la console Twitch. |

**Ce qu'il y a à faire, du coup, et ce n'est pas ce qui était écrit.** Rien à
réparer, rien à retirer du barème : ces voies paieront. Ce qui manque, c'est que
le barème dise **où on en est** plutôt que de promettre à plat — « 3 check-ins
sur 5 » se lit comme un objectif, « série de check-ins : 50 pièces » se lit
comme une promesse non tenue. C'est un changement d'affichage sur
`/player/tcg`, à faire quand une des deux voies inatteignables s'approchera.

**Ce que ce lot a coûté, et pourquoi il valait la peine.** Une journée de
requêtes, zéro ligne de code. Sans lui, on aurait « réparé » quatre choses qui
fonctionnent.

## T6 · Faire monter l'opt-in photo, sans le forcer — ✅ LIVRÉ (2026-09-27)

**La mesure d'abord, et elle déplace le problème.** 15 photos sur 63 comptes —
et **les 15 sont approuvées**. Zéro refus, zéro en attente, un seul retrait. La
modération n'est donc pas le goulot : le parcours perd les gens AVANT le dépôt.

**Les trois raisons supposées, vérifiées une par une.** La rédaction initiale en
listait trois ; la troisième était fausse.

| supposé | vérifié |
|---|---|
| le point d'entrée est discret | **pire que ça** : le dépôt vit sur `/player/profile`, jamais sur `/player/tcg`. Qui passe son temps dans l'espace collection n'a aucun chemin vers lui. |
| aucun aperçu avant dépôt | **vrai** : choisir un fichier l'envoyait dans la foulée. On découvrait le cadrage APRÈS, sur une photo déjà en modération. |
| le retrait n'est dit nulle part | **faux** : `consentRevocable` figure dans le bloc de consentement, au-dessus du bouton, avant tout dépôt. Rien à faire. |

**Ce qui a été fait.**

*L'aperçu rend la VRAIE carte.* Pas une vignette : `TcgCard`, avec la photo
choisie en `data:` (que `next/image` sert sans optimiseur). Ce qui inquiète
n'est pas la photo, c'est ce que le cadrage en fait — une imitation qui mentirait
sur le recadrage serait pire que rien. Rien ne part avant un second geste, et un
refus du serveur laisse la photo à l'écran plutôt que de renvoyer au sélecteur.

*L'invitation est posée là où sont les joueuses*, sur `/player/tcg`, avec un
lien ancré vers le dépôt.

**Ce qui distingue une invitation d'une relance**, et qui décide de tout le
composant : elle est passive (un bloc sur une page qu'on a ouverte, jamais un DM
ni une notification) ; elle disparaît dès qu'une photo existe ; elle disparaît
aussi sur « plus tard », et ne revient pas. `shouldInvite` se tait sur quatre
états, chacun étant un cas où l'invitation deviendrait une relance — photo
déposée, **en attente** (elle a fait le geste), **refusée** (relancer quelqu'un
sur un échec de modération), ou aucune carte possible.

Le refus est gardé dans le navigateur : le mettre en base coûterait une colonne
et une route pour un réglage d'écran, et le pire cas est un bloc passif revu une
fois sur un autre appareil.

**Ce qui reste à mesurer.** La courbe des dépôts, **et le nombre de retraits**.
Si les retraits montent avec les dépôts, c'est que l'invitation a convaincu des
gens qu'elle n'aurait pas dû convaincre — et c'est elle qu'il faudra retirer,
pas ajuster.

## T7 · Amorcer le fan art — 🟧 / S

**Le constat.** Dépôt et modération montés des deux côtés, 23 tests unitaires,
**zéro œuvre soumise**. Le pipeline n'a donc jamais tourné en conditions réelles.

**Ce qu'on fait.** Un appel à œuvres (Discord + actualité), avec le cadre dit
d'avance : ce qui est accepté, ce qui ne l'est pas, ce que devient l'œuvre, et
qui est crédité. Objectif : une première soumission, pour éprouver la chaîne
complète jusqu'au tirage d'une carte de fan art.

**Ce qu'on ne fait pas.** Ouvrir le fan art à l'IA générative — la règle est déjà
posée pour les visuels du site et vaut ici (cf. mémoire projet « pas d'images
IA »). À écrire dans l'appel, pas à sous-entendre.

---

## T8 · Un set d'événement — 🟩 / M

**Le constat.** Toutes les voies de gain sont adossées à la compétition
(victoire, pronostic, palmarès). Entre deux journées, il ne se passe rien — et
la Cup a des semaines creuses.

**Ce qu'on fait.** Un set limité dans le temps, adossé à un événement ponctuel —
le premier étant l'event Halloween en inscription individuelle. Le mécanisme des
séries (`collection_set`) existe déjà ; ce lot l'utilise, il ne le réinvente pas.

**Dépendance.** Un set d'événement introduit très probablement un **type de carte**
nouveau, et ajouter un type touche une dizaine d'endroits dont les oublis sont
SILENCIEUX (la carte devient invisible, ou se déguise en un autre type). Ce lot
est donc l'occasion d'écrire le garde-fou qui manque — un test qui énumère les
points de contact et échoue quand un type n'est pas traité partout — plutôt que
de refaire la liste de mémoire.

---

## T9 · « Ne pas figurer dans le TCG » — ✅ LIVRÉ (2026-09-27)

Le quatrième garde-fou de consentement. Le détail vit désormais dans
[TCG.md §2.4 bis](./TCG.md), à côté des trois autres — c'est là qu'on le
cherchera, pas dans un plan.

**Ce que ce lot a tranché**, et que le plan laissait explicitement à l'humain :
le sort des cartes DÉJÀ tirées. Elles sont **anonymisées**, pas supprimées. Les
laisser nominatives n'aurait pas été un retrait mais un arrêt des ventes ; les
supprimer aurait détruit la collection de tiers, parfois une carte obtenue par
échange, c'est-à-dire payée. On ne répare pas un défaut de consentement en en
créant un autre.

**Ce que la vérification préalable a confirmé**, contrairement aux trois lots
précédents : les deux points de passage annoncés par le plan en SONT bien. Le
vivier n'a qu'une définition (`poolQueries`, partagée par le contenu et les
tailles) et la face d'une joueuse n'a qu'un lecteur (`readPlayerFaces`, huit
appelants). C'est ce qui rend le retrait complet réalisable sans toucher à dix
endroits.

**Deux choix de robustesse, chacun contre un échec silencieux :**
- la lecture des retraits est *fail-closed* — un vivier illisible est rendu en
  erreur, jamais comme un vivier complet ;
- l'anonymat ne dépend d'aucun drapeau : `readPlayerFaces` rend les champs déjà
  vidés, et un appelant qui ignore `withdrawn` rend quand même une carte anonyme.

**Ce qui reste à mesurer.** Rien, et c'est normal : un garde-fou de consentement
ne se juge pas à son taux d'usage. S'il ne sert jamais, tant mieux.

## T10 · Vérifier ce qui n'a jamais été vu — 🟧 / M

Trois dettes de vérification, réunies parce qu'elles ont la même nature : du
travail livré que personne n'a regardé tourner.

1. **La passe UX de `/player/tcg` et `/tcg` (2026-09-15)** — focus, `aria-live`
   du tirage, `prefers-reduced-motion`, squelettes, cibles de 44 px, repère non
   chromatique de rareté, confirmation de recyclage chiffrée. Livrée sans
   qu'aucun `next dev` ait pu être lancé. À relire à 360 / 768 / 1280 px, et à
   couvrir d'un scénario Playwright « charger plus » sur base locale.
2. **Douze héros sans figurine voxel** (Domina, D.Mon, Anran, Emre, Freja,
   Shion, Sierra, Doctrine, Fika, Juno, Mizuki, Wuyang) : ils retombent sur la
   figurine de leur rôle, ce qui est un repli correct — mais le repli est
   silencieux, et c'est ce silence qui avait masqué le bogue **Soldier: 76**.
3. **Un tableau de bord d'engagement** : les chiffres de la section 1 ont été
   tirés à la main, en SQL, un par un. Tant qu'il faut ouvrir un client SQL pour
   savoir si le jeu vit, personne ne le saura — et un plan comme celui-ci se
   refera de mémoire dans six mois.

---

## 3. Ce qu'on ne fait pas, et pourquoi

- **Aucune nouvelle source de gain.** 10 805 pièces produites, 0 consommée :
  ajouter un robinet à un évier bouché.
- **Aucune voie d'achat en euros**, ni monnaie, ni paquet, ni cosmétique. C'est
  la règle qui tient le TCG hors du régime des boîtes à butin, et elle ne se
  négocie pas lot par lot.
- **Aucun annuaire public des collections.** La page reste `noindex` ; les deux
  seules apparitions publiques d'une carte restent la fiche joueuse (sa propre
  carte) et la fiche équipe, la vitrine restant en opt-in.
- **Aucun rétro-crédit** des voies qui n'ont pas payé : le registre est un
  journal en ajout seul, et son intégrité vaut mieux qu'un rattrapage.

## 4. Vérification

Les constats de la section 1 se refont avec `npm run tcg:audit` (sept contrôles
d'intégrité, aucune écriture) et les requêtes de comptage citées. **Refaire la
mesure avant d'entamer un lot** : ce plan décrit l'état du 2026-09-27, et la
leçon de TCG.md §7 est qu'une liste de travaux qui décrit un passé révolu coûte
plus qu'une liste vide.

Cette leçon s'est vérifiée sur ce plan même, dès son premier lot. T1 devait
ajouter une notification qui existait déjà, T5 réparer quatre voies dont aucune
n'est cassée. Les deux se sont corrigés en une requête. **Un lot commence par
une mesure, pas par le paragraphe qui le décrit** — y compris quand ce
paragraphe vient d'être écrit.
