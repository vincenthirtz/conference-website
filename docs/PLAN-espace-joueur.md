# Plan — espace joueur / coach / manager / capitaine

> Établi le 2026-09-01, après le lot « permissions d'équipe effectives » (commit `c9e4f8b4`).
> Périmètre : `pages/player/*`, `pages/espace-capitaine.tsx`, `components/player/*` (~20 000 LOC),
> et les routes `pages/api/player/*` / `pages/api/teams/*` qui les servent.
>
> Le pendant staff vit dans [PLAN-espace-admin.md](./PLAN-espace-admin.md). Les deux plans
> partagent une même colonne vertébrale — **le droit d'agir doit être fin, lisible et délégable** —
> et une même échéance : la Cup 2026 démarre la semaine du **14 septembre 2026**.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) · M (qq h) · L (chantier).

---

## 1. État des lieux (prod, 2026-09-01)

| Rail | Mesure | Valeur |
|---|---|---|
| Comptes | `auth.users` | **90** (38 au 31/07) |
| Équipes | actives | 10 |
| Roster | `team_members` | **70** |
| **Encadrement** | coachs / managers / remplaçantes | **7 / 9 / 8** |
| Identité | comptes Discord liés | **50** (6 au 31/07) |
| Compétition | matchs planifiés / joués | 69 / **0** |
| Saison | 1re journée Cup 2026 | **semaine du 14/09**, puis ~6 matchs/semaine |
| Scrims | scrims / grilles de dispo | 2 / 0 |

**Trois lectures qui pilotent ce plan.**

1. **L'encadrement n'est plus une hypothèse** : 16 personnes sur 70 (23 % du roster) sont coach ou
   manager. Le lot de permissions livré le 31/08 a donc une population réelle — et la question
   suivante (« qui décide de ces droits ? ») devient concrète.
2. **La saison n'a pas commencé** : 0 match joué sur 69 planifiés. Tout le parcours « jour de
   match » est du code jamais exercé en conditions réelles, et il sera exercé **69 fois** à partir
   du 14 septembre, par ~10 capitaines qui ne l'ont jamais vu.
3. **Le rail scrim reste froid** (2 scrims, 0 grille) malgré deux vagues livrées
   ([reseau-esport](./BACKLOG-reseau-esport.md), [reseau-intelligent](./BACKLOG-reseau-intelligent.md)).
   Ce plan n'y remet **pas** d'effort : le problème y est l'amorçage, pas l'outillage.

---

## 2. Séquencement

La date du 14/09 coupe le plan en deux, et c'est le seul arbitrage structurant :

- **Avant la 1re journée** — J1, J2 : ce que 10 capitaines et 70 joueuses vont utiliser dès le
  premier match. Une régression ici se paie en arbitrage manuel du staff, match après match.
- **Pendant la saison** — J3, J4, J5 : ce qui sert l'encadrement au fil des journées, livrable
  entre deux journées sans risque pour le match du week-end.
- **Après / continu** — J6, J7 : confort et filet de sécurité, jamais devant une échéance.

| Lot | Titre | Impact | Effort | Fenêtre |
|---|---|---|---|---|
| **J1** | Le fil du match, de J-1 au débrief | 🟥 | M | ✅ livré 2026-09-01 |
| **J2** | Mon agenda (+ abonnement calendrier) | 🟥 | S | avant 14/09 |
| **J3** | Délégation des droits par la capitaine | 🟥 | M | saison |
| **J4** | Console manager multi-équipes | 🟧 | M | saison |
| **J5** | Espace coach : préparer, puis débriefer | 🟧 | M | saison |
| **J6** | Dashboard priorisé (« à faire », pas « tout ») | 🟧 | M | après |
| **J7** | Filet de sécurité : e2e du jour J + a11y mobile | 🟧 | M | continu |

---

## J1 · Le fil du match, de J-1 au débrief — ✅ LIVRÉ (2026-09-01, `69589968`)

**Problème.** Un même match est traité sur **trois surfaces** :

- le check-in et la feuille de match sur [`pages/player/checkin.tsx`](../pages/player/checkin.tsx)
  (qui monte déjà [`MatchLineupCard`](../components/player/MatchLineupCard.tsx)) ;
- le rappel et l'état de préparation sur le dashboard
  ([`PlayerDashboardScreen.tsx`](../components/player/screens/PlayerDashboardScreen.tsx), carte
  `MatchReadinessCard`) ;
