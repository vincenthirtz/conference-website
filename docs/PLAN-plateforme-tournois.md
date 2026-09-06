# Plan — de l'outil de tournoi à la plateforme de tournois

> Établi le 2026-09-06, une **semaine avant** le coup d'envoi de la Cup 2026 (18/09 → 23/10,
> 30 matchs, 8 équipes). Périmètre : l'admin (`pages/admin/*`, `pages/api/admin/*`) et les
> utilitaires purs qui le nourrissent.
>
> Ce plan **suit** [PLAN-espace-admin.md](./PLAN-espace-admin.md) (A1–A8, livrés le 2026-09-01),
> qui a rendu l'admin utilisable. Celui-ci s'attaque à ce qui manque pour qu'il soit une
> **plateforme** : quelque chose qui connaît les règles du tournoi et qui les fait respecter,
> au lieu d'un jeu d'écrans où le staff les applique de tête.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) · M (qq h) · L (chantier).

---

## 1. Le déclencheur

Le 2026-09-06, la planification de la Cup 2026 a été refaite **à la main, hors de la plateforme** :
une simulation en HTML de six scénarios de calendrier, pour satisfaire une contrainte d'équipe
(« Hinode Sparkles ne joue pas avant 21 h, et pas du 18 au 20 ni du 25 au 27 septembre ») et en
vérifier les effets de bord (aucune équipe qui joue deux fois le même soir, aucune date hors
mercredi/vendredi, aucune affiche perdue).

Chaque information nécessaire à ce calcul existe en base — sauf une : **la contrainte elle-même**.
Elle vivait dans un message Discord. C'est le trou : la plateforme sait *quand* un match a lieu,
jamais *quand il a le droit* d'avoir lieu. Tout le reste en découle — le staff arbitre de mémoire,
un déplacement de match se fait sans savoir ce qu'il casse, et la vérification finale se refait
à la main à chaque changement.

**État des lieux mesuré** (prod, 2026-09-06) :

| Rail | Valeur |
|---|---|
| Cup 2026 | 30 matchs, tous datés, 1 stage (`round_robin`), 2 finales hors stage |
| Auto-scheduler | existe (`utils/matches/autoScheduler.ts`, 587 l.), branché sur la page matchs |
| Ce qu'il connaît | fenêtres horaires, durée des BO, repos entre deux matchs, double-booking |
| Ce qu'il ignore | **toute contrainte propre à une équipe** |
| Vue calendrier des matchs | **aucune** (les scrims en ont une, avec drag & drop) |
| Départage du classement | points → diff de score → victoires → seed. **Pas de confrontation directe** |
| Quand un match bouge | événement bot émis ; **les équipes ne sont pas prévenues par la plateforme** |

---

## 2. Séquencement

Trois colonnes vertébrales. Une plateforme de tournois **planifie**, **arbitre**, et **tient les
participants au courant** — dans cet ordre, parce que chacune s'appuie sur la précédente.

| Lot | Titre | Impact | Effort | Statut |
|---|---|---|---|---|
| **1** | Contraintes de disponibilité — le modèle | 🟥 | M | ✅ |
| **2** | Saisie des contraintes en admin | 🟥 | M | ✅ |
| **3** | Diagnostic de planning (« ça passe ou ça pouet ») | 🟥 | M | ✅ |
| **4** | Le calendrier des matchs | 🟧 | L | ✅ |
| **5** | Déplacer un match avec aperçu d'impact | 🟥 | M | ✅ |
| **6** | Auto-scheduler contraint + simulation | 🟧 | M | ✅ |
| **7** | Départage du classement (confrontation directe) | 🟧 | M | ✅ |
| **8** | Rôles Discord automatiques par classement (T3) | 🟧 | S | ✅ (site) |
| **9** | Prévenir les équipes quand leur match bouge | 🟥 | M | ✅ |
| **10** | Couverture e2e du nouveau chemin + vérification prod | 🟧 | M | ✅ |

---

## Lot 1 · Contraintes de disponibilité — le modèle

