-- Migration: ajouter last_post_at / last_post_status à `discord_webhooks` — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/discord_webhook_last_post.sql
--
-- WHY:
--   Le widget "Discord webhook health" du dashboard détecte un webhook qui n'a
--   plus posté depuis longtemps. Pour ça, utils/discord.ts écrit last_post_at /
--   last_post_status après chaque POST, et utils/dashboard/buildTournamentDashboard.ts
--   les lit (en best-effort : dégrade silencieusement si les colonnes manquent).
--   Ces colonnes ont été ajoutées en prod par un fichier loose jamais versionné.
--   On versionne le patch additif à l'identique pour rendre la base
--   reconstructible. Aucun changement de comportement.
--
-- WHAT:
--   - ADD COLUMN IF NOT EXISTS last_post_at timestamptz.
--   - ADD COLUMN IF NOT EXISTS last_post_status text avec CHECK ('ok'/'failed'/NULL).
--   - COMMENT documentant les deux colonnes.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS).
--   - Purement additive, aucune FK ni RLS touchée -> pas de reload du schema
--     cache PostgREST requis.
--   - Dépend de la table public.discord_webhooks (create_discord_webhooks_table.sql).

ALTER TABLE public.discord_webhooks
  ADD COLUMN IF NOT EXISTS last_post_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_post_status text NULL
    CHECK (last_post_status IN ('ok', 'failed') OR last_post_status IS NULL);

COMMENT ON COLUMN public.discord_webhooks.last_post_at
  IS 'ISO timestamp du dernier POST tenté (ok ou failed). Mis à jour par utils/discord.ts.';
COMMENT ON COLUMN public.discord_webhooks.last_post_status
  IS '"ok" si le dernier POST a renvoyé un statut HTTP 2xx, sinon "failed".';
