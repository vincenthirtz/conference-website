# Audit — flow inscription joueur & équipe (2026-07-02)

Audit de correction (bugs) sur tout le parcours : inscription → création/rejoindre/gérer une équipe → transfert → check-in. Menée par revue statique (handlers API + UI + machine à états `demandes`) croisée avec la suite e2e et **vérifiée contre la base de prod** (`yhfdhpqgmazfxyyklomp`).

## Racine des bugs majeurs

`team_members` avait `UNIQUE (team_id, user_id)` (pas de doublon dans la **même** équipe) mais **aucune** unicité sur `(tenant_id, user_id)` → un joueur pouvait se retrouver dans **deux équipes** via les courses *check-then-insert* des handlers (join/transfer/invite non atomiques). Une fois en 2 équipes, les nombreux `.select().eq('user_id').maybeSingle()` levaient `PGRST116` (500) → joueur **soft-locké** (ne peut plus quitter/être transféré). La capacité `max_players` était déjà protégée par un trigger (race-safe).

## Corrigé

### DB — `database/migrations/add_team_membership_integrity.sql` (appliquée en prod)
- **`UNIQUE (tenant_id, user_id)`** sur `team_members` : invariant dur « un joueur = une seule équipe / tenant » (0 violation existante au moment de l'ajout). Toute course multi-équipe devient un `23505` déterministe.
  > **Amendé le 2026-08-20** (`allow_manager_multi_team.sql`) : la contrainte est devenue un **index unique partiel de même nom**, `WHERE role IS DISTINCT FROM 'manager'`. Un manager peut encadrer plusieurs équipes ; joueuses, subs et coachs restent couverts, et les `23505` gardent le même nom d'index. Corollaire traité dans la même passe : les `.maybeSingle()` sur `(user_id, tenant_id)` — la cause du « joueur soft-locké » décrit plus haut — passent tous par `utils/teams/memberships.ts`. Voir `MANAGER_MULTI_EQUIPES.md`.
- **3 fonctions PL/pgSQL transactionnelles** (`SECURITY DEFINER`, EXECUTE réservé à `service_role` — `PUBLIC`/`anon`/`authenticated` explicitement révoqués) :
  - `approve_join_request(p_demande_id)` — verrou `FOR UPDATE` + CAS statut + INSERT membre, atomique.
  - `approve_transfer_request(p_demande_id)` — résout l'appartenance **réelle** (pas `payload.from_team_id`), DELETE+INSERT+statut atomiques ; idempotent si déjà dans la cible.
  - `accept_invitation(p_demande_id, p_user_id)` — vérifie l'invité, INSERT + statut, atomique.
  - Rôles privilégiés (`manager`) coercés vers `player` côté SQL.

### API (handlers câblés sur les RPC + gardes)
- `teams/join-requests.ts`, `teams/transfer-requests.ts`, `utils/teams/invitations.ts` : délèguent l'étape critique aux RPC (fin des séquences non atomiques et du statut incohérent). Mapping d'erreurs centralisé dans `utils/teams/rpcErrors.ts` (23505→409, 23514→400, sentinelles message→404/400/409/403).
- **Roster-lock** désormais vérifié avant `approve` (join + transfer), comme `add-member`/`invite`.
- `teams/transfer-captain.ts` : exclut le rôle `coach` du capitanat + UPDATE en CAS sur `captain_id` (409 si déjà transféré).
- `teams/leave.ts` : le **capitaine seul membre** peut désormais quitter → dissolution de l'équipe (soft-delete + event `team.dissolved` avec les IDs Discord pour le nettoyage bot). Fin du cul-de-sac.
- `teams/create-with-member.ts` : rejette 400 si des membres sont fournis sans capitaine désigné (plus d'équipe orpheline).
- `demandes/cancel.ts` : annulation en CAS (`status='pending'` dans le WHERE) → 409 si déjà traitée (fin du TOCTOU cancel↔approve).
- `auth/register.ts` + `register.tsx` : regex BattleTag unifiée sur `BATTLE_TAG_REGEX` (`/^[A-Za-z0-9]{2,}#[0-9]{3,6}$/`).

### UI
- `NewTeamForm.tsx` remonte sa validité (`onValidityChange`) + regex BattleTag canonique → `request-captain` (mode « nouvelle équipe ») ne soumet plus malgré une erreur affichée.
- Gardes anti double-submit (`if (submitting) return;`) sur `request-captain`/`join-team`/`requests` + `disabled` harmonisés.
- `join-team` : état « tu fais déjà partie de X » (via `useManagedTeam`) au lieu d'un formulaire de join incohérent.
- `/team/create` : prop `seo` ajoutée (og/twitter/canonical corrects).

## Résiduels / backlog

### Résiduels TRAITÉS (2ᵉ passe)
- **`transfer-captain` — atomicité totale** : RPC dédiée `transfer_captain(p_team_id, p_new_captain, p_tenant, p_actor)` (`database/migrations/add_transfer_captain_function.sql`, appliquée en prod) — `FOR UPDATE` sur `teams` + `EXISTS(membre non-coach)` + `UPDATE` en une transaction ; le handler délègue et mappe les exceptions (`team_not_found`/`not_captain`/`same_user`/`target_not_member`). Plus de TOCTOU ni de coach-capitaine.
- **Check-in — validation charset** : `resolveCheckinToken` rejette tout token hors `^[A-Za-z0-9_-]+$` avant la requête `.or()` (défense injection filtre PostgREST).
- **`min_players` — coachs exclus** : les deux chemins (`demandes/register-team`, `teams/create-with-member`) comptent désormais les joueurs (player+substitute) hors coach. Les deux tables de capacité (`tournament_teams` vs `stage_teams`) sont **volontairement** distinctes (concepts différents) — non fusionnées.
- **Multi-tenant — résolution user-level** : nouveau `resolveTenantIdForUserRequestAsync(req, {authUserId})` (tenant = équipe du user, fallback path-prefix → `DEFAULT_TENANT_ID`), câblé dans **22 handlers authentifiés** du flow (`teams/*`, `demandes/*`, `player/invitations/*`). Neutre aujourd'hui (mono-tenant), correct pour un 2ᵉ tenant.

### Résiduels restants (décision / hors périmètre)
- **Exemption coach** : décision = **on garde l'unicité stricte** `UNIQUE(tenant_id, user_id)` (coach inclus). Autoriser un coach multi-équipe rouvrirait le bug multi-lignes (`.maybeSingle()` → 500) et demanderait un audit complet ; non souhaité (aucune donnée de ce type).
- **Multi-tenant — endpoints publics + handlers hors flow** : `create-with-member`, `checkin/[token]` et les routes hors flow restent sur les stubs sync (path-prefix Phase 3). Le passage du header tenant en REQUIRED reste piloté par Phase 3.

## Vérification

- `tsc --noEmit` ✓ · `eslint` ✓ · `vitest` : 3885 passés, 2 skipped, 1 échec **pré-existant** (`openapiContractDrift`, repo bot sibling absent de l'env — sans rapport).
- Fonctions RPC + contrainte smoke-testées en base (existence, grants `service_role` only, garde `demande_not_found`).
- **e2e** : la suite du flow n'a pas révélé de bug produit ; les échecs locaux viennent du **setup des specs** (`supabaseTestClient` ne crée pas la fixture équipe → cascade `describe.serial`), pas du code. Limitation d'environnement local.
