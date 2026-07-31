# Backlog — réseau **intelligent** interne (rétention des équipes)

> Étude du 2026-07-31, **après** livraison intégrale de [BACKLOG-reseau-esport.md](./BACKLOG-reseau-esport.md)
> (R1→R12 : ratings, permissions granulaires, annuaire connecté, disponibilité datée, matching,
> marché joueuses libres, ladder de scrims, fiabilité, onboarding réseau).
>
> Question posée : **qu'est-ce qui donne à une équipe un intérêt énorme à rester ?**
> Ce n'est pas la même question que « comment trouve-t-elle un adversaire ». La première vague a
> bâti un réseau de **rencontre**. Celle-ci doit bâtir un réseau d'**habitude** et d'**intelligence**.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) / M (qq h) / L (chantier).

---

## 1. État des lieux (prod, 2026-07-31, après R1→R12)

| Rail          | Mesure                                         | Valeur        |
| ------------- | ---------------------------------------------- | ------------- |
| Comptes       | `auth.users`                                   | 38            |
| Équipes       | actives / ouvertes au scrim                    | 6 / 1         |
| Roster        | `team_members`                                 | 19            |
| Réseau livré  | `scrim_searches` / `scrims` / `demandes` scrim | **0 / 0 / 0** |
| Planification | `scrim_plannings`                              | **0**         |
| Réputation    | `player_ratings` / matchs terminés             | 6 / 7         |
| Identité      | comptes Discord liés                           | 6 (sur 38)    |
| Marché        | joueuses libres                                | 4             |

**Lecture honnête.** Les surfaces livrées aujourd'hui n'ont pas encore d'usage — c'est normal, elles
datent de quelques heures. Mais ce zéro dit aussi quelque chose de structurel : **toute la valeur
construite dépend de la densité du réseau**. À 6 équipes, un annuaire trié par créneaux communs a
peu de chances de proposer quoi que ce soit. Tant qu'une équipe **seule** ne retire rien de la
plateforme, il n'y a pas de première équipe — et donc jamais de réseau.

La vague qui suit est donc bâtie sur une règle : **chaque brique doit avoir de la valeur à une seule
équipe**, et n'en gagner davantage que lorsque les autres arrivent.

---

## 2. Constats structurels

### M1 · C'est un réseau de rencontre, pas d'habitude

Toutes les surfaces livrées répondent à « qui puis-je affronter ? » — une question qu'une équipe
amateur se pose deux ou trois fois par mois. Entre deux, le site n'a **rien** à offrir. Or la
rétention ne naît pas de la rencontre : elle naît de l'usage ordinaire. Il manque l'objet que
l'équipe ouvre le mardi soir sans chercher personne.

### M2 · La disponibilité est déclarée par événement, jamais par habitude

`scrim_plannings` est une grille **par scrim** ([`scrimPlanningOverlap.ts`](../utils/teams/scrimPlanningOverlap.ts)),
`scrim_searches` porte des créneaux **ponctuels** ([`scrimSearch.ts`](../utils/teams/scrimSearch.ts)).
Aucun des deux ne capte le fait de base d'une équipe amateur : **on joue mardi et jeudi à 21 h**.
Conséquence directe : chaque scrim recommence à zéro la question des dispos, personne ne remplit
jamais la grille (0 en prod), et le système ne sait rien du rythme de l'équipe — donc ne peut rien
en déduire.

### M3 · Le tri de l'annuaire est un proxy, pas un score

