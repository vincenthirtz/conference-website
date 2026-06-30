-- Migration: délai de grâce check-in (tournaments) + motif de no-show (matches)
-- Date: 2026-06-30
-- Ticket: T2 — couche DB
--
-- Description:
--   Migration purement ADDITIVE (aucun DROP / ALTER destructif).
--
--   1) tournaments.checkin_grace_minutes
--      Fenêtre de tolérance (en minutes) après l'heure de début d'un match
--      pendant laquelle une équipe peut encore se check-in avant déclenchement
--      d'un forfait automatique. Borné [0, 120], défaut 60.
--
--   2) matches.no_show_reason
--      Audit du motif d'un forfait/DQ automatique ou manuel
--      (ex: 'auto_forfeit_no_checkin', 'manual_dq'). NULL = pas de no-show.
--
-- Caveats:
--   - Idempotent : ADD COLUMN IF NOT EXISTS. Les CHECK sont déclarés inline
--     dans le ADD COLUMN, donc créés uniquement avec la colonne (pas de
--     ADD CONSTRAINT séparé qui échouerait au re-run).
--   - Aucune clé étrangère ajoutée → pas de reload du cache schéma PostgREST
--     requis.
--   - tournaments / matches portent déjà tenant_id ; un ADD COLUMN ne nécessite
--     aucun scoping multi-tenant.

-- 1) Délai de grâce check-in sur tournaments
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS checkin_grace_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (checkin_grace_minutes >= 0 AND checkin_grace_minutes <= 120);

COMMENT ON COLUMN tournaments.checkin_grace_minutes IS
  'Délai de grâce (minutes) après le début d''un match avant forfait auto pour absence de check-in. Borné [0,120], défaut 60.';

-- 2) Motif de no-show / forfait / DQ sur matches
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS no_show_reason TEXT;

COMMENT ON COLUMN matches.no_show_reason IS
  'Audit du motif de forfait/DQ (ex: ''auto_forfeit_no_checkin'', ''manual_dq''). NULL = pas de no-show.';