- le **report du score** sur [`pages/player/matches.tsx`](../pages/player/matches.tsx) via
  [`ReportScoreModal`](../components/player/ReportScoreModal.tsx).

Une capitaine qui joue son match doit donc trouver trois écrans différents, dont deux qu'elle
n'a aucune raison de connaître à l'avance. Multiplié par 69 matchs et ~10 capitaines débutantes,
c'est le premier générateur de tickets support de la saison — et le staff paiera en `process_demande`
et en arbitrage manuel ce que l'écran n'aura pas dit.

**Proposition.** Une page `pages/player/match/[matchId].tsx` — **le fil du match** — qui suit une
seule rencontre de bout en bout, avec un état visible et un seul geste possible à la fois :

```
J-2   Adversaire, horaire, format          → dossier de scouting (existant)
J-1   Check-in ouvert                      → bouton unique
J-0   Feuille de match                     → MatchLineupCard (existant)
Live  Lien stream / salon Discord du match → liens
Fin   Report du score                      → ReportScoreModal (existant)
Après Revue                                → TeamMemoryCard (existant)
```

Ce lot **n'invente presque rien** : il recompose des briques livrées derrière une URL unique,
partageable dans le fil Discord du match (le bot en ouvre déjà un — `services/discord-bot/match-thread.js`).

**Critères d'acceptation**
- [x] `/player/match/[matchId]` rend les étapes dans l'ordre des gestes, sans jamais afficher
      un geste que le serveur refusera (`permissions` renvoyées par la route).
- [x] `/player/checkin`, le CTA du dashboard, `NextMatchCard` et « Mes matchs » pointent dessus ;
      aucune route supprimée.
- [x] Le lien part avec les notifications push de match (`playerUrlForEvent` route désormais
      `checkin.opened` / `match.*` vers le fil), avec le rappel de feuille de match
      (`utils/checkin.ts`) et dans l'embed du thread Discord (`embed-helpers.js`, repo bot).
- [x] Une joueuse non capitaine y voit l'état (check-in fait, score rapporté) sans aucun bouton.
- [x] e2e : `tests/e2e/player-match-thread.spec.ts`, viewport mobile, 4 cas.

**Livré en plus** : `utils/matches/playerMatchView.ts` — la dérivation « de quel côté je joue »
était écrite à la main dans `next-match.ts` et `matches.ts`, elle l'aurait été une 3e fois.
Les deux routes existantes y passent désormais.

**Non-buts.** Pas de chat de match (le Discord le fait), pas de score live minute par minute.

---

## J2 · Mon agenda (+ abonnement calendrier) — 🟥 / S · avant 14/09

**Problème.** À partir du 14/09, chaque équipe a un match par semaine pendant 7 journées. Le site
sait tout de ce calendrier et n'en offre **aucune vue personnelle** : le prochain match seulement
([`NextMatchCard`](../components/player/NextMatchCard.tsx)), et une liste plate dans
[`pages/player/matches.tsx`](../pages/player/matches.tsx). L'export `.ics` existe déjà, mais
seulement **par tournoi** ([`pages/api/tournament/[id]/calendar.ics.ts`](../pages/api/tournament/[id]/calendar.ics.ts))
et **par créneau de scrim validé** ([`utils/teams/scrimIcs.ts`](../utils/teams/scrimIcs.ts)) —
jamais « mes échéances à moi ».

**Proposition.** Un agenda personnel, agrégé et abonnable :

- `GET /api/player/agenda` — matchs de mes équipes, scrims confirmés, fenêtres de check-in,
  date butoir d'inscription, deadlines de roster. Une seule requête, scopée sujet (`?as=`).
- Une vue « 4 prochaines semaines » sur `/player/matches`, groupée par semaine.
- `GET /api/player/agenda.ics?token=…` — **flux ICS personnel** (token opaque révocable), à
  coller dans Google/Apple Calendar. C'est le seul format que l'utilisatrice consulte
  spontanément : le calendrier qu'elle regarde déjà.

**Critères d'acceptation**
- [ ] Un manager multi-équipes voit les échéances de **toutes** ses équipes dans un seul agenda.
- [ ] Le flux ICS est révocable (rotation du token depuis le profil) et ne fuit rien d'autre que
      ce que la personne voit déjà.
- [ ] Les fuseaux : événements en UTC + `TZID`, testés sur un passage d'heure d'été.
- [ ] Tests unitaires sur la composition de l'agenda (fusion, tri, dédoublonnage).

