# Plan — TCG, deuxième passe (10 lots)

> Établi le **2026-10-13**, à partir d'une mesure de la base de production faite
> le soir même. Il succède à [PLAN-tcg.md](./PLAN-tcg.md) (2026-09-27, huit lots
> livrés sur dix, T7 et T8 repris ici). La référence de la fonctionnalité reste
> [TCG.md](./TCG.md) ; ses quatre garde-fous de consentement et sa règle « la
> monnaie se gagne, elle ne s'achète pas » encadrent chaque lot ci-dessous et ne
> sont pas rediscutés.
>
> Le périmètre a changé depuis le premier plan : le code métier (routes,
> services, fonctions SQL, migrations) vit dans **conference-api** ; ce dépôt ne
> porte que l'UI (`features/*/tcg/ui`, `components/tcg`, `components/admin/tcg`)
> et les fichiers synchronisés par `npm run sync:api`. Chaque lot dit donc où il
> s'écrit.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) ·
> M (quelques heures) · L (chantier).

---

## 1. État des lieux (prod, 2026-10-13)

| Rail | 27/09 | **13/10** | Lecture |
|---|---|---|---|
| Porte-monnaie ouverts | 63 | **69** | +6 en deux semaines, hors cadeau d'accueil |
| Pièces gagnées (cumul) | 10 805 | **35 440** | la victoire est passée à 200 pièces, la participation DNF à 1 000 |
| Pièces **dépensées** | 0 | **11 600** | 38 boosters (11 400) + 1 habillage (200) |
| Comptes à ≥ 300 pièces | 12 | **28** | la monnaie s'accumule plus vite qu'elle ne sort |
| Paquets distribués | 100 | **253** | |
| Paquets **jamais ouverts** | 53 (53 %) | **86 (34 %)** | mieux, mais 34 comptes attendent encore, 29 depuis plus de 7 jours |
| Cartes tirées / recyclées / brillantes | — | 835 / 18 / 73 | |
| **Forges** | — | **0** | le débit « collection » livré le 27/09 n'a jamais servi |
| Habillages débloqués | 0 | 1 | |
| Vitrines activées | 2 | 4 | |
| Échanges : réglages acceptants / propositions | 0 / 0 | **64 / 0** | opt-out depuis le 2026-10 : tout le monde accepte, personne ne propose |
| Photos de joueuse | 15 | 21 approuvées, 2 sans | |
| Fan art | 0 | 4 approuvées, 1 refusée | la chaîne a tourné en conditions réelles (T7 clos) |
| Cartes « L'association » | 0 | **9** | Octobre Rose, Halloween, nœud voxel, Arukdo, logos historiques, Shiva |
| Drop Twitch | 0 crédit | **1 crédit** | la chaîne est vivante (T4 clos) ; une récompense « mise en avant » active (Halloween) |
| Meilleure collection | 3 équipes / 10 | 8 équipes / 10, 4 maps | une série d'équipes est à portée |
| Dernier gain / dernière ouverture | 25/09 · 26/09 | 12/10 · 12/10 | le jeu vit au rythme des journées de Cup |

**Répartition des gains** (n, pièces) : `match_win` 135 / 13 500 · `tournament_participation` 8 / 8 000 ·
`welcome_gift` 58 / 5 800 · `battlenet_verified` 40 / 4 000 · `match_prediction` 53 / 1 325 ·
`public_mvp` 8 / 800 · `checkin_streak` 15 / 750 · `card_recycled` 18 / 540 · `staff_welcome` 3 / 300 ·
`supporter_welcome` 3 / 300 · `collection_set` 2 / 200 · `twitch_drop` 1 / 25.

**Ouverture par origine** : victoire 135 paquets, 54 fermés (40 %) · accueil 64, 26 fermés (41 %) ·
série de check-ins 15, 6 fermés · achat 38, **0 fermé** · drop 1, 0 fermé. Les paquets qu'on a
*choisis* s'ouvrent tous ; ceux qu'on *reçoit* s'ouvrent deux fois sur cinq, quelle que soit
l'origine. L'écart accueil/victoire du premier plan s'est refermé : l'annonce (T1) a fait son travail,
et le problème restant n'est plus l'information mais le **retour**.

### Ce que ces chiffres disent

1. **L'économie tourne, dans un seul sens.** 11 600 pièces sorties, toutes en boosters sauf 200. La
   forge — pensée pour transformer les doublons en progression — n'a servi **zéro** fois ; le
   recyclage dix-huit fois. Le joueur de TCG ne « forge » pas : il ouvre des paquets, et attend
   d'eux qu'ils ne le punissent pas (cf. lot 3).
2. **Les échanges sont ouverts à tous et vides.** 64 acceptants, 0 proposition. Ce n'est plus un
   problème de consentement (T3) mais de **découverte** : personne ne sait qui a quoi en doublon ni
   qui cherche quoi. Un marché sans annonces n'est pas un marché.
