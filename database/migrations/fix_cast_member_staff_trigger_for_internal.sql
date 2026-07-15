-- Migration: le trigger enforce_cast_member_is_staff_caster autorise les fiches internes
--
-- WHY: le trigger enforce_cast_member_is_staff_caster() exigeait que TOUTE fiche
--   cast_members référence un staff de rôle EXACT 'caster'. Or la feature « accès
--   cockpit Régie pour admin/owner » (cf. utils/casterAuth.ts) auto-provisionne
--   une fiche INTERNE (is_internal=true) pour un admin/owner — dont le rôle staff
--   est 'admin'/'owner', PAS 'caster'. L'insert était donc rejeté en prod
--   (les tests unitaires ne portent pas ce trigger, d'où la non-détection).
--
-- WHAT: on distingue selon is_internal :
--   - fiche PUBLIQUE (is_internal=false) : invariant historique conservé — doit
--     référencer un staff de rôle 'caster'.
--   - fiche INTERNE (is_internal=true) : doit référencer N'IMPORTE QUEL staff
--     (rôle >= caster de fait, puisque toute ligne staff est un membre du staff).
--     L'app ne crée ces fiches que pour admin/owner, mais le trigger reste
--     volontairement permissif « tout staff » pour ne pas se re-casser si le
--     gate applicatif évolue.
--
--   auth_user_id NULL : inchangé (fiche non liée, autorisée — cas legacy).
--
-- CAVEATS: idempotent (CREATE OR REPLACE). Pas de nouvelle FK, pas de reload
--   PostgREST. Le trigger lui-même n'est pas recréé (seulement la fonction).

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_cast_member_is_staff_caster()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_internal THEN
    -- Fiche interne (accès cockpit) : tout membre du staff est autorisé.
    IF NOT EXISTS (
      SELECT 1 FROM staff WHERE auth_user_id = NEW.auth_user_id
    ) THEN
      RAISE EXCEPTION
        'cast_members.auth_user_id (%) doit referencer un membre du staff',
        NEW.auth_user_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    -- Fiche publique : invariant historique (staff de rôle caster).
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE auth_user_id = NEW.auth_user_id
        AND role = 'caster'
    ) THEN
      RAISE EXCEPTION
        'cast_members.auth_user_id (%) doit referencer un staff avec role=caster',
        NEW.auth_user_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
