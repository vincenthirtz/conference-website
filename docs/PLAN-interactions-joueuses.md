# Plan : interactions joueuses, équipes et tournois (10 lots)

Date : 2026-11-07. Source : audit en lecture seule du bot (owwc-discord-bot 00f246f), de l'API
(conference-api b3982f3) et du site (work 40c12a7f5), croisé avec les plans et backlogs de `docs/`.

Esprit : relier ce qui existe plutôt qu'ajouter. Écartés car déjà refusés : chat intégré, pages
publiques de personnes, notes entre équipes, inscription payante (4 décisions de l'association en
attente), coach sur plusieurs équipes, application native.

Règles de livraison : backend dans conference-api ; migration écrite dans `database/migrations/`
et appliquée dans D1 **et** Supabase avant le déploiement de l'API ; contrat bot ↔ API tenu à jour
(`docs/BOT_API_CONTRACT.md`) ; déploiements qui touchent un soir de match faits hors soir de match.

| Lot | Titre | Taille | Dépôts | Migration |
|---|---|---|---|---|
| 1 | Corriger les bugs qui touchent déjà les joueuses | S | API, site, bot | non |
| 2 | Le bot ne laisse plus personne sans réponse | M | bot, API | non |
| 3 | Rien ne se perd quand le bot est coupé | M | API, bot, site (admin) | oui |
| 4 | Une boîte de notifications durable par joueuse | L | API, site | oui |
| 5 | Prévenir aux moments clés (dépend du 4) | M | API, site, bot | non |
| 6 | La salle de match sur le site | L | API, site | non |
| 7 | Régler un match entre capitaines | M/L | API, site, bot | oui |
| 8 | Des inscriptions que les capitaines gèrent seules | M/L | API, site | à voir |
| 9 | Trouver une équipe ou une joueuse sans quitter le site | M | API, site, bot | non |
| 10 | Joueuses non francophones | L | API, site, bot | oui |

Ordre conseillé : 1, 2, 3 (bugs et pertes), puis 4 → 5, puis 8 et 6 avant l'OWWC 2027, puis 7, 9, 10.

## Lot 1 — Corriger les bugs qui touchent déjà les joueuses

- Validation staff d'une demande pour rejoindre une équipe : même chemin que la capitaine
  (`utils/teams/addMember.ts`, annonce de la décision, `team.member.added`) ; un échec d'ajout
  (équipe pleine…) remonte au staff au lieu d'un « acceptée » silencieux.
- Validation staff d'une inscription : nombre d'équipes maximum revérifié, échecs remontés.
- Équipe « pleine » : la vraie capacité (8 joueuses, sans le staff d'équipe) dans la liste
  « rejoindre » et l'annuaire des scrims, au lieu de 5 membres.
- Match annulé : son propre état (aujourd'hui « À venir » avec l'étape de check-in). Forfait :
  libellé lisible, qui a déclaré forfait, compté dans le filtre « terminés ».
- Invitations : l'erreur dit la vraie raison (déjà traitée / déjà dans une équipe) ; la phrase
  « tu quitteras ton équipe » disparaît (contredit la règle d'une seule équipe).
- Bot : boutons de check-in et de score gardés si l'action échoue ; verdict d'un litige qui
  mentionne les deux capitaines, accents et statut lisible ; 2 tests périmés corrigés.

Fini quand : chaque cas a un test ; un litige jugé est vu par les deux capitaines.

## Lot 2 — Le bot ne laisse plus personne sans réponse

- Tout bouton, menu ou fenêtre de saisie qui échoue répond, avec une référence d'erreur.
- `/signalement`, `/inscription`, `/equipe creer|modifier` : fenêtres routées par identifiant,
  plus de formulaire perdu à un envoi lent ou un redémarrage.
- Un seul message « compte pas relié » qui propose les deux chemins ; plus de message technique
  (« Clé API rejetée », identifiants bruts).
- Managers et coachs : mêmes droits que sur le site (l'API renvoie les permissions de la personne).
- Commandes staff cachées aux joueuses ; `/help` selon le rôle ; `/report-score` nomme les équipes ;
  autocomplétion sous les 3 s de Discord.

Fini quand : aucun échec silencieux ; un manager fait sur Discord ce qu'il fait sur le site.

## Lot 3 — Rien ne se perd quand le bot est coupé

- Outbox : un événement échoue après 5 échecs de traitement signalés par le bot, ou à l'expiration
  de sa durée de vie par type (72 h par défaut, courte pour les rappels urgents) — plus « 6 h en
  attente », qui faisait tout échouer pendant une panne.
- Au retour du bot : rattrapage automatique, et récapitulatif au staff (rejoués / expirés).
- Messages privés fermés : rappel posté dans le salon privé de l'équipe avec mention ; « messages
  privés fermés » visible dans l'admin.
- Proposition de forfait au check-in : aussi en push au staff.

Fini quand : une coupure simulée de 12 h ne perd que ce qui a expiré, et le staff le sait.

## Lots 4 à 10

- **4** — Table de notifications par joueuse, alimentée par les mêmes points d'envoi, gardée au-delà
  de 7 jours ; clochette avec historique, lu / non lu, bouton d'action ; réglages qui disent quel
  canal ils pilotent (push, email, Discord).
- **5** — Inscription acceptée / refusée (avec commentaire), match planifié / déplacé, litige ouvert /
  jugé, forfait proposé / décidé (aux deux équipes), roster, règlement à valider (+ rappels), debrief
  demandé ; réglages push morts branchés ou retirés ; le bot traite `team.weekly.recap`,
  `scrim.planning.reminder`, `scrim.search.matched` ; rôles de classement en fin de tournoi ;
  formulaire de debrief sur le site.
- **6** — Pour les deux équipes : code de lobby après check-in, état du veto, pile ou face, lien du fil
  Discord ; composition en lecture pour tout le roster ; codes de replay par carte ; .ics d'un match ;
  « heure de Paris » + heure locale ; filtre « mon équipe » ; lien du salon d'équipe.
- **7** — Après une première déclaration de score : équipe adverse prévenue, rappel, alerte staff ou
  validation automatique (réglage par espace), compteur « score à déclarer » ; demande de report entre
  capitaines (négociation des scrims réutilisée) ; issue des litiges visible ; carte « à faire » unique
  après le match.
- **8** — Liste d'attente et promotion automatique ; retrait avant le début ; raison d'un refus ;
  checklist au lieu de « Rien à faire de plus » ; plusieurs tournois ouverts ; disponibilités saisies
  par les capitaines.
- **9** — « Inviter » depuis une fiche de joueuse libre, « postuler » sur une annonce (vraie demande,
  pas de messagerie) ; 2 à 3 demandes en parallèle ; managers prévenus ; demandes de scrim périmées
  expirées ; page publique d'équipe (prochains matchs, annonce, suivre, image de partage) ; boutons
  dans le message de bienvenue Discord.
- **10** — Préférence de langue par personne, langue d'équipe modifiable par la capitaine ; bot,
  push et emails traduits ; fuseau horaire dans les emails ; codes d'erreur stables traduits.