3. **Un tiers des paquets dort encore**, chez 34 personnes, 29 depuis plus d'une semaine. Le DM
   Discord a été envoyé une fois ; il n'y a pas de second rappel, et aucun canal e-mail (lot 2).
4. **Les briques nouvelles marchent** : fan art tiré, drop Twitch crédité, neuf cartes de
   l'association, une récompense à carte garantie en service. Ce que la régie demande maintenant,
   c'est d'en faire tourner **plusieurs à la fois** (lot 1).
5. **Entre deux journées, rien ne se passe.** Tous les gains sont adossés à la compétition ; les
   semaines creuses de la Cup sont des semaines mortes pour le TCG (lots 5, 6, 7).

---

## 2. Séquencement

| Lot | Titre | Impact | Effort | Où | Pourquoi à ce rang |
|---|---|---|---|---|---|
| 1 | Plusieurs récompenses Twitch à carte garantie | 🟥 | M | api + site | demandé par la régie, Halloween est en cours — ✅ **code livré le 2026-10-13**, migration à appliquer |
| 2 | E-mail « tes paquets t'attendent » | 🟥 | M | api | 86 paquets dormants ; le seul canal non essayé |
| 3 | Protection anti-doublon et garantie de rareté | 🟥 | M | api | la règle d'or du genre ; la forge à zéro dit que les doublons sont subis, pas joués |
| 4 | Échanges : « je cherche / je donne » | 🟥 | L | api + site | 64 acceptants, 0 proposition : il manque la découverte |
| 5 | Le barème dit où on en est + objectif de la semaine | 🟧 | M | api + site | reprise T5 ; le premier motif de revenir hors journée de Cup |
| 6 | Tirage partagé (« wonder pick ») | 🟧 | L | api + site | le mécanisme social qui a fait Pokémon TCG Pocket, adossé au flux « TCG en action » existant |
| 7 | Set d'événement Halloween + garde-fou des types de carte | 🟧 | M | api + site | reprise T8 ; neuf cartes de l'association sont prêtes à faire une série |
| 8 | Carte à partager (image OG) | 🟧 | M | site | la viralité d'un TCG passe par la capture de son tirage |
| 9 | Tableau de bord d'engagement : cohortes, dormants, entonnoirs | 🟧 | M | api + site | tout ce qui précède doit se mesurer ailleurs que dans un client SQL |
| 10 | Dette : figurines, e2e, colonnes héritées, docs | 🟩 | M | api + site | ce que les neuf lots laissent derrière eux |
| 11 | Attaque et défense (prélude à l'arène de la Library) | 🟧 | M | api + site | demandé le 2026-10-21 ; l'arène ne se construit pas sans chiffres stables sur les cartes — ✅ **code livré le 2026-10-21**, migration à appliquer |
| 12 | L'arène de la Women's Library | 🟧 | L | api + site | esquisse seulement : règles et questions ouvertes à trancher avant tout code |

---

## Lot 1 · Plusieurs récompenses Twitch à carte garantie — ✅ CODE LIVRÉ (2026-10-13)

**Le constat.** La récompense « mise en avant » (2026-09-28) tient sur deux colonnes de
`twitch_broadcaster_connections` : `tcg_featured_reward_id` et `tcg_featured_fanart_id`. Une seule
à la fois, donc : mettre Halloween en service a *remplacé* Octobre Rose dans la désignation (la
récompense Twitch, elle, est restée sur la chaîne — un échange d'Octobre Rose aujourd'hui tombe en
`other_reward` : points dépensés, rien reçu, aucun remboursement). La régie veut Octobre Rose,
Halloween **et** le drop ordinaire en même temps, et pouvoir le régler depuis l'onglet Récompenses.

**Ce qui a été fait.**

*conference-api*
- Migration `database/migrations/twitch_tcg_featured_rewards.sql` : table
  `twitch_tcg_featured_rewards (tenant_id, reward_id, fanart_id, cost, created_at, created_by)`,
  une ligne par récompense, **une récompense par carte** (`UNIQUE (tenant_id, fanart_id)`), RLS
  service_role. Reprise des deux colonnes héritées dans la table ; les colonnes restent en lecture
  de repli le temps du déploiement et partent au lot 10.
- Webhook `pages/api/webhooks/twitch/tcg-drop.ts` : la liaison porte une **liste** de récompenses
  garanties ; `matchDropReward` la parcourt ; chaque récompense garde sa propre limite par direct
  (`source_ref` suffixé `:featured:<reward_id>`). Table absente (migration pas encore passée) ⇒
  repli sur les colonnes héritées, jamais un 503 qui ferait révoquer l'abonnement par Twitch.
- Service `features/admin/twitch/service/eventsub.ts` : `GET eventsub/tcg-drop` rend `featured[]`
  (récompense, carte, titre, coût, publiée ou non) ; `POST` avec `featuredFanartId` **ajoute** une
  ligne au lieu d'écraser (409 `card_already_featured` si la carte a déjà sa récompense) ; nouvelle
  route `DELETE /api/admin/twitch/tcg-drop/featured/[id]` : retire l'abonnement EventSub de cette
  récompense, la **désactive** sur Twitch (pas supprimée : réactivable), puis efface la ligne — dans
  cet ordre, pour qu'aucun échange ne tombe entre deux.

*conference-website*
- `TcgDropHealthCard` : le bloc « Récompense mise en avant » devient une **liste** (carte, coût,
  état publié, bouton Retirer) avec un formulaire d'ajout qui ne propose que les cartes de
  l'association **pas encore liées**. Un lien depuis l'onglet Récompenses vers ce bloc.

**Ce qui ne bouge pas.** La récompense se crée toujours par nous (`only_manageable_rewards`) ; le
coût en points de chaîne n'est pas le barème TCG ; une carte retirée (`revoked`) reste liée mais
le paquet retombe sur un tirage ordinaire — le bloc le signale.

**À faire côté humain.** Appliquer la migration (commandes dans le compte rendu), déployer
conference-api **puis** le site, puis sur `/admin/diffusion/overlays?tab=tcg` : ajouter Octobre
Rose à côté de Halloween. Vérification : un échange réel de chacune pendant le prochain direct, deux
paquets avec `guaranteed_fanart_id` distincts en base.

## Lot 2 · E-mail « tes paquets t'attendent » — 🟥 / M

**Le constat.** 86 paquets fermés chez 34 personnes ; 29 d'entre elles n'ont rien ouvert depuis plus
de sept jours. Elles ont reçu **un** DM Discord à l'attribution (T1) — rien depuis, et rien pour
celles dont le Discord n'est pas lié. Le système de campagnes e-mail (`utils/broadcasts.ts`, Brevo,
300/jour, désinscription par destinataire) existe et n'a aucune audience TCG.

