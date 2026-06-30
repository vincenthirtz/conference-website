# Backlog — fonctionnalités tournois (veille concurrentielle)

> Issu de l'analyse concurrentielle de juin 2026 (Toornament, Challonge, start.gg, Battlefy, Dragora).
> Chaque ticket est ancré sur une pratique **vérifiée** chez un concurrent et exploite l'existant du site
> (check-in, système de litiges, bot Discord + role-sync, `user_discord_links`, HelloAsso, OpenAPI bot).
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S / M / L.

## Vue d'ensemble

| # | Ticket | Impact | Effort | Inspiré de |
|---|---|---|---|---|
| T1 | Self-report de score joueur + escalade litige | 🟥 | M | Challonge, Dragora |
| T2 | Auto-DQ des no-shows au check-in | 🟥 | S | start.gg, Dragora |
| T3 | Rôles Discord auto par classement | 🟧 | S | Dragora |
| T4 | Canal Discord privé par match | 🟧 | M | Dragora |
| T5 | API lecture publique (brackets / standings / matchs) | 🟧 | M | start.gg GraphQL |
| T6 | Inscriptions payantes 0 % commission | 🟧 | M | Toornament Community |
| T7 | Embed de bracket (iframe) | 🟩 | M | Challonge |

---

## P1 — à faire en priorité

### T1 · Self-report de score joueur + escalade litige
- **Impact / Effort** : 🟥 / M
- **Réf concurrent** : Challonge (report orga **+ self-report** participant, vérifié 3-0) ; Dragora (boutons « I Won » / « I Lost », litiges escaladés aux modérateurs, 3-0).
- **Problème** : aujourd'hui les scores sont saisis par le staff ; charge manuelle et goulot d'étranglement sur les gros brackets.
- **Proposition** : permettre aux deux équipes d'un match de rapporter leur résultat depuis l'espace joueur / le bot Discord. Si les deux reports concordent → score validé automatiquement. S'ils divergent (ou time-out) → bascule sur le **système de litiges existant** (`disputes`) pour arbitrage staff.
- **Critères d'acceptation** :
  - [ ] Un capitaine peut soumettre un score pour un match où son équipe joue.
  - [ ] Deux reports concordants valident le match sans intervention staff.
  - [ ] Reports divergents → litige créé automatiquement, visible dans `/admin/disputes`.
  - [ ] Idempotence sur la soumission (pas de double-report).
  - [ ] Journalisation : qui a rapporté quoi, quand.
- **Zones touchées** : `pages/api/.../matches` (report endpoint), espace capitaine, bot Discord (commande/bouton), table `disputes`, espace `/admin/matches`.
- **Dépendances** : système de litiges (existant).

### T2 · Auto-DQ des no-shows au check-in
- **Impact / Effort** : 🟥 / S
- **Réf concurrent** : start.gg (check-in obligatoire, **DQ/retrait auto des non-checkés** pour ne pas bloquer le bracket, 3-0) ; Dragora (auto-DQ au timeout, 3-0).
- **Problème** : le check-in existe mais un participant non checké peut bloquer la génération/progression du bracket ; retrait manuel par le staff.
- **Proposition** : à la fermeture de la fenêtre de check-in, marquer automatiquement DQ/retirées les équipes non checkées, avec notification et fenêtre de grâce configurable.
- **Critères d'acceptation** :
  - [ ] Fenêtre de check-in configurable (début/fin) par tournoi.
  - [ ] À l'échéance, les non-checkés passent en `no_show`/DQ automatiquement.
  - [ ] Action réversible par le staff (annuler un DQ) avant génération du bracket.
  - [ ] Notification (site + Discord) aux équipes DQ.
  - [ ] Log d'audit des DQ automatiques.
- **Zones touchées** : flux check-in (`pages/admin/tournament/[id]/checkin.tsx` + API), cron/scheduled function Netlify, notifications.
- **Dépendances** : check-in (existant), système de notifications (existant).

---

## P2 — fort intérêt, après P1

### T3 · Rôles Discord auto par classement
- **Impact / Effort** : 🟧 / S
- **Réf concurrent** : Dragora (rôles Discord auto 1er / 2e / 3e / Top 8 / participant, 3-0).
- **Problème** : pas de reconnaissance Discord automatique post-tournoi → engagement perdu.
- **Proposition** : à la clôture d'un tournoi, attribuer via le bot des rôles Discord selon le classement final (configurables par serveur/tournoi).
- **Critères d'acceptation** :
  - [ ] Mapping configurable classement → rôle Discord (1er, 2e, 3e, Top 8, participant).
  - [ ] Attribution déclenchée à la finalisation du tournoi.
  - [ ] Idempotent (re-run sans doublon), retrait/rollback possible.
  - [ ] Gère l'absence de lien Discord d'un joueur (skip + log).
