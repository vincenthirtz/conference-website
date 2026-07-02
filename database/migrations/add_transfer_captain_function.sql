-- Migration: add_transfer_captain_function.sql
-- Date: 2026-07-02
--
-- WHY:
--   transfer-captain.ts faisait SELECT membre puis UPDATE teams.captain_id en deux
--   temps (TOCTOU : la cible peut quitter entre les deux → capitaine « fantôme »),
--   et n'excluait pas le rôle coach du capitanat. Cette fonction rend le transfert
--   atomique (verrou FOR UPDATE sur teams + EXISTS(membre non-coach) + UPDATE dans
--   une seule transaction) et refuse un coach comme capitaine.
--
-- SECURITY DEFINER, EXECUTE réservé à service_role (le handler admin/capitaine
-- appelle via supabaseAdmin). anon/authenticated explicitement révoqués.
--
-- Exceptions à message stable (mappées en HTTP côté handler) :
--   team_not_found (P0002) -> 404 ; not_captain -> 403 ; same_user -> 400 ;
--   target_not_member -> 400 (cible absente / coach).

BEGIN;

CREATE OR REPLACE FUNCTION public.transfer_captain(
  p_team_id uuid, p_new_captain uuid, p_tenant uuid, p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_old uuid;
BEGIN
  SELECT captain_id INTO v_old
  FROM public.teams
  WHERE id = p_team_id AND tenant_id = p_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_old IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'not_captain' USING ERRCODE = 'raise_exception';
  END IF;
  IF p_new_captain = p_actor THEN
    RAISE EXCEPTION 'same_user' USING ERRCODE = 'raise_exception';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND tenant_id = p_tenant
      AND user_id = p_new_captain AND role <> 'coach'
  ) THEN
    RAISE EXCEPTION 'target_not_member' USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.teams
  SET captain_id = p_new_captain, updated_at = now()
  WHERE id = p_team_id AND tenant_id = p_tenant;

  RETURN jsonb_build_object(
    'team_id', p_team_id, 'captain_id', p_new_captain, 'previous_captain', v_old
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_captain(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_captain(uuid, uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.transfer_captain(uuid, uuid, uuid, uuid) IS
  'Transfert capitanat atomique : FOR UPDATE sur teams + EXISTS(membre non-coach) '
  '+ UPDATE, en une transaction. Exceptions stables : team_not_found, not_captain, '
  'same_user, target_not_member. EXECUTE service_role only.';

COMMIT;
