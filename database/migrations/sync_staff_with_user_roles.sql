-- Migration: Synchronisation table staff avec les rôles utilisateurs
-- Date: 2026-01-11
-- Description:
--   Cette migration nettoie et synchronise la table staff avec les rôles
--   définis dans user_metadata.role de auth.users.
--
--   Après cette migration, la colonne "Staff" a été retirée de l'UI admin
--   car le rôle dans user_metadata sert maintenant de source unique.
--   L'API synchronise automatiquement la table staff lors des changements de rôle.

-- 1. Supprimer les entrées staff dont l'utilisateur n'a plus un rôle staff
--    (rôles staff valides: caster, manager, admin, owner)
DELETE FROM staff
WHERE auth_user_id IN (
  SELECT s.auth_user_id
  FROM staff s
  JOIN auth.users u ON u.id = s.auth_user_id
  WHERE (u.raw_user_meta_data->>'role') NOT IN ('caster', 'manager', 'admin', 'owner')
     OR (u.raw_user_meta_data->>'role') IS NULL
);

-- 2. Mettre à jour les rôles staff existants pour correspondre au user_metadata
UPDATE staff s
SET role = (
  SELECT u.raw_user_meta_data->>'role'
  FROM auth.users u
  WHERE u.id = s.auth_user_id
)
WHERE EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.id = s.auth_user_id
    AND u.raw_user_meta_data->>'role' IN ('caster', 'manager', 'admin', 'owner')
);

-- 3. Ajouter les utilisateurs avec un rôle staff qui n'ont pas d'entrée dans staff
INSERT INTO staff (auth_user_id, role, email, display_name)
SELECT
  u.id,
  u.raw_user_meta_data->>'role',
  u.email,
  u.raw_user_meta_data->>'display_name'
FROM auth.users u
WHERE u.raw_user_meta_data->>'role' IN ('caster', 'manager', 'admin', 'owner')
  AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.auth_user_id = u.id);
