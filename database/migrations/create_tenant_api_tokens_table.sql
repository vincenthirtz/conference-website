-- Migration: création de `tenant_api_tokens` — tokens API publics scopés par tenant
-- Date: 2026-07-08
--
-- WHY:
--   Feature "API publique élargie (écriture + GraphQL)" — Lot 1.
--   L'écriture publique (`POST /api/public/v1/*`, mutations `/api/graphql`) doit
--   être authentifiée par un token DÉCOUPLÉ du bot Discord et des actor Discord
--   IDs. Le modèle bot (`tenant_secrets.bot_api_key_hash` + `requireBotStaff`)
--   confond « bot interne » et « orga tierce » et n'a qu'un scope binaire staff.
--   On veut ici des tokens :
--     - émis par tenant, révocables individuellement, auditables ;
--     - porteurs de scopes granulaires (`tournaments:write`, `matches:read`…) ;
--     - jamais liés à une identité Discord.
--
-- WHAT:
--   - Table `tenant_api_tokens` (N rows par tenant — un tenant peut avoir
--     plusieurs tokens : « Overlay OBS », « Script résultats », etc.).
--   - `token_hash` : sha256 hex du token (jamais le plain). Lookup inbound par
--     hash — le client envoie `Authorization: Bearer pk_live_<…>`, le site hash
--     et cherche la row. Même posture que `tenant_secrets.bot_api_key_hash`.
--   - `token_prefix` : 8 premiers chars EN CLAIR (`pk_live_a1b2c3`) pour que
--     l'admin identifie un token dans la liste sans jamais revoir le secret.
--   - `scopes` : text[] applicatif (`resource:action`). Volontairement PAS de
--     CHECK enum DB — on veut ajouter des scopes sans migration. La validation
--     vit dans `utils/apiScopes.ts`.
--   - `revoked_at` : révocation SOFT (on garde la row pour l'audit / le lookup
--     `last_used_at`). Un token révoqué a `revoked_at IS NOT NULL` → rejeté 401.
--   - `last_used_at` : bumpé en fire-and-forget à chaque requête authentifiée
--     (monitoring « token dormant / token actif »).
--   - INDEX sur `token_hash` pour le lookup inbound O(1), + INDEX sur
--     `tenant_id` pour la liste admin.
--   - RLS enabled, AUCUNE policy => service_role only (comme tenant_secrets).
--
-- POSTGREST:
--   Nouvelle table + FK -> reload schema cache (NOTIFY pgrst en fin).
--
-- CAVEATS:
--   - Idempotente : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
--   - `ON DELETE CASCADE` sur la FK : supprimer un tenant emporte ses tokens.
--   - `token_hash` est UNIQUE : une collision sha256 sur un token random 32B est
--     cryptographiquement impossible, donc une collision = signal (double
--     insertion du même plain) → on préfère l'erreur d'insert au doublon muet.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_api_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  token_hash   text NOT NULL,
  token_prefix text NOT NULL,
  name         text NOT NULL,
  scopes       text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  CONSTRAINT tenant_api_tokens_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_api_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_tokens_token_hash
  ON public.tenant_api_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_tenant_api_tokens_tenant_id
  ON public.tenant_api_tokens (tenant_id);

COMMENT ON TABLE public.tenant_api_tokens IS
  'Tokens API publics scopés par tenant (écriture REST /api/public/v1/* + mutations GraphQL). Découplés du bot Discord. Hash sha256, jamais de plain. Accès service_role uniquement.';
COMMENT ON COLUMN public.tenant_api_tokens.token_hash IS
  'sha256 hex du token. Lookup inbound : hash(Bearer token) -> row. UNIQUE.';
COMMENT ON COLUMN public.tenant_api_tokens.token_prefix IS
  'Préfixe en clair (ex. pk_live_a1b2c3) pour identifier le token en admin sans revoir le secret.';
COMMENT ON COLUMN public.tenant_api_tokens.scopes IS
  'Scopes resource:action (ex. tournaments:write). Validation applicative dans utils/apiScopes.ts — pas de CHECK enum DB volontairement.';
COMMENT ON COLUMN public.tenant_api_tokens.revoked_at IS
  'Révocation soft. Non-null => token rejeté (401). On garde la row pour l''audit.';
COMMENT ON COLUMN public.tenant_api_tokens.last_used_at IS
  'Dernière requête authentifiée par ce token (bump fire-and-forget). Monitoring token dormant.';

-- ===========================================================================
-- RLS : enabled, AUCUNE policy => service_role only.
-- ===========================================================================
ALTER TABLE public.tenant_api_tokens ENABLE ROW LEVEL SECURITY;
-- Aucune policy intentionnellement : tout passe par supabaseAdmin
-- (service_role bypass RLS). Le lint Supabase `rls_enabled_no_policy` (INFO)
-- sera positif — attendu, même pattern que tenant_secrets / bot_idempotency.

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload
-- ===========================================================================
NOTIFY pgrst, 'reload schema';
