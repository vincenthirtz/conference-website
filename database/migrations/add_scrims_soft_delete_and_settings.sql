-- Migration: scrims.deleted_at + scrim_settings JSONB
--
-- Avant : DELETE physique de la row scrim depuis l'admin. Les matches liés
-- via scrim_id étaient cascade-cleanés mais aucune réversibilité.
-- Maintenant : soft-delete via deleted_at, restore via /admin/recycle-bin.
--
-- Ajoute aussi un champ settings JSONB pour stocker le format par défaut,
-- les maps, le BO, etc. — analogue à tournament_stages.settings.

ALTER TABLE scrims
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_scrims_deleted_at
  ON scrims (deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN scrims.deleted_at IS
  'Soft-delete timestamp. NULL = actif. Restore via /admin/recycle-bin.';
COMMENT ON COLUMN scrims.settings IS
  'JSONB de config (format BO, maps, cast, etc.). Analogue à tournament_stages.settings.';
