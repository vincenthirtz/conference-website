-- database/migrations/add_bot_idempotency_table.sql
-- Stockage persistant des reponses idempotency-key du bot, partage entre
-- toutes les Lambdas Netlify (vs l'ancien cache in-memory qui ne survivait
-- pas a un cold start et ne se partageait pas entre instances).
--
-- TTL : 5 min cote app. Une cleanup periodique (cron ou manuelle) peut
-- purger les rows expirees, mais l'app evite simplement de lire les
-- expirees, donc la table peut grossir sans causer de bug correctness.

CREATE TABLE IF NOT EXISTS bot_idempotency (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  status SMALLINT NOT NULL,
  body JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_idempotency_expires_at
  ON bot_idempotency (expires_at);

-- Petite RLS minimale : seul le service role (supabaseAdmin) y accede.
ALTER TABLE bot_idempotency ENABLE ROW LEVEL SECURITY;
-- Aucune policy = rien n'est accessible via les clients anon/auth, ce qui
-- est exactement ce qu'on veut.
