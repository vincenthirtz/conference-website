-- Migration: Link cast_members to staff (role = 'caster')
-- Description:
--   Ajoute une colonne auth_user_id sur cast_members afin de relier une fiche
--   publique (vitrine page association) a un compte staff ayant le role 'caster'.
--   La colonne est nullable : un cast_member peut etre un guest externe ou la
--   carte promo ("Envie de rejoindre le cast ?") sans compte staff.
--
--   Contrainte appliquee via trigger (CHECK ne supporte pas de subquery) :
--     - INSERT/UPDATE sur cast_members : auth_user_id doit pointer vers une
--       ligne de la table staff dont role = 'caster'.
--     - UPDATE/DELETE sur staff : si un user perd le role 'caster' (ou est
--       retire du staff), on NULL automatiquement les cast_members lies pour
--       eviter les liens incoherents.

-- 1. Colonne + FK (ON DELETE SET NULL pour le cas suppression du compte auth)
ALTER TABLE cast_members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Unicite : un user staff ne peut etre lie qu'a une seule fiche publique
CREATE UNIQUE INDEX IF NOT EXISTS cast_members_auth_user_id_unique
  ON cast_members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN cast_members.auth_user_id IS
  'Lien optionnel vers auth.users pour rattacher la fiche publique au compte staff caster.';

-- 3. Trigger : valider que auth_user_id est bien un staff caster
CREATE OR REPLACE FUNCTION enforce_cast_member_is_staff_caster()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM staff
    WHERE auth_user_id = NEW.auth_user_id
      AND role = 'caster'
  ) THEN
    RAISE EXCEPTION
      'cast_members.auth_user_id (%) doit referencer un staff avec role=caster',
      NEW.auth_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cast_members_enforce_staff_caster ON cast_members;
CREATE TRIGGER cast_members_enforce_staff_caster
  BEFORE INSERT OR UPDATE OF auth_user_id ON cast_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_cast_member_is_staff_caster();

-- 4. Trigger : si un staff perd le role caster (ou est supprime), nulifier le lien
CREATE OR REPLACE FUNCTION sync_cast_members_on_staff_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE cast_members
    SET auth_user_id = NULL
    WHERE auth_user_id = OLD.auth_user_id;
    RETURN OLD;
  END IF;

  -- UPDATE : si role change et n'est plus 'caster', nullifier
  IF NEW.role IS DISTINCT FROM 'caster' AND OLD.role = 'caster' THEN
    UPDATE cast_members
    SET auth_user_id = NULL
    WHERE auth_user_id = OLD.auth_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_sync_cast_members ON staff;
CREATE TRIGGER staff_sync_cast_members
  AFTER UPDATE OF role OR DELETE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION sync_cast_members_on_staff_change();
