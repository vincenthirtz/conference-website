-- Migration: add_reassign_captain_rpc.sql
-- Date: 2026-08-31
--
-- WHY:
--   Un manager de LVN EMBERS ne pouvait pas désigner une nouvelle capitaine.
--   Les deux RPC existantes couvrent chacune la moitié du besoin, et aucune ne
--   couvre celle-ci :
--
--     - `transfer_captain` exige `p_actor = teams.captain_id` : c'est la
--       capitaine qui passe le brassard. Un manager n'est pas la capitaine.
--     - `designate_captain` refuse (`captain_already_set`) dès qu'un capitanat
--       existe : elle ne sait qu'AMORCER une équipe qui n'en a pas — le cas
--       d'une équipe créée par un manager, dont la capitaine désignée n'a pas
--       encore accepté son invitation.
--
--   Résultat : un manager d'une équipe qui A une capitaine se prenait un 403,
--   alors même que l'écran lui proposait le bouton. Or c'est son métier de
--   tenir le roster, et une capitaine inactive bloquait l'équipe entière — le
--   staff devait intervenir à la main.
--
-- WHAT:
--   `reassign_captain(p_team_id, p_new_captain, p_tenant)` : pose le capitanat,
--   qu'il y en ait un ou non, et renvoie `previous_captain` (NULL à
--   l'amorçage). Elle remplace `designate_captain` côté application, qui n'est
--   plus appelée nulle part.
--
--   L'AUTORISATION N'EST PAS ICI. Cette fonction ne sait pas qui appelle : sa
--   seule garde est l'intégrité (équipe existante, cible réellement membre et
--   non-coach), sous verrou. C'est délibéré et cohérent avec le reste — c'est
--   la route qui vérifie `manage_roster`, comme elle le fait déjà pour
--   l'amorçage. Une RPC qui déciderait des droits ferait un second endroit où
--   la politique vit, et les deux divergeraient.
--
-- CAVEATS:
--   - `role <> 'coach'` : même garde que les deux autres RPC. Un coach ne
--     capitaine pas une équipe. NB : un `manager` reste éligible — c'est
--     volontaire, la question « un manager peut-il se désigner lui-même » se
--     tranche côté route, pas ici.
--   - SECURITY DEFINER + search_path épinglé, comme ses deux sœurs.
--   - `designate_captain` est CONSERVÉE : la supprimer casserait tout appelant
--     que ce dépôt ne voit pas (bot, scripts). Elle devient simplement le cas
--     particulier de celle-ci.
--   - Idempotente : CREATE OR REPLACE.
--   - Pas de reload PostgREST pour la fonction elle-même, mais on le déclenche
--     quand même — PostgREST expose les RPC via son cache de schéma, et une
--     fonction fraîchement créée reste invisible sans rechargement.
--   - Rollback : DROP FUNCTION IF EXISTS public.reassign_captain(uuid, uuid, uuid);

BEGIN;

CREATE OR REPLACE FUNCTION public.reassign_captain(
  p_team_id uuid,
  p_new_captain uuid,
  p_tenant uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old uuid;
BEGIN
  SELECT captain_id INTO v_old
    FROM public.teams
   WHERE id = p_team_id AND tenant_id = p_tenant
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Rien à faire, mais ce n'est pas une erreur : deux clics sur le même bouton
  -- ne doivent pas produire un message d'échec.
  IF v_old IS NOT DISTINCT FROM p_new_captain THEN
    RETURN jsonb_build_object(
      'team_id', p_team_id,
      'captain_id', p_new_captain,
      'previous_captain', v_old,
      'unchanged', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
     WHERE team_id = p_team_id
       AND tenant_id = p_tenant
       AND user_id = p_new_captain
       AND role <> 'coach'
  ) THEN
    RAISE EXCEPTION 'target_not_member' USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.teams
     SET captain_id = p_new_captain, updated_at = now()
   WHERE id = p_team_id AND tenant_id = p_tenant;

  RETURN jsonb_build_object(
    'team_id', p_team_id,
    'captain_id', p_new_captain,
    'previous_captain', v_old,
    'unchanged', false
  );
END;
$function$;

COMMENT ON FUNCTION public.reassign_captain(uuid, uuid, uuid) IS
  'Pose le capitanat d''une equipe, qu''elle en ait un ou non, et renvoie previous_captain. L''autorisation est verifiee par la route appelante (manage_roster), pas ici.';

COMMIT;

NOTIFY pgrst, 'reload schema';
