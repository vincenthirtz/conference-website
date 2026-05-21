-- Migration: création de `tenant_secrets` — secrets bot par tenant
-- Date: 2026-05-21
--
-- WHY:
--   Aujourd'hui `BOT_API_KEY` et `BOT_WEBHOOK_SECRET` sont des secrets GLOBAUX
--   chargés via env (`process.env.BOT_API_KEY`). Pour passer en multi-tenant
--   propre, on veut :
--     - une clé API distincte par tenant (rotation indépendante) ;
--     - un secret HMAC distinct par tenant pour le signing site -> bot push.
--   L'env reste comme fallback transitoire (Phase X) le temps que tous les
--   tenants soient seedés et que le bot envoie systématiquement `x-tenant-id`.
--
-- WHAT:
--   - Table `tenant_secrets` (PK = tenant_id, 1 row par tenant max).
--   - `bot_api_key_hash` : sha256 hex du token (jamais le plain texte). Lookup
--     inbound par hash : le site reçoit le header `x-bot-api-key: <token>`,
--     hash localement, cherche le tenant correspondant.
--   - `bot_webhook_secret` : plain HMAC secret pour signer les push site -> bot.
--     Stocké en plain car la table est RLS service-role only (équivalence
--     sécurité au .env). Pas de double-hash : on a besoin du secret en clair
--     côté site pour calculer le HMAC.
--   - INDEX sur `bot_api_key_hash` pour le lookup inbound O(1).
--   - RLS enabled, AUCUNE policy => seul `supabaseAdmin` (service_role) y
--     accède.
--   - PAS de backfill SQL : le seed du tenant conference se fait via l'admin
--     endpoint à créer ensuite (génération crypto random côté Node + insert
--     atomique).
--
-- POSTGREST:
--   Nouvelle table + FK -> reload schema cache (NOTIFY pgrst en fin).
--
-- CAVEATS:
--   - Idempotente : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
--   - `ON DELETE CASCADE` sur la FK : si on supprime un tenant, ses secrets
--     partent avec — comportement souhaité (pas d'orphan secrets).
--   - L'index `idx_tenant_secrets_api_key_hash` ne couvre PAS l'unicité —
--     deux tenants avec la même clé API hash devraient être impossibles en
--     pratique (sha256 sur token random 32+ bytes). Si on veut blinder, on
--     pourra ajouter UNIQUE (bot_api_key_hash) plus tard (collision = signal
--     d'attaque, pas de bug applicatif).
--   - Pas d'`updated_at` : on a `rotated_at` qui sert le même rôle avec une
--     sémantique plus claire (à mettre à jour à chaque rotation).

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_secrets (
  tenant_id          uuid PRIMARY KEY,
  bot_api_key_hash   text NOT NULL,
  bot_webhook_secret text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  rotated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_secrets_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_secrets_api_key_hash
  ON public.tenant_secrets (bot_api_key_hash);

COMMENT ON TABLE public.tenant_secrets IS
  'Secrets bot par tenant : hash sha256 de la clé API (lookup inbound) + secret HMAC plain pour signing site->bot. Accès service_role uniquement.';
COMMENT ON COLUMN public.tenant_secrets.bot_api_key_hash IS
  'sha256 hex de la clé API bot. Lookup inbound : hash(header x-bot-api-key) -> tenant_id.';
COMMENT ON COLUMN public.tenant_secrets.bot_webhook_secret IS
  'Secret HMAC plain (équivalent .env BOT_WEBHOOK_SECRET) pour signer les push site->bot. Plain car la table est RLS service-role only.';
COMMENT ON COLUMN public.tenant_secrets.rotated_at IS
  'Dernière rotation du couple (api_key_hash, webhook_secret). Sert au monitoring "clé non rotée depuis N jours".';

-- ===========================================================================
-- RLS : enabled, AUCUNE policy => service_role only.
-- ===========================================================================
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
-- Aucune policy intentionnellement : toute lecture/écriture passe par
-- supabaseAdmin (service_role bypass RLS). Le lint Supabase
-- `rls_enabled_no_policy` (INFO) sera positif sur cette table — c'est
-- attendu, même pattern que bot_idempotency / bot_event_outbox / etc.

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload
-- ===========================================================================
NOTIFY pgrst, 'reload schema';
