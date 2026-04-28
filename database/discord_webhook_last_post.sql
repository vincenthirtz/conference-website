-- database/discord_webhook_last_post.sql
-- Migration optionnelle pour activer le widget "Discord webhook health" du dashboard.
-- Sans cette migration, le dashboard affiche uniquement le statut de configuration
-- (configuré / actif / manquant) sans pouvoir détecter un webhook qui n'a plus
-- posté depuis longtemps.
--
-- À appliquer côté Supabase (SQL Editor) ; le code lit ces colonnes en best-effort
-- (dégrade silencieusement si elles n'existent pas).

ALTER TABLE public.discord_webhooks
  ADD COLUMN IF NOT EXISTS last_post_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_post_status text NULL
    CHECK (last_post_status IN ('ok', 'failed') OR last_post_status IS NULL);

COMMENT ON COLUMN public.discord_webhooks.last_post_at
  IS 'ISO timestamp du dernier POST tenté (ok ou failed). Mis à jour par utils/discord.ts.';
COMMENT ON COLUMN public.discord_webhooks.last_post_status
  IS '"ok" si le dernier POST a renvoyé un statut HTTP 2xx, sinon "failed".';
