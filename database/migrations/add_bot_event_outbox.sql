-- database/migrations/add_bot_event_outbox.sql
-- Outbox pattern pour la livraison fiable des events sortants vers le bot
-- Discord (match.starting, match.disputed, team.member.added, etc.).
--
-- Le emitBotEvent actuel pousse en HTTP avec 3 retries en memoire ; si le
-- bot est down ou le site est restart au mauvais moment, l'event est
-- perdu. L'outbox persiste chaque event en DB :
--   - status='pending' : non encore livre (push HTTP a echoue ou pas tente)
--   - status='delivered' : livre avec succes
-- Le bot peut soit :
--   - recevoir les push events comme avant (latence basse)
--   - poller GET /api/bot/v1/events/pending pour rattraper ce qui a foire
-- L'ack via POST /api/bot/v1/events/[id]/ack ferme la boucle.
--
-- Cleanup : laisser les rows 'delivered' purgees par un cron eventuel ;
-- elles ne perturbent pas le query plan (index status partiel).

CREATE TABLE IF NOT EXISTS bot_event_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered')),
  push_attempts SMALLINT NOT NULL DEFAULT 0,
  last_push_error TEXT,
  last_push_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index partiel pour acclerer le polling /events/pending : les events
-- delivered ne sont jamais query, on les ignore via le partial index.
CREATE INDEX IF NOT EXISTS idx_bot_event_outbox_pending
  ON bot_event_outbox (created_at)
  WHERE status = 'pending';

ALTER TABLE bot_event_outbox ENABLE ROW LEVEL SECURITY;
-- Aucune policy : service role uniquement.
