-- Migration: admin_idempotency
--
-- Cache des réponses des mutations admin protégées par Idempotency-Key.
-- Même mécanisme que bot_idempotency (cf. add_bot_idempotency_table.sql)
-- mais keyspace séparé pour éviter qu'un bot et un admin avec la même clé
-- entrent en collision.
--
-- TTL : 5 min côté app. Une cleanup périodique peut purger les rows
-- expirées, mais l'app évite simplement de lire les expirées : la table
-- peut grossir sans casser la correctness.

CREATE TABLE IF NOT EXISTS admin_idempotency (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  status SMALLINT NOT NULL,
  body JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_idempotency_expires_at
  ON admin_idempotency (expires_at);

-- Seul le service role (supabaseAdmin) y accède.
ALTER TABLE admin_idempotency ENABLE ROW LEVEL SECURITY;
-- Pas de policy = rien d'accessible via les clients anon/auth.