**Ce qu'on fait (conference-api).**
- Une audience `tcg-unopened-packs` dans `CampaignAudience` : comptes confirmés, e-mail présent,
  **au moins un paquet fermé depuis plus de 7 jours**, non désinscrits. Calculée comme les autres
  (`computeAudienceRecipients`), donc réutilisable par toute campagne créée depuis `/admin/broadcast`.
- Le gabarit porte des **variables par destinataire** : nombre de paquets fermés et origine du plus
  ancien (« ta victoire du 5 octobre »). Un e-mail générique dirait « tu as peut-être des paquets » ;
  celui-ci dit « tu en as trois ».
- **Une relance au plus tous les 30 jours par personne** (clé `tcg_unopened_reminder` dans
  `email_campaign_sends` ou équivalent), et jamais vers quelqu'un qui a ouvert depuis l'envoi
  précédent. Une relance qui revient est une relance qu'on désactive.
- Pas de rappel pour un paquet de moins de 7 jours : le DM d'attribution couvre cette fenêtre.

**Le texte proposé** (objet et corps, à relire par la régie) :

> **Objet :** {count, plural, one {Un paquet t'attend} other {# paquets t'attendent}} dans ta collection
>
> Salut {prenom},
>
> {count, plural, one {Un paquet de cartes} other {# paquets de cartes}} de la Women's Cup
> {count, plural, one {attend} other {attendent}} dans ton espace joueuse — le plus ancien vient de
> {origine} ({date}). Chaque paquet, c'est cinq cartes : trois joueuses, une équipe, et une carte
> surprise (map, fan art ou logo de l'association). Les cartes brillantes existent, et personne ne sait
> encore si la tienne en a une.
>
> 👉 Ouvrir mes paquets : https://owwomenscup.fr/player/tcg
>
> Et une fois ouverts : les doublons se recyclent (30 pièces) ou s'échangent avec les autres
> collectionneuses — ton réglage d'échanges est déjà ouvert, tu peux le fermer à tout moment depuis
> « Mes échanges ».
>
> À bientôt sur le serveur,
> L'équipe Women's Cup
>
> *Tu reçois ce message parce que tu as un compte joueuse. Un seul rappel par mois, et tu peux le
> couper ici : {lien_desinscription}.*

**Ce qu'on mesure.** Le taux d'ouverture des paquets **des destinataires** à J+7 contre celui des
non-destinataires (ceux dont l'e-mail manque forment un groupe témoin naturel). Si l'écart est nul,
le canal n'est pas le problème — et on arrête la relance plutôt que de la renforcer.

## Lot 3 · Protection anti-doublon et garantie de rareté — 🟥 / M

**Le constat.** 835 cartes tirées, 18 recyclées, 0 forgée. Le tirage (`utils/tcg/drawPack.ts`) est
uniforme à rareté donnée : rien n'empêche une collectionneuse qui possède 8 équipes sur 10 de tirer
une neuvième copie de la même. La meilleure collection est à 8/10 depuis des semaines. Dans tout TCG
numérique qui a survécu, deux règles sont devenues des évidences : **pas de doublon tant qu'il
reste une carte inconnue à ce palier** (Hearthstone depuis 2020, Pokémon TCG Pocket, Marvel Snap),
et **un plancher de rareté** à intervalle fixe (le « pity timer » : au plus N paquets sans
épique).

**Ce qu'on fait (conference-api, `utils/tcg/drawPack.ts` + son test).**
- *Duplicate protection* : à chaque emplacement, si la collectionneuse possède déjà la carte tirée
  **et** qu'il reste au moins une carte non possédée au même palier et du même type, on retire. Les
  cartes de joueuse retirées du TCG (T9) et les fan arts révoquées ne comptent pas. La règle
  s'arrête là : on ne force jamais un palier, seulement le choix dans le palier.
- *Plancher* : au plus **10 paquets consécutifs sans carte épique ou mieux** (compteur lu dans
  `tcg_pack_cards` à l'ouverture, pas stocké : la base le sait déjà). Les paquets achetés y
  comptent comme les autres.
- *Doublon utile* : quand le doublon est inévitable (palier complet), le paquet le dit à l'ouverture
  (« déjà dans ta collection — recycle-la ou échange-la ») avec les deux boutons. Le doublon cesse
  d'être une perte muette.
- Les probabilités affichées au barème public (`publicBareme`) sont relues : la protection change
  les fréquences perçues, pas les taux par palier — le texte doit dire les deux.

**Ce qu'on ne fait pas.** Pas de « pity » sur la brillante (`is_foil`) : la brillance est un
hasard assumé, pas une progression. Pas de wildcards à la MTG Arena : la forge existe pour ça, et
le lot 4 lui donne enfin des cartes à viser.

**Ce qu'on mesure.** Le taux de doublon par paquet avant/après (il est aujourd'hui calculable sur
les 253 paquets), et la première collection d'équipes complétée.

## Lot 4 · Échanges : « je cherche / je donne » — 🟥 / L

**Le constat.** 64 réglages acceptants, 0 proposition, 0 blocage. Tout le monde a dit oui, personne
ne sait à qui parler. L'écran des échanges demande de **choisir une partenaire d'abord**, puis de
composer — l'inverse de ce que fait une collectionneuse, qui part d'une carte qu'elle cherche.

**Ce qu'on fait.**
- *Liste de souhaits* (api : `tcg_wishlists`, une ligne par carte voulue ; site : un cœur sur chaque
  carte non possédée du catalogue et de la collection). Visible des autres **uniquement** si les
  échanges sont acceptés — c'est un signal d'échange, pas un profil public.
- *Doublons disponibles* : calculés, pas déclarés (toute carte possédée ≥ 2 fois, hors brillante,
  hors reçue par échange). La collectionneuse peut en exclure une (« je garde »).
- *Correspondances* : « 3 collectionneuses cherchent une carte que tu as en double » et « 2 ont en
  double une carte de ta liste », avec la proposition pré-remplie en un clic. L'appariement vit dans
  une fonction SQL (`tcg_trade_matches`), comme les autres invariants des échanges ; un blocage
  orienté (T3) retire la personne des deux listes sans le dire.
- *Depuis la carte* : la vue agrandie d'une carte non possédée affiche « en double chez N
  collectionneuses » et mène à la proposition. C'est là que naît l'envie, pas dans un onglet.
- Le DM Discord d'une proposition reçue existe déjà ; on y ajoute la **raison** (« elle a Fika en
  double, tu la cherchais »).

**Ce qu'on ne fait pas.** Aucun prix, aucune cote, aucun classement de valeur : la parité reste en
nombre de cartes, le verdict ordinal de `tradeBalance` reste informatif. Pas de marché public : les
listes ne sont visibles que des acceptantes, jamais sur `/tcg`.

**Ce qu'on mesure.** La première proposition, puis le taux d'acceptation. Si les correspondances
existent et que personne ne clique, c'est la proposition elle-même qu'il faudra regarder.

## Lot 5 · Le barème dit où on en est + objectif de la semaine — 🟧 / M

**Le constat.** T5 l'avait noté : « série de check-ins : 50 pièces » se lit comme une promesse,
« 3 check-ins sur 5 » comme un objectif. Rien n'a bougé depuis, et `checkin_streak` a commencé à
payer (15 fois) sans que personne ne voie venir le seuil. Et entre deux journées de Cup, le barème
est une liste de choses qu'on ne peut pas faire aujourd'hui.

**Ce qu'on fait.**
- *Progression par voie* (api : un champ `progress` dans la réponse du barème ; site :
  `TcgEarnSection`/`earnHint`) : check-ins « 3 / 5 », séries « 8 / 10 équipes », vérification
  Battle.net « faite » ou « à faire », Twitch « compte relié, aucun drop encore ». Une voie
  inatteignable pour ce compte (pronostics pour le staff) n'est pas affichée barrée : elle n'est
  pas affichée.
- *Un objectif de la semaine*, unique, choisi par la régie dans une liste fermée (« ouvre un
  paquet », « propose un échange », « règle ta vitrine », « vérifie ton Battle.net »), affiché en
  tête de `/player/tcg` du lundi au dimanche. Récompense : **un paquet**, pas des pièces — le
  robinet de pièces coule déjà assez, et un paquet ramène à l'ouverture. Source `weekly_goal` au
  CHECK de `tcg_packs.source_kind`, une par semaine et par compte (`source_ref = <iso-week>`).
- Le DM Discord du lundi existe-t-il ? Non, et il ne sera pas créé : l'objectif se découvre en
  venant, il ne vient pas chercher les gens. C'est la différence entre un objectif et une relance.

**Ce qu'on mesure.** Les connexions à `/player/tcg` hors journée de Cup (aujourd'hui quasi nulles :
les pics d'ouverture suivent les matchs à l'heure près).

## Lot 6 · Tirage partagé (« wonder pick ») — 🟧 / L

**Le constat.** Le flux public « TCG en action » (`/api/public/tcg/live`, `RecentPullsSection`)
montre déjà les tirages rares des vitrines ouvertes. On les regarde, on ne peut rien en faire. Le
mécanisme qui a fait le succès de Pokémon TCG Pocket est exactement celui-là : **choisir une carte
face cachée dans le paquet qu'une autre vient d'ouvrir**, pour un coût modique.

**Ce qu'on fait (conference-api : fonction SQL `tcg_wonder_pick` ; site : un panneau sous le flux).**
- Un paquet ouvert depuis moins de 24 h par une collectionneuse dont la vitrine est publique (le
  consentement de la vitrine est **la** condition : TCG.md §2.6 dit déjà que c'est elle qui ouvre
  les surfaces publiques) peut être « revisité » : ses cinq cartes sont présentées face cachée,
  mélangées ; on en choisit une ; on reçoit **une copie**, l'original n'est pas touché.
- Coût : 100 pièces, **un tirage partagé par jour** (`source_ref = <date>`), jamais sur son propre
  paquet. La copie entre dans un paquet `source_kind = 'wonder_pick'` d'une seule carte (le CHECK
  et `drawPack` savent déjà faire un paquet à carte garantie, cf. `guaranteed_fanart_id`).
- Les cartes de joueuse retirées (T9) et les fan arts révoquées sont remplacées par la face neutre
  et ne sont pas choisissables.

**Pourquoi c'est bon pour tout le reste.** C'est un débit de pièces qui mène à une carte **qu'on a
vue** (contrairement au booster), il donne une raison d'ouvrir sa vitrine (le paquet revisité
crédite sa propriétaire de 10 pièces), et il ramène chaque jour — exactement les trois manques du
tableau de la section 1.

