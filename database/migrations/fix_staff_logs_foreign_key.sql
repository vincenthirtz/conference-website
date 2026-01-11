-- Migration: Corriger la contrainte FK de staff_logs
-- Date: 2026-01-11
-- Description:
--   La contrainte logs_staff_fk référence incorrectement la table "users"
--   au lieu de "staff". Cette migration corrige cette erreur.

-- Supprimer l'ancienne contrainte incorrecte
ALTER TABLE staff_logs
DROP CONSTRAINT IF EXISTS logs_staff_fk;

-- Ajouter la nouvelle contrainte vers la table staff
ALTER TABLE staff_logs
ADD CONSTRAINT logs_staff_fk
FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
