-- database/migrations/add_bot_event_outbox_failed_status.sql
--
-- Etend le CHECK constraint de bot_event_outbox.status pour autoriser 'failed'
-- en plus de 'pending' et 'delivered'. Cet etat marque les events qui sont
-- restes 'pending' au-dela du seuil de poison-pill (cf. cron outbox-maintenance) :
-- la livraison a echoue trop longtemps, on les sort de la queue pour ne plus les
-- re-tenter ad nauseam et on les conserve pour audit/replay manuel.
--
-- Le cron outbox-maintenance purge ces rows apres OUTBOX_DELETE_AFTER_DAYS jours
-- au meme titre que les 'delivered'.
--
-- L'index partiel idx_bot_event_outbox_pending continue de ne couvrir que
-- status='pending' : les rows 'failed' n'apparaitront plus dans
-- GET /api/bot/v1/events/pending.

ALTER TABLE bot_event_outbox
  DROP CONSTRAINT IF EXISTS bot_event_outbox_status_check;

ALTER TABLE bot_event_outbox
  ADD CONSTRAINT bot_event_outbox_status_check
  CHECK (status IN ('pending', 'delivered', 'failed'));

-- Index pour le cron de maintenance : range scan sur created_at quand on
-- cherche les rows a purger ou a marquer failed. Couvre delivered/failed avec
-- created_at trie pour le DELETE ... WHERE created_at < cutoff.
CREATE INDEX IF NOT EXISTS idx_bot_event_outbox_status_created_at
  ON bot_event_outbox (status, created_at);