## Lot 7 · Set d'événement Halloween + garde-fou des types de carte — 🟧 / M

**Le constat.** Repris du premier plan (T8). Depuis, neuf cartes de l'association existent et la
récompense à carte garantie fonctionne : le matériau est là. Le mécanisme des séries
(`collection_set`) existe et a payé deux fois.

**Ce qu'on fait.**
- Une série « Halloween 2026 » de trois à cinq cartes de l'association, **datée** (du 20/10 au
  03/11), définie en données (`tcg_sets` avec `starts_at`/`ends_at`) et non en code : la régie en
  fera d'autres. Les cartes sortent dans l'emplacement de décor pendant la fenêtre (part de fan art
  relevée pour la durée), par la récompense garantie du lot 1, et par le tirage partagé du lot 6.
- Récompense de série : une **brillante garantie** de la carte-titre, pas des pièces.
- Le garde-fou promis par T8 : un test qui énumère les points de contact d'un `subject_kind` /
  d'une catégorie (tirage, faces, échanges, forge, vitrine, recyclage, séries, overlay, catalogue
  public, description) et échoue quand un type n'est pas traité partout. Il est écrit **avant** la
  série, pas après.

## Lot 8 · Carte à partager (image OG) — 🟧 / M

**Le constat.** Une collectionneuse qui tire une légendaire brillante n'a rien à montrer en dehors
du site : pas d'image, pas de lien. Or c'est la capture de l'ouverture qui fait circuler un TCG sur
Discord et les réseaux — pas la page du catalogue.