[`teams-directory.ts:178-186`](../pages/api/player/teams-directory.ts#L178-L186) trie par créneaux
communs, puis « cherche un scrim », puis alphabétique. Le rating et la fiabilité sont **affichés**
mais n'entrent pas dans l'ordre : une équipe à 1200 et une à 1900 se retrouvent côte à côte, et une
équipe qui ne répond jamais passe devant une équipe fiable. L'annuaire montre des données ; il ne
donne pas de **conseil**.

### M4 · Rien ne repart vers l'équipe

Le site attend qu'on vienne. Aucune restitution périodique, aucun bilan, aucun « voilà votre
semaine ». Pourtant l'infrastructure est là et éprouvée : `email-digest`, `team-roster-reminders`,
`task-board-digest`, `web-push-dispatch`, outbox + préférences par canal. Le déclencheur de retour
n'a jamais été branché sur l'objet « équipe ».

### M5 · Aucune mémoire d'équipe

7 matchs joués, aucune trace de ce que l'équipe en a tiré : pas de note, pas de VOD, pas de revue,
pas d'historique de compositions. Le seul endroit où une équipe capitalise sur son travail, c'est
son Discord — c'est-à-dire ailleurs. Une plateforme qu'on quitte sans rien perdre est une
plateforme qu'on quitte.

### M6 · Les non-capitaines n'ont rien à faire ici

Roster, scrims, demandes, inscriptions, messages : tout est réservé à la gestion (à raison, cf. R2).
Résultat mécanique : une équipe = **1 personne qui vient, 4 qui ne viennent jamais**. Or la
rétention d'une équipe est celle de ses membres, pas celle de sa capitaine. Il manque un objet
partagé auquel chaque joueuse contribue.

### M7 · Le niveau existe, la progression non

`player_ratings` / `team_ratings` donnent une photo instantanée. `player_rating_history` existe mais
n'est jamais restituée : aucune courbe, aucun jalon, aucun « vous avez gagné 40 points ce mois-ci ».
Le rating est un chiffre, pas un récit — donc il ne motive personne.

---

## 3. Axes priorisés

### P0 — Valeur à une seule équipe (indépendante de la densité)

#### N1 · Rythme d'équipe : disponibilité **récurrente** du roster — ✅ LIVRÉ

- **Impact / Effort** : 🟥 / **M**
- **Problème** : M2 + M6 — la dispo est demandée par événement, et seule la capitaine agit.
- **Proposition** : chaque membre déclare ses créneaux **hebdomadaires récurrents** (grille
  jour × heure, dans SON fuseau — une habitude se dit « 21 h », pas « 21 h 30 »). L'équipe voit la heatmap agrégée et son **noyau** : les
  créneaux où l'effectif requis est atteint. Le noyau alimente ensuite tout le reste — annonce de
  scrim pré-remplie, matching, alerte d'effectif.
- **Pourquoi ça marche seul** : une équipe de 5 sans aucune autre équipe sur la plateforme y gagne
  déjà « on est 5 le mardi 21 h, pas le jeudi » — un fait qu'elle n'a nulle part ailleurs.
- **Résultat (2026-07-31)** : table `team_availability` (une ligne par membre, fuseau propre),
  `utils/teams/teamRhythm.ts` (grille, heatmap, noyau, projection DST-safe des occurrences à venir),
  `GET`/`PUT /api/player/team-rhythm` ouverts à **tout membre** (pas seulement la gestion), carte
  `TeamRhythmCard` sur le tableau de bord, et bouton « annoncer ces créneaux » qui crée la recherche
  de scrim depuis le noyau (réservé à `manage_scrims`).
- **Acceptation** : un membre non capitaine peut contribuer ; le noyau se calcule sans saisie
  supplémentaire ; les créneaux proposés à l'annonce sont des instants réels (pas des intentions).

#### N2 · Mémoire d'équipe : revue de match et de scrim — ✅ LIVRÉ

- **Impact / Effort** : 🟧 / **M**
- **Problème** : M5 — rien ne capitalise sur les matchs joués.
- **Proposition** : sur chaque match/scrim terminé, un bloc « revue » : lien VOD, note libre
  partagée avec l'équipe, points travaillés. Historique consultable par adversaire.
- **Résultat (2026-07-31)** : table `team_reviews` (sujet polymorphe match/scrim, adversaire et date
  **dérivés du sujet côté serveur**, RLS deny strict), `utils/teams/teamReviews.ts`,
  `GET`/`PUT`/`DELETE /api/player/team-reviews` ouverts à **tout membre** — une mémoire réservée à la
  capitaine n'est pas une mémoire d'équipe — et carte `TeamMemoryCard` sur le tableau de bord, qui
  mêle matchs et scrims dans une seule chronologie et se filtre par adversaire côté client.
  Deux gardes non négociables : le sujet doit appartenir à l'équipe (sinon on polluerait
  l'historique d'autrui) et le lien de VOD n'accepte que http(s) (le champ est libre, rendu
  cliquable pour tout le roster).
