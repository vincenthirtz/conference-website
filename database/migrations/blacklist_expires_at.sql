-- Migration: sanctions temporaires sur les blacklists (joueurs, entités)
-- Date: 2026-10-06
--
-- `player_blacklist` et `entity_blacklist` n'avaient que `active` : une
-- sanction d'un mois restait en vigueur tant que personne ne pensait à la
-- lever à la main.
--
-- `expires_at` (NULL = sans échéance, comportement historique). Une entrée
-- échue est considérée INACTIVE partout où la blacklist est vérifiée
-- (utils/moderation/blacklistExpiry.ts, prédicat central) ; le cron
-- /api/cron/blacklist-expiry bascule ensuite `active = false` et journalise
-- chaque levée dans staff_logs (`blacklist_expired` / `entity_blacklist_expired`).
--
-- Avant application, le code se replie : lectures sans la colonne, et la
-- saisie d'une échéance est refusée (503) plutôt qu'ignorée.
--
-- Idempotent.

ALTER TABLE public.player_blacklist
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.player_blacklist.expires_at IS
  'Fin de la sanction. NULL = sans échéance. Échue = inactive (levée par le cron blacklist-expiry).';

ALTER TABLE public.entity_blacklist
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.entity_blacklist.expires_at IS
  'Fin de la sanction. NULL = sans échéance. Échue = inactive (levée par le cron blacklist-expiry).';

-- Balayage du cron : entrées actives à échéance.
CREATE INDEX IF NOT EXISTS idx_player_blacklist_active_expires
  ON public.player_blacklist (expires_at)
  WHERE active AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_blacklist_active_expires
  ON public.entity_blacklist (expires_at)
  WHERE active AND expires_at IS NOT NULL;
