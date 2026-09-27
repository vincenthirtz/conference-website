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
| T2 | Donner une raison de dépenser | 🟥 | L | 0 pièce dépensée sur 10 805 |
| T3 | Activer les échanges | 🟥 | M | tout est construit, il manque un réglage et quatre arbitrages |
| T4 | Finir la chaîne du drop Twitch | 🟧 | S | 18 personnes rattachées attendent, deux gestes manquent |
| T5 | Les quatre voies qui n'ont jamais payé | 🟧 | M | ✅ **instruit le 2026-09-27** — aucune n'est cassée |
| T6 | Faire monter l'opt-in photo, sans le forcer | 🟧 | M | 15 photos sur 63 comptes |
| T7 | Amorcer le fan art | 🟧 | S | zéro soumission n'est pas une panne, c'est un silence |
| T8 | Un set d'événement | 🟩 | M | le premier motif de revenir qui ne dépende pas d'une victoire |
| T9 | « Ne pas figurer dans le TCG » | 🟧 | M | le consentement qui manque encore |
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

Cette leçon s'est vérifiée sur ce plan même, dès son premier lot. T1 devait
ajouter une notification qui existait déjà, T5 réparer quatre voies dont aucune
n'est cassée. Les deux se sont corrigés en une requête. **Un lot commence par
une mesure, pas par le paragraphe qui le décrit** — y compris quand ce
paragraphe vient d'être écrit.