---

## J3 · Délégation des droits par la capitaine — 🟥 / M · saison

**Problème.** Depuis le 31/08, l'espace joueur affiche exactement ce que chaque rôle peut faire.
Reste la question d'après : **personne dans l'équipe ne peut changer ces droits.** La configuration
vit dans `site_settings.team_roles` ([`utils/teamRoles.ts:174`](../utils/teamRoles.ts#L174)),
éditable seulement par le staff
([`components/admin/site-settings/TeamRolesPanel.tsx`](../components/admin/site-settings/TeamRolesPanel.tsx)),
et elle est **globale** : elle vaut pour les 10 équipes à la fois.

Conséquences concrètes, avec 7 coachs et 9 managers en prod :

- confier « les scrims » à quelqu'un impose de lui donner le rôle `coach`, qui porte aussi
  `validate_lineup` — on ne peut pas déléguer une chose sans l'autre ;
- une équipe qui veut une répartition différente doit demander au staff… qui ne peut la changer
  que **pour tout le monde** ;
- `manager` porte la totalité du catalogue ([`DEFAULT_TEAM_ROLES`](../utils/teamRoles.ts#L104)) :
  c'est une capitaine bis, y compris sur les infos publiques de l'équipe.

**Proposition.** Deux étages, du moins risqué au plus riche :

1. **Surcharges par membre** (`team_member_permissions`) : la capitaine coche des permissions
   supplémentaires sur une ligne de roster. Le rôle reste le défaut, la surcharge est l'exception.
   `getManagedTeams` fusionne rôle + surcharge — un seul point de lecture à modifier
   ([`utils/teams/managementAccess.ts`](../utils/teams/managementAccess.ts)).
2. **Rôles par tenant** : `team_roles` déplacé d'un réglage global vers un réglage scopé
   (dépend de **A8** côté admin).

**Critères d'acceptation**
- [ ] Une capitaine accorde `manage_scrims` à une joueuse sans changer son rôle, et le retire.
- [ ] Toute délégation est journalisée (qui, à qui, quoi, quand) et visible dans l'équipe.
- [ ] Une surcharge ne peut jamais **retirer** ce que le rôle accorde (additif seulement) —
      sinon deux managers pourraient se neutraliser mutuellement.
- [ ] La capitaine ne peut pas déléguer ce qu'elle n'a pas (elle a tout, mais un manager non).
- [ ] `assertTeamPermission` reste le seul garde-fou serveur : aucun nouvel endroit ne décide.

---

## J4 · Console manager multi-équipes — 🟧 / M · saison

**Problème.** Un manager peut encadrer plusieurs équipes depuis le 2026-08-20
(`allow_manager_multi_team.sql`), et l'espace lui offre un **sélecteur** :
[`ActiveTeamSwitcher`](../components/player/ActiveTeamSwitcher.tsx) recharge tout l'écran sur
l'équipe choisie. Donc pour savoir si ses trois équipes sont prêtes pour la journée, il regarde
trois fois le même dashboard. À 6 matchs par semaine, c'est le geste qu'il répétera le plus.

**Proposition.** Une vue `/player/my-teams` — à ne pas confondre avec
[`/player/teams`](../pages/player/teams.tsx), qui est l'annuaire d'adversaires du réseau :
une ligne par équipe × les colonnes qui décident d'une journée — prochain match, check-in,
feuille de match, effectif vs `min_players`, demandes en attente, Discord manquant. Chaque cellule
est un lien vers **le fil du match** (J1). Un seul appel serveur pour toutes les équipes gérées.

**Critères d'acceptation**
- [ ] `GET /api/player/my-teams` renvoie une ligne par équipe gérée, permissions comprises.
- [ ] Aucune cellule n'affiche une action que le manager n'a pas le droit de faire sur CETTE équipe
      (les permissions sont déjà portées par équipe dans `managedTeams`).
- [ ] Le sélecteur reste la navigation « détail » ; la console est la vue d'ensemble.

---

## J5 · Espace coach : préparer, puis débriefer — 🟧 / M · saison

**Problème.** Le coach a désormais un périmètre net (scrims + feuille de match) et **7 personnes**
l'occupent. Mais la matière de son métier est éparpillée : le dossier d'adversaire
([`pages/api/player/scouting.ts`](../pages/api/player/scouting.ts)) vit dans l'annuaire, la mémoire
d'équipe ([`TeamMemoryCard`](../components/player/TeamMemoryCard.tsx)) sur le dashboard, le map pool
ailleurs encore. Aucun écran ne relie **avant** et **après** un match — or c'est exactement la
boucle du métier de coach.

**Proposition.** Un onglet « Préparation » sur le fil du match (J1), réservé à `validate_lineup` :
dossier adversaire + nos revues précédentes contre lui + map pool du tournoi + un bloc
**objectifs du match** (3 lignes libres) qui devient automatiquement l'amorce de la revue
post-match. La boucle se referme sans qu'on ait à y penser.

**Critères d'acceptation**
- [ ] Les objectifs saisis avant le match apparaissent pré-remplis dans la revue après le match.
- [ ] Rien du privé de l'adversaire n'apparaît (la ligne de confidentialité de `scouting.ts` fait foi).
- [ ] Le bloc est lisible par tout le roster, éditable par qui a `validate_lineup`.

---

## J6 · Dashboard priorisé — 🟧 / M · après

**Problème.** [`PlayerDashboardScreen`](../components/player/screens/PlayerDashboardScreen.tsx)
empile aujourd'hui ~15 cartes en 4 catégories. Chaque carte se masque quand elle n'a rien à dire —
bonne règle — mais quand elles parlent toutes, la hiérarchie est celle du code, pas celle de
l'urgence. Une capitaine à J-1 doit descendre pour trouver son check-in.

**Proposition.** Un bandeau « À faire » en tête, calculé serveur (check-in ouvert, feuille non
validée, demande en attente, invitation non répondue, BattleTag non vérifié), plafonné à 3 items,
avec un lien par item. Le reste devient repliable, l'état des sections mémorisé par personne.

**Critères d'acceptation**
- [ ] Le bandeau ne rend rien quand il n'y a rien à faire (pas de « tout va bien » permanent).
- [ ] Les items sortent des mêmes sources que les cartes — aucune nouvelle règle métier.
- [ ] L'ordre est stable d'un chargement à l'autre (pas de sautillement).

---

## J7 · Filet de sécurité : e2e du jour J + a11y mobile — 🟧 / M · continu

**Problème.** Le backlog qualité note une couverture e2e déséquilibrée (Q021) ; le parcours qui va
être joué 69 fois n'est pas couvert de bout en bout, et il sera fait **au téléphone**, souvent en
vocal Discord, parfois dans un train.

**Proposition.**
- Un spec e2e « jour de match » : check-in → feuille → report, en viewport mobile, pour une
  capitaine, une joueuse simple et un coach (trois personas, trois attentes différentes).
- Un passage a11y sur le fil du match : cibles ≥ 44 px, focus visible, `aria-live` sur les
  changements d'état, contraste des badges d'état.

**Critères d'acceptation**
- [ ] Le spec échoue si un bouton d'action apparaît pour un rôle qui n'a pas la permission.
- [ ] Les specs tournent sur base **locale** uniquement (garde-fou `supabaseTestClient` — la prod
      n'est jamais semée).

---

## 3. Ce qu'on ne fait pas (et pourquoi)

- **Relancer le rail scrim.** 2 scrims et 0 grille de dispo après deux vagues livrées : le
  problème est l'amorçage, pas l'outil. Y remettre du code serait construire au-dessus du vide.
- **Un chat intégré.** Le Discord de chaque équipe existe, le bot y poste déjà les fils de match.
- **Une app native.** Le PWA + push (`PushOptIn`) couvre le besoin réel : recevoir le rappel J-1.
- **Refondre l'UI de l'espace joueur.** Les écrans ne souffrent pas d'esthétique, mais de
  dispersion (J1) et de hiérarchie (J6).

## 4. Vérification

`npm run verify` (vitest + tsc + eslint) avant chaque commit — cf. [conference verify](../CLAUDE.md).
Pour tout lot touchant les permissions : `tests/unit/teamClientPermissions.test.ts`,
`tests/unit/apiTeamsMyPermissions.test.ts`, `tests/unit/teamPermissions.test.ts` doivent rester verts
sans être assouplis. Toute modification d'endpoint : `tests/unit/openapiContractDrift.test.ts` +
mise à jour de [`docs/openapi.yaml`](./openapi.yaml) et de [BOT_API_CONTRACT.md](./BOT_API_CONTRACT.md).
