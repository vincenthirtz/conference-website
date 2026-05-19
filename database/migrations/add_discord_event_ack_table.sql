-- Migration: discord_event_ack
--
-- Persiste les event_ids déjà traités par le bot Discord. Avant cette table,
-- le bot maintenait juste un Set en mémoire (event-dispatch.js handledEventIds)
-- qui se vidait au reboot. Conséquence : un event arrivé via le webhook
-- avant reboot, mais non encore ack-é dans bot_event_outbox (car le webhook
-- n'ack pas directement), était re-dispatché au prochain poll du poller.
-- Side-effect double (DM, thread, role) au reboot.
--
-- Cette table sert de claim distribué : avant de dispatch, le bot tente un
-- INSERT. Si l'insert réussit (wasNew=true), le bot peut dispatch. Si conflit
-- (wasNew=false), l'event est déjà handled — skip dispatch + ack-only.
--
-- TTL : aucune purge automatique (la table reste petite : ~quelques milliers
-- par mois, ~100 bytes par row). Une purge périodique sur handled_at <
-- now() - 7d peut être ajoutée si besoin.

CREATE TABLE IF NOT EXISTS discord_event_ack (
  event_id UUID PRIMARY KEY,
  handled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT  -- 'webhook' | 'poller' (informatif, peut être NULL)
);

CREATE INDEX IF NOT EXISTS idx_discord_event_ack_handled_at
  ON discord_event_ack (handled_at DESC);

ALTER TABLE discord_event_ack ENABLE ROW LEVEL SECURITY;
-- Aucune policy = accès uniquement via service role (supabaseAdmin).