- **Zones touchées** : bot Discord (role-sync existant), `user_discord_links`, finalisation tournoi.
- **Dépendances** : role-sync + `user_discord_links` (existants).

### T4 · Canal Discord privé par match
- **Impact / Effort** : 🟧 / M
- **Réf concurrent** : Dragora (un canal privé par match, check-in + report dedans, nettoyage auto, 3-0).
- **Problème** : la coordination des matchs se fait hors plateforme, sans trace.
- **Proposition** : créer automatiquement un canal Discord privé par match (joueurs des 2 équipes + staff), avec check-in/report intégrés (cf. T1), puis archivage/nettoyage auto à la fin.
- **Critères d'acceptation** :
  - [ ] Canal créé à l'activation du match, accès limité aux participants + staff.
  - [ ] Boutons report (réutilise T1) postés dans le canal.
  - [ ] Archivage/suppression auto après clôture du match.
  - [ ] Pas de fuite de canaux orphelins (réconciliation).
- **Zones touchées** : bot Discord (match-thread existant), endpoints match.
- **Dépendances** : T1 (report), match-thread (existant).

### T5 · API lecture publique (brackets / standings / matchs)
- **Impact / Effort** : 🟧 / M
- **Réf concurrent** : start.gg (API GraphQL publique : events, standings, entrants, phases, seeding, résultats, historiques, 3-0 / 2-1).
- **Problème** : aucune API publique → impossible pour des tiers de construire overlays stream / widgets.
- **Proposition** : exposer une API **lecture seule** (REST, clé API ou public read) pour brackets, standings, matchs d'un tournoi. Réutiliser l'infra OpenAPI déjà en place pour le bot.
- **Critères d'acceptation** :
  - [ ] Endpoints lecture : tournoi, phases/bracket, standings, matchs/résultats.
  - [ ] Documentés dans `openapi.yaml` + `BOT_API_CONTRACT.md` (règle de sync du repo).
  - [ ] Rate-limit + scoping (pas de données privées/PII exposées).
  - [ ] Tests contractuels (openapiContractDrift) verts.
- **Zones touchées** : `pages/api/` (nouveaux endpoints publics), `docs/openapi.yaml`, `docs/BOT_API_CONTRACT.md`.
- **Dépendances** : infra OpenAPI (existante).

### T6 · Inscriptions payantes 0 % commission
- **Impact / Effort** : 🟧 / M
- **Réf concurrent** : Toornament Community (inscriptions payantes **0 % de commission** Toornament, 3-0).
- **Problème** : pas de flux d'inscription payante packagé ; argument différenciant face aux concurrents qui prennent une marge.
- **Proposition** : packager une inscription payante par tournoi via HelloAsso (déjà intégré), sans commission plateforme, avec réconciliation paiement ↔ inscription.
- **Critères d'acceptation** :
  - [ ] Un tournoi peut activer une inscription payante (montant configurable).
  - [ ] Paiement via HelloAsso, statut inscription mis à jour à la confirmation.
  - [ ] Gestion remboursement / annulation documentée.
  - [ ] Aucune commission prélevée par la plateforme (argument marketing).
- **Zones touchées** : intégration HelloAsso, flux inscription tournoi, webhooks paiement.
- **Dépendances** : HelloAsso (existant).

---

## P3 — opportuniste

### T7 · Embed de bracket (iframe)
- **Impact / Effort** : 🟩 / M
- **Réf concurrent** : Challonge (embed de brackets, thèmes custom en payant, 3-0).
- **Problème** : pas de moyen simple d'afficher un bracket sur un site/stream tiers → perte de visibilité virale.
- **Proposition** : page/widget embeddable (iframe) affichant un bracket en lecture seule, responsive, avec thème clair/sombre. S'appuie idéalement sur T5.
- **Critères d'acceptation** :
  - [ ] URL d'embed publique par tournoi, en lecture seule.
  - [ ] Rendu responsive + thème, headers autorisant l'iframing (CSP `frame-ancestors`).
  - [ ] Pas de données privées exposées.
- **Zones touchées** : nouvelle route publique, CSP (`proxy.ts` / headers Netlify).
- **Dépendances** : T5 recommandé.

---

## Notes de cadrage
- **À NE PAS reprendre comme acquis** (réfuté par la vérification) : Battlefy « $99/mois white-label », start.gg « % de commission », Toornament « 500+ disciplines », pricing exact de Dragora.
- **À reconfirmer** (non vérifié faute de quota) : détails registration fees Toornament, gap seeding Challonge, ladders FACEIT, Scrim Finder.
- **Forces déjà en place** (ne pas réinventer) : négociation de scrims multi-créneaux, run-of-show/director, bot Discord + free players + ticketing, linking Discord, check-in, formats Swiss + two-stage.
