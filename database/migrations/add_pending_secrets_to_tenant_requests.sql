-- Migration: add `pending_secrets_reveal` jsonb column to `tenant_requests`
-- Date: 2026-05-21
--
-- WHY:
--   Self-service onboarding flow (Phase 2/3) : after auto-creating a tenant
--   from a matched `pending_bot_invite` request, we need a place to stash the
--   bot API key + webhook secret in plain text so the user can fetch them
--   exactly once via /api/onboard/secrets/[token].
--
--   We don't ship the secrets in the email URL (so they don't leak in mail
--   archives / proxy logs). The reveal page receives only the
--   `secrets_reveal_token`, and the API atomically reads the JSON, then wipes
--   it via UPDATE ... WHERE secrets_revealed_at IS NULL (single-use guard).
--
-- SHAPE:
--   `pending_secrets_reveal` = { "botApiKey": "<hex>", "botWebhookSecret": "<hex>" }
--   NULL once consumed (or never written).
--
-- SECURITY:
--   - Plain text in the DB is acceptable here because the table is RLS
--     service-role only (same model as `tenant_secrets.bot_webhook_secret`).
--   - The reveal window is bounded by `secrets_reveal_token_expires_at`
--     (1h TTL, set when the tenant is auto-created). Expired or already
--     revealed tokens → API returns 410 Gone without touching the column.
--   - Single-use enforced via atomic UPDATE returning rowCount=0 on race.
--
-- IDEMPOTENT: `ADD COLUMN IF NOT EXISTS` so the migration can be re-applied.

BEGIN;

ALTER TABLE public.tenant_requests
  ADD COLUMN IF NOT EXISTS pending_secrets_reveal jsonb;

COMMENT ON COLUMN public.tenant_requests.pending_secrets_reveal IS
  'Plain-text bot secrets ({ botApiKey, botWebhookSecret }) stashed between auto-create and the single-use reveal page. Wiped to NULL on first /api/onboard/secrets/[token] hit. Acceptable in plain because the table is RLS service-role only.';

COMMIT;

NOTIFY pgrst, 'reload schema';