- **Acceptation** : une équipe retrouve en 10 s ce qu'elle avait noté sur son dernier affrontement
  contre X ; rien n'est visible par l'adversaire.

#### N3 · Santé d'équipe : un diagnostic actionnable, pas des checklists éparses — ✅ LIVRÉ

- **Impact / Effort** : 🟧 / **S-M**
- **Problème** : M6 + dispersion — la carte d'onboarding réseau (R11) couvre l'identité individuelle,
  rien ne couvre l'équipe : effectif sous le minimum, membres jamais connectés, comptes non liés,
  noyau insuffisant pour le prochain match, BattleTags non vérifiés.
- **Correction du diagnostic (2026-07-31)** : le calcul EXISTAIT déjà. `utils/teamMessages.ts` sait
  dire roster incomplet, comptes dormants et BattleTags manquants — mais uniquement pour composer
  une relance Discord (`cron/team-roster-reminders`), et scopé à un TOURNOI. Une équipe ne pouvait
  découvrir ce qui la bloque qu'en **recevant un message**, jamais en venant regarder.
- **Résultat** : `utils/teams/teamHealth.ts` (9 constats typés, triés bloquant › avertissement ›
  accessoire), `GET /api/player/team-health` et carte `TeamHealthCard` réservée à la gestion.
  Trois règles portent la crédibilité du bloc : **aucun score agrégé** (un score se contemple, il ne
  se répare pas), **chaque ligne porte son « pourquoi »** (« 3 comptes Discord non liés » est une
  statistique ; « ces 3 personnes ne recevront aucune convocation » est un motif d'agir), et **la
  carte disparaît quand tout va bien** — un bloc qui affiche en permanence « rien à signaler »
  entraîne à ne plus le lire. Les constats croisent les trois vagues : identité, rythme (N1),
  débriefs en retard (N2), invisibilité pour les scrims.
- **Acceptation** : aucun indicateur déclaratif ; chaque ligne pointe vers une action existante.

### P1 — Intelligence : transformer les données en décisions

#### N4 · Score de compatibilité d'adversaire, expliqué — ✅ LIVRÉ

- **Impact / Effort** : 🟥 / **M**
- **Problème** : M3 — l'annuaire affiche, il ne conseille pas.
- **Proposition** : remplacer le tri-proxy par un score multi-critères **et affiché avec ses
  raisons** : créneaux réellement communs (recherche vivante, à défaut rythme récurrent N1),
  proximité de niveau (Glicko), fiabilité (R10), nouveauté (jamais/peu affrontée récemment).
  Un facteur inconnu ne pénalise pas — il est retiré et les poids sont renormalisés.
- **Acceptation** : le classement est justifié en une phrase par équipe ; une équipe sans rating
  n'est pas reléguée en fin de liste ; le score reste calculable à 2 équipes.
- **Résultat (2026-07-31)** : `utils/teams/opponentMatch.ts` (pur, testé) + intégration dans
  `GET /api/player/teams-directory` (score, facteurs, raisons machine i18n-ables) et dans
  `/player/teams` (badge de score + raisons). Le rythme N1 sert de repli quand aucune des deux
  équipes n'a d'annonce vivante — c'est ce qui rend le score utile **avant** que le réseau soit dense.

#### N5 · Dossier d'adversaire (scouting) avant un match — ✅ LIVRÉ

- **Impact / Effort** : 🟧 / **M**
- **Problème** : à J-1 d'un match, une équipe n'a aucune préparation possible depuis le site.
- **Proposition** : fiche auto-générée à partir de l'existant — historique commun, forme récente,
  adversaires communs et résultats croisés, créneaux préférés, fiabilité. Zéro saisie.
- **Résultat (2026-07-31)** : `utils/teams/scouting.ts` (pur) + `GET /api/player/scouting` + page
  `/player/scouting/[teamId]`, atteignable depuis l'annuaire **et** depuis la carte du prochain
  match — c'est là qu'on prépare une rencontre, pas dans un annuaire qu'on n'ouvre pas la veille.
- **La ligne de confidentialité, qui a décidé du reste** : ce qui vient de l'adversaire se limite à
  des **résultats**, publics et connus des deux camps — jamais ses revues (N2), jamais son rythme
  déclaré (N1), jamais son roster. Conséquence directe sur les « créneaux préférés » : ils sont
  dérivés des heures **réellement jouées**, pas d'une disponibilité déclarée. Ce qu'une équipe a
  joué est public ; ce qu'elle a déclaré ne l'est pas. En revanche, **mes** revues sur cet
  adversaire sont jointes au dossier : elles m'appartiennent, et ce sont elles la vraie matière
  d'une préparation. Un test vérifie qu'aucune revue adverse ne fuit dans la réponse.
- **Au passage** : `utils/teams/playedGames.ts` extrait la lecture « affrontements joués », que
  trois surfaces (N2, N3, N5) posaient déjà en double aux mêmes deux tables.
- **Acceptation** : accessible depuis le match et depuis l'annuaire ; masquée si l'échantillon est
  trop maigre (même règle que R10) ; jamais de donnée privée de l'adversaire.

#### N6 · Suggestion de créneau d'entraînement

- **Impact / Effort** : 🟧 / **S** (dès N1 livré)
- **Proposition** : à partir du rythme (N1), proposer le meilleur créneau récurrent non exploité
  (« vous êtes 5 le mercredi 21 h et vous ne jouez jamais ce jour-là ») et le transformer en
  entraînement récurrent ou en annonce de scrim.
- **Acceptation** : une seule suggestion à la fois, dérivée, refermable.

### P2 — Récurrence : le déclencheur de retour

#### N7 · Récap hebdomadaire d'équipe

- **Impact / Effort** : 🟥 / **M**
- **Problème** : M4 — rien ne repart vers l'équipe.
- **Proposition** : un digest hebdo (canal au choix, préférences déjà livrées) : scrims joués et
  résultats, évolution du rating, propositions en attente, créneaux du noyau non exploités, membres
  dont l'identité manque. Branché sur l'outbox et le cron existants.
- **Acceptation** : opt-out par membre ; jamais envoyé si la semaine est vide ; une seule
  notification par équipe et par semaine.

#### N8 · Progression et jalons

- **Impact / Effort** : 🟧 / **M**
- **Problème** : M7 — le rating est un chiffre sans récit.
- **Proposition** : restituer `player_rating_history` en courbe, et marquer les jalons d'équipe
  (premier scrim, 10 scrims, meilleur rating atteint, série en cours). Aucun jalon fabriqué :
  uniquement des faits dérivés.
- **Acceptation** : aucune gamification artificielle (pas de points, pas de badges décoratifs) ;
  tout jalon est vérifiable dans les données.

---

## 4. Séquencement suggéré

1. **N1** d'abord, seul : c'est la seule brique qui produit de la donnée nouvelle, et elle vaut à
   une équipe isolée. Tout le reste s'en nourrit (N4 en repli, N6 entièrement, N7 partiellement).
2. **N4** dans la foulée : pur calcul sur l'existant + N1, effet immédiat sur l'annuaire.
3. **N3 / N6** : deux dérivations peu coûteuses une fois N1 en place.
4. **N7** ensuite : le récap n'a de sens que s'il a quelque chose à raconter.
5. **N2 / N5 / N8** en dernier : ils supposent un flux de matchs et de scrims réel.

> Règle de lecture : ne rien construire dont la valeur suppose que le réseau soit déjà dense.
> C'est exactement ce qui a produit les zéros du tableau ci-dessus.