**Ce qu'on fait (site, `pages/api/internal/*` étant la seule API locale, le rendu vit dans une route
`pages/tcg/carte/[token].tsx` + `og:image` générée côté serveur, 1200×630).**
- Depuis la vue agrandie d'une carte **possédée**, « Partager » produit un lien court porteur d'un
  jeton signé (carte + collectionneuse + date), qui rend une page `noindex` avec la carte, « tirée
  par {pseudo} », et l'invitation à commencer sa collection.
- Consentement : seules **ses propres** cartes ; une carte de joueuse ne se partage que si la
  joueuse figurant dessus a une photo approuvée **ou** si c'est la face sans photo (le partage ne
  crée aucune surface publique nouvelle pour un tiers). La carte d'une joueuse retirée du TCG ne se
  partage pas.
- Le même rendu sert l'overlay OBS (`components/overlay/TcgAnnouncement`) et le DM Discord du bot
  (pièce jointe au lieu du texte seul).

## Lot 9 · Tableau de bord d'engagement : cohortes, dormants, entonnoirs — 🟧 / M

**Le constat.** `/admin/tcg` montre des totaux et des taux par origine (T10). Il ne montre ni le
temps entre attribution et ouverture, ni les cohortes (qui, arrivée en septembre, est encore là en
octobre ?), ni les entonnoirs des échanges et de la forge. Les constats de la section 1 ont encore
été tirés à la main.

