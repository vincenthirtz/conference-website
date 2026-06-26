-- ARCHIVÉ le 2026-06-26 : SEED de données one-shot (équipes Overwatch Women's Cup
--   du tournoi 734b6fdb…). Donnée spécifique, pas du schéma -> non versionné en
--   migration. Conservé pour historique uniquement.
-- =====================================================================

-- Seed Overwatch Women’s Cup teams (no members) for tournament 734b6fdb-dfe8-4565-a6b3-38c6423d0929
-- Safe to run multiple times (ON CONFLICT DO NOTHING on slug).

WITH target AS (
  SELECT unnest(ARRAY['Phénix', 'Avoidgers', 'Onna Bugeisha', 'Sparkles']) AS name
)
INSERT INTO teams (id, name)
SELECT gen_random_uuid(), t.name
FROM target t
WHERE NOT EXISTS (
  SELECT 1 FROM teams existing WHERE existing.name = t.name
);
