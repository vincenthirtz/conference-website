-- Migration: staff.is_active + staff.deleted_at (soft-delete)
--
-- Avant cette migration, retirer le rôle staff = DELETE de la row staff +
-- auth.admin.deleteUser. Conséquence :
--   - perte irréversible : impossible de "réactiver" un ancien staff
--   - staff_logs.staff_id orphelin (FK SET NULL) → les actions passées
--     deviennent anonymes dans l'audit
--
-- Avec soft-delete :
--   - PATCH role vers non-staff → is_active=false + deleted_at=now()
--     (la row staff reste, l'audit est préservé)
--   - DELETE complet du compte auth → garde le hard-delete existant
--   - getStaffByUserId filtre les désactivés → pas de droit zombie
--   - /admin/recycle-bin liste les staff désactivés + restore (set
--     is_active=true, deleted_at=null)

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_is_active
  ON staff (is_active) WHERE is_active = false;

COMMENT ON COLUMN staff.is_active IS
  'Soft-delete flag. false = staff désactivé (ne peut plus s''auth comme staff). À utiliser conjointement avec deleted_at pour l''audit.';
COMMENT ON COLUMN staff.deleted_at IS
  'Timestamp du soft-delete. NULL si actif.';
