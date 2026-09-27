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

1. **Rien ne ramène personne.** Un paquet est attribué en silence, au moment
   d'une victoire, pendant que la joueuse est ailleurs. Elle l'apprend si elle
   repasse sur `/player/tcg` — et 40 comptes sur 63 ne l'ont pas fait.
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
| T1 | Ramener la joueuse à son paquet | 🟥 | S | 53 paquets en attente, une notification les débloque |
| T2 | Donner une raison de dépenser | 🟥 | L | 0 pièce dépensée sur 10 805 |
| T3 | Activer les échanges | 🟥 | M | tout est construit, il manque un réglage et quatre arbitrages |
| T4 | Finir la chaîne du drop Twitch | 🟧 | S | 18 personnes rattachées attendent, deux gestes manquent |
| T5 | Les quatre voies qui n'ont jamais payé | 🟧 | M | le barème promet ce qu'il ne verse pas |
| T6 | Faire monter l'opt-in photo, sans le forcer | 🟧 | M | 15 photos sur 63 comptes |
| T7 | Amorcer le fan art | 🟧 | S | zéro soumission n'est pas une panne, c'est un silence |
| T8 | Un set d'événement | 🟩 | M | le premier motif de revenir qui ne dépende pas d'une victoire |
| T9 | « Ne pas figurer dans le TCG » | 🟧 | M | le consentement qui manque encore |
| T10 | Vérifier ce qui n'a jamais été vu | 🟧 | M | UX non relue en navigateur, 12 figurines, garde des types de carte |

---

## T1 · Ramener la joueuse à son paquet — 🟥 / S

**Le constat.** 53 paquets sur 100 n'ont jamais été ouverts, répartis sur 40
comptes. Ce n'est pas du désintérêt : personne n'a été prévenu. Le paquet est
créé par `applyMatchRatingIncremental`, au moment où le score est saisi, souvent
plusieurs heures après le match et toujours sans que la joueuse soit devant son
écran.

**Ce qu'on fait.** Émettre un événement à l'attribution d'un paquet, et le faire
sortir par les canaux qui existent déjà (outbox → DM Discord / push web, avec
les préférences par canal du système de notifications). Un message par paquet,
pas de relance : celle-ci viendrait au digest (voir plus bas).

**Ce qu'on ne fait pas.** Pas de mail. Un paquet n'est pas une information
urgente, et un canal de plus se paie en désinscriptions sur tous les autres.

**Vérification.** Compter les ouvertures dans les 48 h suivant l'attribution,
avant et après. Si le ratio ne bouge pas, le problème n'était pas la
notification — et les lots suivants s'en trouvent réordonnés.

---

## T2 · Donner une raison de dépenser — 🟥 / L

**Le constat.** 10 805 pièces gagnées, **zéro dépensée**. Le seul débit est le
booster à 300 pièces : payer pour cinq cartes de plus quand on a déjà un paquet
non ouvert en attente n'a aucun sens, et douze personnes qui en ont les moyens
l'ont compris avant nous.

**Ce qu'on fait.** Deux débits qui portent une intention, et non « plus de la
même chose » :

1. **La forge** — convertir des doublons en une carte d'une rareté supérieure,
   à un taux qui reste défavorable (on ne fabrique pas une légendaire à bon
   compte). C'est le débit qui répond à la vraie frustration : les doublons
   s'accumulent et le recyclage (30 pièces, utilisé **une fois**) ne les rend
   pas désirables.
2. **Les cosmétiques de vitrine** — cadre, fond, ordre mis en avant sur
   `tcg_showcases`. Deux vitrines configurées aujourd'hui : c'est peu, et rien
   n'y récompense l'effort.

**Contrainte non négociable.** La monnaie **se gagne, elle ne s'achète pas**
(TCG.md §4). Aucun de ces débits n'ouvre une voie d'achat en euros, ni
directement ni par un intermédiaire — c'est ce qui tient la fonctionnalité hors
du régime des boîtes à butin.

**Ce qu'on ne fait pas.** Pas de marché entre joueuses avec prix en pièces :
cela ferait de la monnaie un objet de spéculation, et de la rareté un prix.

---

## T3 · Activer les échanges — 🟥 / M

**Le constat.** Tables, fonctions à cinq types de sujet, page, règles, 72 h de
péremption, plafonds : tout est déployé depuis le 2026-09-15. `tcg_trade_settings`
compte **zéro ligne**, `tcg_trades` zéro. Ce n'est pas une panne, c'est un opt-in
que personne n'a coché — et il faut le dire au prochain passage plutôt que de le
rediagnostiquer.