**Problème.** Une contrainte d'équipe n'a nulle part où être écrite.

**Proposition.** Une table `team_availability_constraints` et une **logique pure** qui répond à
une seule question : *ce match, à cette date, viole-t-il une contrainte ?*

Quatre natures de contrainte, parce que ce sont les quatre qui sont réellement apparues :

- `blackout` — indisponible d'une date à une autre (inclusives) ;
- `earliest` — aucun match qui **commence** avant telle heure ;
- `latest` — aucun match qui commence après telle heure ;
- `weekday` — indisponible tel(s) jour(s) de la semaine.

Portée : une contrainte vaut pour une équipe, et **optionnellement** pour un seul tournoi
(`tournament_id NULL` = vaut partout). Fuseau porté par la contrainte : « avant 21 h » est une
heure murale, pas un instant.

**Critères d'acceptation**
- [ ] Migration idempotente, RLS activée, scopée `tenant_id`.
- [ ] `utils/matches/availability.ts` pur (aucun accès DB), violations typées.
- [ ] Correct autour des bascules d'heure d'été (test sur le 25/10/2026).
- [ ] Tests unitaires sur les quatre natures + les cas limites (bornes inclusives, minuit).

---

## Lot 2 · Saisie des contraintes en admin

**Proposition.** CRUD complet derrière la permission équipes, dans la fiche équipe admin, plus une
route de lecture groupée par tournoi (celle que consommeront les lots 3 à 6).

**Critères d'acceptation**
- [ ] `GET/POST/PATCH/DELETE /api/admin/teams/[teamId]/availability`, journalisé.
- [ ] `GET /api/admin/tournament/[id]/availability` — toutes les contraintes des équipes engagées.
- [ ] Validation zod : dates cohérentes, heures valides, fuseau IANA existant.
- [ ] Panneau dans la fiche équipe, formulaire par nature de contrainte.

---

## Lot 3 · Diagnostic de planning

**Proposition.** L'écran qui rend la simulation HTML inutile : pour un tournoi, la liste de **tout
ce qui cloche** dans le calendrier actuel — contrainte violée, équipe qui joue deux fois le même
soir, match hors des dates du tournoi, créneau à deux matchs — et, quand la correction est triviale
(un créneau libre le même soir qui respecte tout), le geste proposé.

**Critères d'acceptation**
- [ ] `utils/matches/scheduleDiagnostics.ts` pur : `diagnoseSchedule(matches, constraints, options)`.
- [ ] Chaque anomalie porte sa gravité, son match, l'équipe concernée, et l'explication en clair.
- [ ] Les corrections triviales sont proposées, jamais appliquées d'office.

---

## Lot 4 · Le calendrier des matchs

**Proposition.** La vue mois/semaine des matchs d'un tournoi, avec les anomalies du lot 3
surlignées et les jours d'indisponibilité grisés. Lecture seule ici ; le lot 5 la rend agissante.

---

## Lot 5 · Déplacer un match avec aperçu d'impact

**Proposition.** Avant d'écrire, montrer : **ce que le déplacement répare, ce qu'il casse**. Un
déplacement de match n'est jamais local — c'est la leçon de la simulation du 06/09.

---

## Lot 6 · Auto-scheduler contraint + simulation

**Proposition.** Brancher les contraintes dans `autoScheduleMatches`, et ajouter un mode
**simulation** : le planning proposé revient en réponse sans rien écrire.

---

## Lot 7 · Départage du classement

**Problème.** Le classement round-robin/poule trie par points → différence de score → victoires →
seed. La **confrontation directe** manque, alors que c'est le premier départage de la quasi-totalité
des règlements. Et rien n'indique aux équipes par quoi elles ont été départagées.

---

## Lot 8 · Rôles Discord automatiques par classement

Ticket **T3** de [BACKLOG-tournois.md](./BACKLOG-tournois.md).

---

## Lot 9 · Prévenir les équipes quand leur match bouge

**Problème.** Un `scheduled_at` qui change émet un événement bot ; aucune notification n'atteint les
deux équipes concernées, et l'historique des déplacements d'un match n'est pas lisible.

