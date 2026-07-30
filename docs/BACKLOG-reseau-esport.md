# Backlog — réseau esport interne (équipes · scrims · rôles)

> Étude du 2026-07-31. Périmètre : les **équipes**, le **système de scrims** et les **rôles d'équipe**,
> vus comme les trois piliers d'un réseau esport interne (par opposition au rail « tournoi »,
> traité dans [BACKLOG-tournois.md](./BACKLOG-tournois.md)).
>
> Chaque constat est ancré sur du code (`fichier:ligne`) **et** sur l'état réel de la base de
> production, relevé le 2026-07-31.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) / M (qq h) / L (chantier).

---

## 1. État des lieux (prod, 2026-07-31)

| Rail       | Mesure                                                       | Valeur                      |
| ---------- | ------------------------------------------------------------ | --------------------------- |
| Comptes    | `auth.users`                                                 | 38                          |
| Équipes    | actives / ouvertes au recrutement / ouvertes au scrim        | 9 / 8 / **1**               |
| Roster     | membres / managers / coachs                                  | 19 / **0** / **0**          |
| Tournoi    | tournois / matchs (dont terminés)                            | 3 / 67 (7)                  |
| **Scrims** | scrims / grilles de dispo / demandes `type='scrim'`          | **0 / 0 / 0**               |
| Réseau     | joueuses libres / comptes Discord liés / BattleTags vérifiés | 4 / 6 (sur 38) / 3 (sur 19) |
| Réputation | lignes `player_ratings`                                      | **0**                       |
| Social     | profils découvrables / follows / messages inter-équipes      | **0 / 0 / 0**               |

**Lecture.** Le rail tournoi vit (3 tournois, 67 matchs). Tous les rails « réseau » sont à zéro
alors que la machinerie est livrée : négociation multi-créneaux, grilles When2Meet, relances cron,
events bot, emails capitaines, rating Glicko-2, découverte opt-in, messagerie inter-capitaines.

Le problème n'est donc **pas** un manque de fonctionnalités : c'est un problème d'**amorçage** et de
**rencontre entre l'offre et la demande**. Les axes ci-dessous sont priorisés dans cet ordre —
d'abord débloquer l'existant, ensuite créer la liquidité, enfin tisser la récurrence.

---

## 2. Constats structurels

### C1 · La découverte d'adversaire n'existe quasiment pas