**Ce qu'on fait.** (a) Activer pour le tenant. (b) Trancher les quatre décisions
que TCG.md §7 laisse explicitement à l'humain :

- **l'équilibre de valeur** : la parité porte sur le NOMBRE de cartes, pas sur
  la rareté. Une commune contre une légendaire passe si la destinataire accepte.
  À garder tel quel, mais à AFFICHER : la destinataire doit voir l'écart de
  rareté avant d'accepter, sinon le consentement n'en est pas un ;
- **le blocage d'une personne** : aujourd'hui seulement refus + 24 h, ou
  désactivation globale. Entre les deux, il manque « pas avec elle ». Dans un
  milieu où le harcèlement existe, c'est le manque le plus sérieux ;
- **les seuils** (72 h, 5/10, 3 par jour, 14 j / 7 j) : défauts prudents, jamais
  mesurés. À laisser tels quels et à relire après un mois d'usage réel ;
- **`drop` exclu des échanges** : prive une supportrice sans achat de tout
  échange. À rouvrir une fois T4 livré, sinon la règle protège un vide.

**Vérification.** Une proposition acceptée de bout en bout, avec régénération
des deux fiches, avant d'annoncer la fonctionnalité.

---

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

## T5 · Les quatre voies qui n'ont jamais payé — 🟧 / M

**Le constat.** `checkin_streak`, `placement`, `collection_set` et `twitch_drop`
figurent au barème montré aux joueuses. Aucune n'a jamais écrit une ligne. Un
barème qui promet ce qu'il ne verse pas abîme la confiance dans tout le reste,
y compris dans ce qui marche.

**Ce qu'on fait.** Pour chacune, établir si elle est **inatteignable** (condition
jamais réunie), **cassée** (condition réunie, rien versé) ou **en attente d'un
geste** (le cas de `twitch_drop`, cf. T4). Puis : réparer, ou retirer du barème
affiché et le dire.

`placement` est le cas à regarder en premier : il se déclenche à la fin d'un
tournoi, et la Cup 2026 en cours n'en a pas encore fini un. Il est probablement
sain — mais « probablement » n'est pas une vérification.

**Ce qu'on ne fait pas.** Rétro-créditer. Une récompense manquée sur une période
passée ne se rattrape pas sans réécrire l'histoire du registre, qui est un
journal en ajout seul.

---

## T6 · Faire monter l'opt-in photo, sans le forcer — 🟧 / M

**Le constat.** 15 cartes de joueuse portent une photo, sur 63 comptes actifs.
Une carte sans photo existe et se collectionne, mais c'est la photo qui fait la
carte.

**Ce qu'on fait.** Traiter les trois raisons plausibles de ne pas déposer, dans
l'ordre : on ne sait pas que c'est possible (le point d'entrée est discret) ; on
ne sait pas à quoi ça ressemblera (aucun aperçu avant dépôt) ; on ne sait pas ce
qu'on peut défaire (le retrait rétroactif existe et n'est dit nulle part à
l'endroit du dépôt). Aperçu en direct, mention du retrait sous le bouton, et une
invitation UNIQUE dans l'espace joueuse.

**Ce qu'on ne fait pas.** Relancer. Une invitation qui se répète sur une photo
de soi n'est pas une invitation, c'est une pression — et c'est exactement le
genre de pression que les garde-fous de TCG.md §2 existent pour empêcher. Une
fois refusée, l'invitation ne revient pas.

**Vérification.** La courbe des dépôts, et **le nombre de retraits** : s'il monte
avec les dépôts, c'est que l'invitation a convaincu des gens qu'elle n'aurait pas
dû convaincre.

---

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

## T9 · « Ne pas figurer dans le TCG » — 🟧 / M

**Le constat.** Les trois garde-fous de TCG.md §2 couvrent la PHOTO : rien
n'entre sans un geste de la joueuse, tout se retire. Mais une carte existe sans
photo, avec un nom et une équipe, et **rien ne permet de ne pas figurer du tout**.

**Ce qu'on fait.** Un opt-out, branché sur `readDrawPool` — les séries suivront
d'elles-mêmes, puisqu'elles lisent le même vivier. Décider aussi le sort des
cartes DÉJÀ tirées : les retirer des collections d'autrui est une opération
lourde, les y laisser contredit le retrait. C'est un arbitrage humain, à prendre
avant d'écrire le code.

**Ce qu'on ne fait pas.** Déduire l'opt-out d'un autre réglage (compte privé,
découverte désactivée). Un consentement qui se déduit d'autre chose n'en est pas
un — c'est la leçon du garde-fou photo.

---

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
