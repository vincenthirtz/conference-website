-- Migration: bot_locks (distributed lock pour le bot Discord)
--
-- Avant : role-sync.js et autres jobs longs utilisaient un booléen local
-- (runningFullSync). Marche en mono-instance mais avec plusieurs réplicas
-- bot, chaque process a son propre booléen → 2 syncs en parallèle, qui
-- peuvent se marcher dessus (ajouter/retirer un rôle Discord en boucle).
--
-- Pattern : table bot_locks(name PK) avec TTL. Le bot tente un INSERT
-- (ou UPDATE si expires_at < now()) en atomique. Si OK → wasAcquired=true,
-- il peut lancer le job. Sinon, un autre process tient déjà le lock.
--
-- Le holder est un UUID stable par instance (généré au boot du bot). Le
-- release retire la row uniquement si holder=ce process — évite qu'un
-- autre process release par erreur.

CREATE TABLE IF NOT EXISTS bot_locks (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bot_locks_expires_at
  ON bot_locks (expires_at);

ALTER TABLE bot_locks ENABLE ROW LEVEL SECURITY;