Le seul chemin « je cherche un scrim » est [`pages/scrim.tsx`](../pages/scrim.tsx) : page **publique**,
`getStaticProps` + `revalidate: 600`, qui liste les équipes actives et filtre `open_for_scrim` côté
client ([`scrim.tsx:66`](../pages/scrim.tsx#L66)). Le CTA « Équipes ouvertes » du hub scrims de
l'espace joueur y renvoie ([`ScrimsHubCard.tsx:170`](../components/player/ScrimsHubCard.tsx#L170)).
Conséquence : aucun annuaire connecté, aucun filtre (niveau, créneau, pays, format), une fraîcheur à
10 minutes, et une équipe qui cherche un adversaire ce soir n'a aucun moyen de le faire savoir.

### C2 · `open_for_scrim` est un signal mort

Le booléen n'est lu que par la page publique ci-dessus et affiché dans le dashboard. Pas de date, pas
d'expiration, pas de notification, pas de matching. Une équipe qui l'active et l'oublie devient un
faux positif permanent ; une équipe qui cherche ponctuellement ne peut pas exprimer « jeudi 21 h, BO3 ».

### C3 · Les permissions d'équipe sont décoratives **et** sur-permissives

[`utils/teamRoles.ts`](../utils/teamRoles.ts) définit 7 permissions (`manage_roster`,
`manage_team_info`, `manage_scrims`, `manage_join_requests`, `register_tournaments`,
`send_captain_messages`, `edit_public_page`). **Une seule est vérifiée dans tout le code**
(`manage_roster`, 2 call sites). Les 24 routes de gestion passent par `getManagedTeam`
([`managementAccess.ts:69-91`](../utils/teams/managementAccess.ts#L69-L91)), qui traite comme
« manager » quiconque a **au moins une** permission — et lui accorde alors **tout**.

Effet concret : confier « gérer les scrims » à une coach lui donne aussi le roster, les messages
d'équipe et les inscriptions tournoi. C'est un risque de sécurité _et_ la raison probable du
**0 manager / 0 coach** en prod : personne ne délègue quand déléguer signifie tout donner.

### C4 · La négociation de scrim est riche mais sans chemin pour y arriver

> **Corrigé le 2026-07-31 (livraison R3).** La formulation initiale — « le geste
> de base manque » — était fausse : le formulaire connecté existait bien
> (`/player/requests?tab=scrim`, multi-créneaux + négociation). Ce qui manquait
> était le **chemin** (aucun point d'entrée depuis un contexte) et le **contexte
> de choix** (adversaire choisi dans une liste alphabétique muette).

`demandes.payload.scrim_nego` (5 créneaux, contre-propositions, `rounds`, `agreed_slot` — cf.
[`scrimNegotiation.ts`](../utils/teams/scrimNegotiation.ts)), grilles `scrim_plannings` (23 colonnes,
relances par [`cron/scrim-planning-reminders`](../pages/api/cron/scrim-planning-reminders.ts)), events
bot, emails capitaines. Zéro usage. Le geste de base manque : **« proposer un scrim à cette équipe »
depuis l'espace connecté**. Aujourd'hui il faut passer par un formulaire public sur la fiche d'équipe
ou par Discord.

### C5 · Les signaux de réputation ne sont jamais alimentés

`player_ratings` est vide malgré 7 matchs terminés : le calcul n'est branché qu'en incrémental sur
l'application d'un score ([`applyScore.ts:441`](../utils/matches/applyScore.ts#L441)), donc les matchs
antérieurs à la feature ne sont jamais notés, et `POST /api/admin/ratings/rebuild` n'a jamais tourné.
Résultat : leaderboard, profils joueuses, images OG et enrichissement de la découverte affichent du vide.

### C6 · L'identité vérifiée reste une friction non résolue

6 comptes Discord liés sur 38, 3 BattleTags vérifiés sur 19 membres. Or **tout** le réseau repose sur
`user_discord_links` : role-sync, salons d'équipe, invitations bot, joueuses libres. Sans liaison, une
joueuse est invisible du réseau — et les 32 comptes non liés sont autant de nœuds morts.

### C7 · Les primitives sociales existent mais ne se croisent pas

Messagerie inter-capitaines ([`player/messages.ts`](../pages/api/player/messages.ts), conversation
déterministe par paire d'équipes), `free_players` (4), découverte joueur opt-in cross-tenant, follows.
Aucune n'est reliée aux autres : la découverte ne propose pas de contacter, la messagerie ne s'ouvre pas
depuis une fiche d'équipe, et les 4 joueuses libres ne voient pas les 8 équipes qui recrutent.

### C8 · Rien ne fait revenir entre deux tournois

Un scrim est un one-shot négocié. Il n'existe aucun objet récurrent (entraînement hebdomadaire, ladder
permanent, ligue de scrims) alors qu'une `league` existe déjà en base (1 ligue) et agrège des tournois.
Entre deux éditions, le site n'a aucune raison d'être rouvert.

---

## 3. Axes priorisés

### P0 — Amorçage : débloquer ce qui est déjà construit

#### R1 · Rejouer le calcul des ratings + garantir la rétro-alimentation — ✅ LIVRÉ

- **Impact / Effort** : 🟥 / **S**
- **Résultat (2026-07-31)** : rebuild joué sur la prod → **6 joueuses notées sur
  7 matchs**. Découverte au passage : **6 des 7 matchs terminés ne peuvent PAS
  produire de rating** — un côté n'a aucun membre rattaché à un compte, or le
  moteur exige des participants des deux côtés. Le rating n'était donc pas
  cassé : les rosters sont incomplets. Un écran de couverture
  (`GET /api/admin/ratings/coverage` + section dans `/admin/ratings`) expose
  désormais l'écart **et sa cause**. Renforce R11 (identité/roster).
- **Problème** : C5 — 0 rating pour 7 matchs terminés, toutes les surfaces de réputation sont vides.
- **Proposition** : lancer `POST /api/admin/ratings/rebuild` sur le tenant, puis ajouter un garde-fou
  (test ou job) qui détecte l'écart « matchs terminés sans rating ».
- **Acceptation** : leaderboard non vide ; profil joueuse affiche un rating ; un match terminé
  aujourd'hui produit une ligne sans intervention.

#### R2 · Rendre les permissions d'équipe réellement granulaires — ✅ LIVRÉ

- **Impact / Effort** : 🟥 / **M**
- **Résultat (2026-07-31)** : `getManagedTeam` expose les permissions
  effectives (capitaine = toutes, sans requête supplémentaire) ;
  `assertTeamPermission` garde 17 routes avec la permission qui les concerne.
  Aucun changement pour l'existant (capitaine et rôle `manager` par défaut ont
  tout le catalogue) ; un rôle à privilèges partiels est enfin borné.
- **Problème** : C3 — une permission accordée = toutes les permissions.
- **Proposition** : `getManagedTeam` renvoie les **permissions effectives** du membre ; chaque route
  gated exige la permission qui la concerne (`manage_scrims` pour les scrims, `manage_join_requests`
  pour les demandes…). Le capitaine garde l'ensemble implicitement.
- **Acceptation** : une coach avec `manage_scrims` peut répondre à un scrim et **ne peut pas** toucher
  au roster ; test unitaire par permission ; aucune régression sur les 24 routes.
- **Bénéfice réseau** : débloque la délégation, donc l'apparition de managers/coachs (aujourd'hui 0).

#### R3 · « Proposer un scrim » depuis l'espace connecté — ✅ LIVRÉ

- **Impact / Effort** : 🟥 / **M**
- **Problème** : C4 — la négociation existe, le chemin pour l'atteindre non.
- **Résultat (2026-07-31)** : `/api/teams` expose `open_for_scrim` (+ filtre) ;
  le sélecteur d'adversaire badge « cherche un scrim » et remonte les équipes
  disponibles en tête ; `?team=<id>` pré-sélectionne l'adversaire ; la fiche
  d'équipe propose le formulaire connecté aux capitaines/managers d'une autre
  équipe. Aucune API créée — celle qui existait suffisait.
- **Proposition** : bouton sur la fiche d'équipe et dans l'annuaire (R4) → modale multi-créneaux qui
  crée directement la demande `type='scrim'` avec `scrim_nego`, sans repasser par le formulaire public.
- **Acceptation** : un capitaine crée une proposition en < 30 s ; l'équipe cible la voit dans son hub
  scrims + notification ; la contre-proposition existante fonctionne sans changement.

### P1 — Liquidité : faire se rencontrer l'offre et la demande

#### R4 · Annuaire d'équipes connecté et filtrable

- **Impact / Effort** : 🟥 / **M**
- **Problème** : C1 — pas de surface de découverte pour un capitaine connecté.
- **Proposition** : page `/player/teams` (SSR, données fraîches) listant les équipes avec filtres :
  cherche un scrim, recrute, pays, effectif, niveau (rating R1). Actions directes : proposer un scrim,
  envoyer un message, voir la fiche.
- **Acceptation** : filtres combinables ; l'état « cherche un scrim » est à la seconde, pas à 10 min ;
  `/scrim` reste la vitrine publique mais n'est plus le seul chemin.

#### R5 · Disponibilité datée et périssable

- **Impact / Effort** : 🟧 / **M**
- **Problème** : C2 — un booléen sans date ni péremption.
- **Proposition** : remplacer/compléter `open_for_scrim` par des **recherches de scrim** (créneaux
  souhaités, format, niveau visé, expiration automatique). Le booléen devient dérivé (« a au moins une
  recherche active »).
- **Acceptation** : une recherche expire seule ; l'annuaire n'affiche que des disponibilités vivantes ;
  relance J-1 à l'auteur (réutilise le cron de relance des grilles).

#### R6 · Matching et alerte d'adversaire

- **Impact / Effort** : 🟥 / **M-L**
- **Problème** : même avec R4/R5, personne ne revient regarder l'annuaire.
- **Proposition** : à la création d'une recherche (R5), notifier les équipes compatibles — créneaux qui
  se recoupent, niveau proche (R1) — via l'**outbox existante** (push / Discord / email selon les
  préférences déjà livrées).
- **Acceptation** : une recherche produit ≤ N notifications ciblées ; opt-out par équipe ; aucune
  notification vers une équipe déjà occupée sur le créneau.

#### R7 · Marché joueuses libres ↔ équipes qui recrutent

- **Impact / Effort** : 🟧 / **S-M**
- **Problème** : C7 — 4 joueuses libres et 8 équipes ouvertes au recrutement s'ignorent.
- **Proposition** : croiser les deux listes dans les deux sens (une joueuse libre voit les équipes qui
  recrutent et peut candidater ; le bouton « Inviter » côté capitaine existe déjà), avec le rôle
  recherché et la spécialité.
- **Acceptation** : une joueuse libre a un écran « équipes qui recrutent » ; candidature = demande
  `type='join'` existante ; notification au capitaine.

### P2 — Tissu : récurrence, réputation, identité

#### R8 · Ladder / ligue de scrims permanente

- **Impact / Effort** : 🟧 / **L**
- **Problème** : C8 — rien ne fait revenir entre deux tournois.
- **Proposition** : les scrims joués comptent pour un classement permanent adossé à l'objet `leagues`
  déjà en base ; saison glissante, montée/descente, rôle Discord par palier (le role-sync existe).
- **Acceptation** : un scrim validé met à jour le classement ; page de classement publique ; opt-in par
  équipe (un scrim d'entraînement peut rester hors classement).

#### R9 · Fiche d'équipe = profil réseau

- **Impact / Effort** : 🟧 / **M**
- **Problème** : la fiche est une vitrine (logo, sponsors, contenu riche) sans dimension relationnelle.
- **Proposition** : y ajouter l'historique des scrims et adversaires, la disponibilité courante, les
  indicateurs de fiabilité (R10), et les actions « proposer un scrim » / « contacter ».
- **Acceptation** : depuis une fiche, un capitaine connecté engage un scrim ou une conversation sans
  quitter la page.

#### R10 · Réputation de fiabilité (anti-ghosting)

- **Impact / Effort** : 🟧 / **M**
- **Problème** : la monnaie d'un réseau de scrims, c'est la fiabilité — invisible aujourd'hui.
- **Proposition** : indicateurs dérivés des données existantes : taux de réponse aux propositions,
  délai médian de réponse, no-shows constatés. Affichés sur la fiche et dans l'annuaire.
- **Acceptation** : indicateurs calculés sans saisie manuelle ; jamais de note subjective entre
  équipes (pas de système de reviews) ; masqués sous un seuil d'échantillon.

#### R11 · Onboarding réseau : lier Discord, vérifier son BattleTag

- **Impact / Effort** : 🟥 / **S-M**
- **Problème** : C6 — 6/38 comptes liés, 3/19 BattleTags vérifiés ; sans ça, invisible du réseau.
- **Proposition** : étape guidée au bon moment (arrivée dans une équipe, inscription à un tournoi),
  avec explication de ce que la liaison débloque, et relance unique. La carte d'onboarding Battle.net
  existe déjà sur `?welcome=1` — l'étendre au-delà de la seule création d'équipe.
- **Acceptation** : taux de liaison mesurable ; aucune relance répétée ; parcours skippable.

#### R12 · Activer la découverte joueuse au bon moment

- **Impact / Effort** : 🟩 / **S**
- **Problème** : 0 profil découvrable — l'opt-in global existe mais personne ne le rencontre.
- **Proposition** : proposer l'activation là où elle a du sens (fin de tournoi, sortie d'équipe), avec
  la promesse explicite « visible uniquement derrière connexion, jamais indexé ».
- **Acceptation** : proposition non intrusive, une seule fois ; kill-switch inchangé.

---

## 4. Séquencement suggéré

1. **R1** (une commande) puis **R2** — l'un remplit les surfaces vides, l'autre débloque la délégation.
2. **R3 + R4** ensemble : sans porte d'entrée ni annuaire, R5/R6 n'ont rien à alimenter.
3. **R5 puis R6** : la disponibilité datée d'abord, le matching ensuite.
4. **R7 / R11** en parallèle (peu coûteux, effet direct sur le nombre de nœuds actifs).
5. **R8 / R9 / R10** une fois qu'il existe un flux de scrims réel à mesurer.

> Règle de lecture : tant que **R3/R4** ne sont pas livrés, aucune métrique de scrim ne sera
> interprétable — le zéro actuel mesure l'absence de chemin, pas l'absence de demande.
