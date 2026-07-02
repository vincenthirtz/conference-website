# Audit — flow inscription joueur & équipe (2026-07-02)

Audit de correction (bugs) sur tout le parcours : inscription → création/rejoindre/gérer une équipe → transfert → check-in. Menée par revue statique (handlers API + UI + machine à états `demandes`) croisée avec la suite e2e et **vérifiée contre la base de prod** (`yhfdhpqgmazfxyyklomp`).

## Racine des bugs majeurs

`team_members` avait `UNIQUE (team_id, user_id)` (pas de doublon dans la **même** équipe) mais **aucune** unicité sur `(tenant_id, user_id)` → un joueur pouvait se retrouver dans **deux équipes** via les courses *check-then-insert* des handlers (join/transfer/invite non atomiques). Une fois en 2 équipes, les nombreux `.select().eq('user_id').maybeSingle()` levaient `PGRST116` (500) → joueur **soft-locké** (ne peut plus quitter/être transféré). La capacité `max_players` était déjà protégée par un trigger (race-safe).

## Corrigé

### DB — `database/migrations/add_team_membership_integrity.sql` (appliquée en prod)
- **`UNIQUE (tenant_id, user_id)`** sur `team_members` : invariant dur « un joueur = une seule équipe / tenant » (0 violation existante au moment de l'ajout). Toute course multi-équipe devient un `23505` déterministe.
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

- **`transfer-captain` atomicité partielle** : pré-check (exclusion coach) + CAS sur `captain_id`, plutôt qu'un seul `UPDATE ... WHERE EXISTS(member valide)` (impossible via PostgREST/mock sans sous-requête corrélée). Fenêtre TOCTOU minime (la cible devrait quitter entre le pré-check et l'UPDATE) ; pire cas = `captain_id` pointant un non-membre, surfacé au prochain transfert/leave. **Fix complet possible** : une RPC `transfer_captain(team, new, tenant)` conditionnelle.
- **Multi-tenant latent** : `resolveTenantIdForUserRequest`/`resolveTenantIdForPublicRequest` renvoient toujours `DEFAULT_TENANT_ID`. Intentionnel en mono-tenant ; **à corriger avant le 2ᵉ tenant** (sinon fuite/écriture cross-tenant).
- **Exemption coach** : `UNIQUE(tenant_id, user_id)` interdit aussi à un coach d'être sur plusieurs équipes. Si le métier le veut, remplacer par un index partiel `WHERE role <> 'coach'`.
- **Check-in** : `resolveCheckinToken` interpole le token dans un filtre PostgREST `.or()` sans valider le charset (tokens base64url → sûrs en pratique ; ajouter une validation `^[A-Za-z0-9_-]+$` par défense).
- **`min_players`/capacité** : compté sur `tournament_teams` (register-team) vs `stage_teams` (create-with-member), et `min_players` inclut les coachs dans un chemin → unifier la source de vérité.

## Vérification

- `tsc --noEmit` ✓ · `eslint` ✓ · `vitest` : 3868 passés, 2 skipped, 1 échec **pré-existant** (`openapiContractDrift`, repo bot sibling absent de l'env — sans rapport).
- Fonctions RPC + contrainte smoke-testées en base (existence, grants `service_role` only, garde `demande_not_found`).
- **e2e** : la suite du flow n'a pas révélé de bug produit ; les échecs locaux viennent du **setup des specs** (`supabaseTestClient` ne crée pas la fixture équipe → cascade `describe.serial`), pas du code. Limitation d'environnement local.