---

## Lot 10 · Couverture e2e + vérification — ✅ LIVRÉ

**Ce qui est couvert, et par quoi.**

| Niveau | Fichier | Ce qu'il garde |
|---|---|---|
| Pur | `tests/unit/matchAvailability.test.ts` (40) | Les quatre natures de contrainte, les bornes inclusives, l'heure murale, la bascule d'heure d'hiver du 25/10/2026 |
| Pur | `tests/unit/scheduleDiagnostics.test.ts` (24) | Les six anomalies, la correction triviale, l'aperçu d'impact d'un échange |
| Pur | `tests/unit/stageTiebreakers.test.ts` (18) | La cascade de départage, **et le fait que la Cup 2025 ne bouge pas** |
| Pur | `tests/unit/placementRoles.test.ts` (20) | Les plages de rangs, le cumul de rôles, l'écart d'une règle illisible |
| Pur | `tests/unit/autoScheduler.test.ts` (+5) | L'auto-scheduler qui refuse un créneau interdit plutôt que de le poser |
| Pur | `tests/unit/matchRescheduledNotification.test.ts` (7) | Les trois canaux, et ce que chacun écrit |
| Route | `tests/unit/apiAdminScheduling.test.ts` (19) | Scope tenant, validation, **et le refus 409 d'un déplacement bloquant** |
| e2e | `tests/e2e/admin-schedule-gating.spec.ts` (5) | Que les écrans et endpoints neufs ne sont pas ouverts |

**Vérifications réelles menées.**

1. Le diagnostic tourné sur les **30 vrais matchs de la Cup 2026 en production** retrouve
   les 4 matchs de Hinode hors contrainte, propose le décalage gratuit du 21/10 vers 22 h,
   et signale la double soirée de LVN EMBERS du 16/10 — les trois constats de la simulation
   manuelle du 06/09, à l'identique.
2. Le départage recalculé sur la **Cup 2025** (seul classement de poule terminé en base) rend
   exactement le classement publié : les trois équipes à 3 points forment un cycle parfait,
   la confrontation directe ne tranche rien, la différence de score garde l'ordre.
3. Les deux migrations sont **appliquées en production** et vérifiées (les formes invalides
   sont refusées par le CHECK).
4. Serveur de dev lancé : les quatre routes neuves répondent — la page redirige vers la
   connexion, les GET rendent 401, le POST rend 403 (garde CSRF avant l'authentification).

**Écart assumé.** Le parcours fonctionnel e2e (saisir une contrainte → lire le diagnostic →
appliquer une correction) demande une Supabase **locale** : le garde-fou de
`tests/utils/supabaseTestClient.ts` refuse en absolu de seeder la production, et c'est la
bonne règle. Consigné en Q027 dans [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md).

**Reste à faire pour que tout ceci serve la Cup 2026** : saisir les contraintes réelles de
Hinode dans sa fiche équipe. Tant qu'elles ne sont pas en base, le diagnostic ne peut rien
vérifier de ce côté — il dit d'ailleurs explicitement qu'aucune contrainte n'est déclarée.

---

## 3. Ce qu'on ne fait pas

- **Un solveur de calendrier complet.** La simulation du 06/09 a montré qu'une grille à 28 matchs
  pour 30 places n'a pas de solution « optimale » évidente — elle a des arbitrages. La plateforme
  doit *montrer* les arbitrages, pas les trancher seule.
- **Les contraintes saisies par les équipes elles-mêmes.** Le staff les saisit d'abord ; on ouvrira
  aux capitaines quand le modèle aura vécu une saison.
- **Les inscriptions payantes (T6).** Chantier argent, à part.

## 4. Vérification

`npm run verify` avant chaque commit. Tout lot touchant un endpoint met à jour
[`openapi.yaml`](./openapi.yaml) + [BOT_API_CONTRACT.md](./BOT_API_CONTRACT.md) et garde vert
`tests/unit/openapiContractDrift.test.ts`.