**Ce qu'on fait (api : `pages/api/admin/tcg/engagement.ts` ; site : `TcgEngagementPanel`).**
- *Délai d'ouverture* : médiane et répartition (< 1 h, < 24 h, < 7 j, jamais), par origine.
- *Cohortes mensuelles* : comptes créés le mois M, part ayant ouvert / échangé / dépensé en M+1.
- *Dormants* : la liste des comptes à paquets fermés depuis plus de 7 jours, avec le dernier
  contact (DM, e-mail du lot 2) — l'écran d'où part la relance, et où l'on voit si elle a servi.
- *Entonnoirs* : échanges (acceptants → proposantes → acceptées), forge (doublons éligibles →
  forges), tirage partagé (lot 6).
- `npm run tcg:audit` gagne les contrôles des lots 1, 3, 5, 6 (unicité des `source_ref`, paquets
  `wonder_pick` à une carte, plancher de rareté respecté).

## Lot 10 · Dette : figurines, e2e, colonnes héritées, docs — 🟩 / M

- **Douze figurines voxel** toujours en file d'attente (`heroFigureCoverage`) : travail
  d'illustration, pas de code. Le garde-fou suffit à ce qu'un oubli ne passe pas.
- **La suite Playwright ne tourne toujours nulle part** (T10). Le runner GitHub attend un socle de
  schéma et le mot de passe base. Tant qu'il n'est pas là, aucun scénario e2e TCG de plus.
- **Colonnes héritées** `tcg_featured_reward_id` / `tcg_featured_fanart_id` : à supprimer une fois
  le lot 1 déployé et vérifié en direct (migration de nettoyage, puis `refresh-schema-snapshot`).
- **`DiscordUserId` partagé** de la spec OpenAPI (`{17,20}` contre `{15,25}` dans le code).
- **Docs** : TCG.md §4 (drop Twitch) pour la liste de récompenses, §6 pour la route `featured/[id]`,
  et le guide joueuse `/player/tcg-guide` pour les lots 3, 5, 6 à mesure qu'ils partent.

## Lot 11 · Attaque et défense (prélude à l'arène de la Library) — ✅ CODE LIVRÉ (2026-10-21)

**La demande.** « Une carte TCG doit comporter des points attaque/défense comme dans Yu-Gi-Oh, pour
ensuite créer une arène de combat dans la Women's Library. » Ce lot pose les chiffres sur la carte ;
l'arène est le lot 12.

**Le piège.** Une carte, c'est souvent une PERSONNE. Des points dérivés de ses performances (rating,
K/D, taux de victoire, votes MVP) ou tirés au hasard par joueuse classeraient deux joueuses réelles
du même palier l'une au-dessus de l'autre, publiquement : c'est la « seconde échelle » que TCG.md
§3 refuse, et une carte « 900 ATK » qui circule sous un nom peut rabaisser quelqu'un. Les chiffres
ne se dérivent donc **que de ce que la carte est déjà** : son type, son rôle de jeu (un fait public,
déjà dessiné par la figurine) et sa rareté **figée au tirage**.

