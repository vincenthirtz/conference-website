-- Migration: ajouter `timezone` à `tournaments` — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/add_timezone_column.sql
--
-- WHY:
--   Colonne `timezone` ajoutée en prod via un fichier loose jamais versionné.
--   On versionne le patch additif à l'identique pour rendre la base
--   reconstructible. Aucun changement de comportement.
--
-- WHAT:
--   - ADD COLUMN IF NOT EXISTS timezone text DEFAULT NULL.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS).
--   - Additive pure, pas de FK/RLS -> pas de reload du schema cache PostgREST.
--   - Dépend de la table tournaments (déjà en prod).

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS timezone text DEFAULT NULL;
