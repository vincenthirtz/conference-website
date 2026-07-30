-- Migration: add_designate_captain_function.sql
-- Date: 2026-07-31
--
-- WHY:
--   Une equipe peut desormais etre creee par un MANAGER (page publique
--   /team/create, mode « je gere l'equipe »). Dans ce flux, la capitaine n'est
--   pas la creatrice : elle est INVITEE, donc `teams.captain_id` reste NULL
--   jusqu'a ce qu'une joueuse accepte et soit designee.
--
--   `transfer_captain` ne couvre pas ce cas : elle exige que l'acteur SOIT le
--   capitaine courant (`not_captain`). Il n'existait donc aucun moyen d'amorcer
--   le capitanat d'une equipe sans capitaine.
--
--   `designate_captain` couvre ce SEUL cas de bootstrap :
--     - l'equipe existe (tenant-scoped, verrou FOR UPDATE) ;
--     - elle n'a PAS de capitaine (`captain_id IS NULL`) — on ne vole jamais un
--       capitanat existant, meme a un manager tout-puissant ;
--     - la cible est un membre non-coach de l'equipe (meme regle que
--       transfer_captain).
--
--   L'autorisation de l'ACTEUR (manager avec la permission `manage_roster`, ou
--   staff admin) est faite cote handler — comme pour toutes les routes de
--   gestion d'equipe (getManagedTeam + roleHasPermission). La fonction, elle,
--   garde l'invariant fort « captain_id NULL uniquement ».
--
-- SECURITY DEFINER, EXECUTE reserve a service_role (les handlers appellent via
-- supabaseAdmin). anon/authenticated explicitement revoques.
--
-- Exceptions a message stable (mappees en HTTP via mapTeamRpcError) :
--   team_not_found (P0002) -> 404 ; captain_already_set -> 409 ;
--   target_not_member -> 400 (cible absente / coach).

BEGIN;

CREATE OR REPLACE FUNCTION public.designate_captain(
  p_team_id uuid, p_new_captain uuid, p_tenant uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_current uuid;
BEGIN
  SELECT captain_id INTO v_current
  FROM public.teams
  WHERE id = p_team_id AND tenant_id = p_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'captain_already_set' USING ERRCODE = 'raise_exception';
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

  RETURN jsonb_build_object('team_id', p_team_id, 'captain_id', p_new_captain);
END;
$$;

REVOKE ALL ON FUNCTION public.designate_captain(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.designate_captain(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.designate_captain(uuid, uuid, uuid) IS
  'Amorce le capitanat d''une equipe SANS capitaine (captain_id IS NULL) : '
  'FOR UPDATE sur teams + EXISTS(membre non-coach) + UPDATE, en une transaction. '
  'Ne remplace JAMAIS un capitaine existant (captain_already_set). '
  'Exceptions stables : team_not_found, captain_already_set, target_not_member. '
  'EXECUTE service_role only.';

COMMIT;