**La règle.** La rareté décide de la PUISSANCE (ATK + DEF) et du NIVEAU ; le type ou le rôle ne
décide que de sa RÉPARTITION. Aucun type ne vaut plus qu'un autre à rareté égale, et même type +
même rôle + même rareté ⇒ mêmes chiffres, au point près. La brillante ne donne **rien** (variante
d'impression, pas un palier).

| Rareté | Niveau (étoiles) | Puissance | Assaut (ATK / DEF) | Rempart | Équilibre |
|---|---|---|---|---|---|
| `common` | 3 | 2 400 | 1 400 / 1 000 | 1 000 / 1 400 | 1 200 / 1 200 |
| `rare` | 4 | 3 000 | 1 800 / 1 200 | 1 200 / 1 800 | 1 500 / 1 500 |
| `epic` | 6 | 4 000 | 2 400 / 1 600 | 1 600 / 2 400 | 2 000 / 2 000 |
| `legendary` | 8 | 5 000 | 3 000 / 2 000 | 2 000 / 3 000 | 2 500 / 2 500 |

Les magnitudes sont celles de Yu-Gi-Oh (le niveau 4 à 1 800 ATK, le niveau 8 à 3 000), et les
niveaux tombent dans ses trois classes d'invocation : 3–4 sans sacrifice, 6 avec un, 8 avec deux —
le lot 12 pourra s'en servir sans rien renuméroter. `common` est au niveau 3, pas 1 : un plancher,
pas un échec.

| Carte | Profil | Pourquoi |
|---|---|---|
| Joueuse ou héros **tank** | Rempart | le rôle qui encaisse |
| Joueuse ou héros **dégâts** | Assaut | le rôle qui frappe |
| Joueuse ou héros **soutien** | Équilibre | le rôle qui tient les deux |
| Joueuse sans rôle connu (aucun héros choisi, `flex`, ou **retirée du TCG**) | Équilibre | on n'attribue pas un rôle au hasard |
| Équipe | Équilibre | une équipe, c'est les trois rôles ensemble |
| Map | Rempart | un terrain ne frappe pas, il se tient |
| Mascotte | Équilibre | un compagnon, ni devant ni derrière |
| Fan art, **association comprise** | Assaut | une image est un coup d'éclat ; l'association est une catégorie de fan art, pas un type de carte (TCG.md, « La catégorie L'association ») — et une œuvre retirée, dont la face n'est plus lisible, ne change pas de chiffres |

**Le rôle d'une joueuse** est celui que montre déjà sa figurine : le rôle de son premier héros
choisi, à défaut sa spécialité de roster (`recommendCardHero`). Celui d'un héros vient du
registre. Une joueuse retirée (§2.4 bis) est anonyme **aussi par ses chiffres** : son rôle n'est
pas lu, sa carte prend le profil Équilibre de sa rareté, comme toute carte sans rôle.

**Figé ou dérivé ? Le rôle est figé, les chiffres sont dérivés.** Même raisonnement que la rareté
(« la carte tirée un jour donné garde ce qu'elle valait ce jour-là ») : le rôle bouge — une
joueuse change de héros favori ou de spécialité, et le jeu reclasse ses héros (Sombra est passée
de Dégâts à Soutien le 2026-10-17). Sans gel, une carte en main changerait de répartition sous les
yeux de sa propriétaire, ce que l'arène ne peut pas accepter. On fige donc **le rôle seul**, dans
`tcg_pack_cards.card_role` (joueuses et héros), au tirage. Les chiffres, eux, restent une fonction
pure de trois entrées figées ou immuables (type, rôle, rareté) : les stocker en plus doublerait la
table en SQL sans rien stabiliser de plus, et la garder dans le code laisse retoucher le barème
d'un coup avant l'ouverture de l'arène. Une fan art n'est pas indexée sur sa cible (héros ou map
qu'elle illustre) : la cible se modifie après validation.

**Ce qui a été fait.**

*conference-api*
- `utils/tcg/cardStats.ts` (pur) + `tests/unit/tcgCardStats.test.ts` : chaque type × rôle × rareté,
  brillante sans bonus, rôle inconnu, retrait, rôle figé prioritaire sur le rôle courant.
- Migration `database/migrations/tcg_card_role.sql` : colonne `card_role` (NULL = rôle inconnu),
  CHECK de valeur et de type (joueuse ou héros seulement), backfill idempotent depuis le registre
  des héros et les préférences / spécialités actuelles (le rôle du jour du tirage n'est connu de
  personne : le backfill fige celui du jour de la migration), joueuses retirées laissées à NULL.
- `utils/tcg/cardRoleReady.ts` : sonde de la colonne. Avant la migration, le rôle est lu **en
  direct** comme la figurine (chiffres justes, pas encore stables) et rien n'est écrit.
- Champ **additif** `stats { level, attack, defense, profile }` sur toutes les cartes rendues à
  une joueuse ou une visiteuse : ouverture de paquet, collection (exemplaire de meilleure rareté),
  vitrine (joueuse et fiche publique), « TCG en action » (tirages, carte de la semaine, vitrines
  d'équipe), échanges (propositions et cartes). La forge fige le rôle de la carte forgée. Schéma
  zod nommé `TcgCardStats` + OpenAPI.
- Inchangés : la route bot (résumé sans cartes), l'image `/api/og/tcg-card` du salon #tcg (elle
  ne reçoit pas le rôle de l'exemplaire ; l'y ajouter est un suivi), l'overlay OBS (aucune carte).

*conference-website*
- `TcgCardStatsLine` (sous la rareté de `TcgCard`) : « ★★★★ Niv. 4 » puis « ATK 1800 DEF 1200 »,
  ligne abrégée cachée du lecteur d'écran et doublée d'une phrase entière ; la vue agrandie dit
  le profil ; rien ne se rogne (une vignette de 100 px passe à la ligne). Collection,
  révélation, vitrine (éditeur et fiche), « TCG en action », échanges (le bouton de sélection
  redit les chiffres dans son nom accessible) affichent les `stats` de l'API. La fiche joueuse
  (rôle de sa figurine), la fiche d'équipe (calculée au rendu serveur) et le catalogue `/tcg`
  ne montrent pas un exemplaire : même module pur. L'accueil n'a pas de chiffres.
- `shouldOptimizeCardImage` sort de `TcgCard.tsx` (déplacement tel quel, réexporté) pour que le
  composant reste sous le plafond de taille de l'espace joueuse.
- Libellés FR + EN (`playerTcg`), tests UI contre des réponses figées (mêmes littéraux que
  l'API).

**À faire côté humain.** Appliquer la migration (commandes dans le compte rendu), déployer
conference-api **puis** le site. Vérification : `select card_role, count(*) from tcg_pack_cards
group by 1` après application — aucune carte d'équipe, de map ou de fan art avec un rôle.

**Fini quand** chaque carte affichée porte niveau, ATK et DEF ; deux cartes de même type, rôle et
rareté ont les mêmes chiffres ; une joueuse qui change de héros ne change pas ses cartes déjà
tirées ; une joueuse retirée n'est reconnaissable ni à son nom ni à ses chiffres.

## Lot 12 · L'arène de la Women's Library — esquisse, non implémentée

**Où.** Une salle de la Library (une porte du hall), en bêta fermée comme le reste de la Library.
On y joue avec **sa** collection : les chiffres du lot 11, rien d'autre.

**Règles proposées (Yu-Gi-Oh très simplifié, sans magie ni piège en V1).**
- Deck de 20 cartes de sa collection (doublons permis jusqu'au nombre possédé), main de 5, une
  pioche par tour, 4 000 points de vie.
- Une invocation par tour : niveau 3–4 libre, niveau 6 contre un sacrifice, niveau 8 contre deux.
  Trois emplacements sur le terrain. Une carte se pose en attaque ou en défense.
- Combat : ATK contre ATK, la plus faible est détruite et la différence part des points de vie ;
  ATK contre DEF, la défense détruite si l'ATK la dépasse, sans dégâts aux points de vie ; égalité,
  rien. Attaque directe quand le terrain adverse est vide.
- Les profils comptent sans règle de plus : un Rempart tient en défense, un Assaut se joue en
  attaque — c'est déjà un choix de deck.

**Ce qui ne bouge pas.** Aucune carte ne se perd ni ne se gagne en duel ; aucune pièce n'est mise
en jeu (cf. « un pronostic, pas un pari » : une mise, même en pièces, changerait la nature de la
fonctionnalité). Les faces passent par `readCardFaces` : une joueuse retirée reste anonyme sur le
terrain de l'adversaire.

**Décisions du 2026-10-21.**
1. **Contre une PNJ d'abord** : une « gardienne de l'arène » de la Library, avec des decks fixes.
   Rien en temps réel ni de joueuse à joueuse en v1. Le duel entre joueuses viendra plus tard, s'il
   vient.
2. **Un paquet par semaine** pour une victoire d'arène, jamais des pièces misées. C'est une
   nouvelle source de cartes, pas de pièces : on la mesure comme les autres paquets.
3. **Aucun classement public.** Chacune garde son historique de duels pour elle.
4. Puisque l'adversaire est une PNJ, le deck d'une autre joueuse n'est jamais montré.
   Recommandation : les decks de la PNJ n'utilisent que des cartes sans personne réelle (héros,
   maps, équipes, mascottes), pour ne pas avoir à trancher le consentement de la vitrine (§2.6).
5. **Le barème du lot 11 est validé**, profils des types sans rôle et table de niveaux compris. Il
   est gelé dès l'ouverture de l'arène : le retoucher deviendra une nouvelle édition versionnée,
   pas une correction en place.

**Reste ouvert.** Les échanges et la forge restent-ils ouverts aux cartes engagées dans un deck ?
Recommandation : oui. Un deck n'est qu'une sélection, pas un verrou : une carte qui quitte la
collection quitte aussi le deck.

---

## 3. Ce qu'on ne fait pas, et pourquoi

- **Aucune voie d'achat en euros** — ni pièces, ni paquets, ni habillages, ni « pass ». C'est la
  règle qui tient le TCG hors du régime des boîtes à butin, et les lots 3 et 6 sont conçus pour
  rendre la monnaie *utile* sans la rendre *achetable*.
- **Aucune cote, aucun prix sur les cartes** : le lot 4 apparie des envies, il ne fait pas un marché.
- **Pas de nouvelle source de pièces** : les deux récompenses nouvelles (lots 5 et 7) sont des
  paquets et une brillante. 35 440 pièces produites pour 11 600 consommées : le robinet n'est pas le
  problème.
- **Pas d'annuaire public des collections** : les listes du lot 4 ne sont visibles que des
  acceptantes ; la carte partagée du lot 8 n'ouvre aucune surface pour un tiers.
- **Pas de notification de plus** : un DM à l'attribution, un e-mail par mois au plus (lot 2),
  rien pour l'objectif de la semaine ni le tirage partagé.

## 4. Vérification

Les chiffres de la section 1 se refont avec `npm run tcg:audit` (conference-api) et la requête de
mesure utilisée ce jour (comptages sur `tcg_wallets`, `tcg_wallet_entries`, `tcg_packs`,
`tcg_pack_cards`, `tcg_trade_settings`, `tcg_trades`, `tcg_fanart_cards`, `tcg_showcases`). **Refaire
la mesure avant d'entamer un lot** : le premier plan a montré, dès son premier lot, qu'un paragraphe
écrit la veille peut déjà décrire un passé révolu.
