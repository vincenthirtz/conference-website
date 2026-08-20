-- Migration: accept_invitation_allow_manager.sql
-- Date: 2026-08-20
--
-- WHY:
--   `accept_invitation` coerçait le rôle demandé vers player|substitute|coach :
--
--     IF v_role NOT IN ('player','substitute','coach') THEN v_role := 'player';
--
--   Une invitation « manager » était donc acceptée… en tant que JOUEUSE. Sans
--   erreur, sans trace : l'invitée arrivait dans le roster avec un rôle qu'on
--   ne lui avait pas proposé, et l'équipe croyait avoir un manager.
--
--   Le rôle est pourtant offert dans l'espace équipe (sélecteur d'invitation de
--   /player/manage-team) et déjà accordable par l'autre chemin : POST
--   /api/teams/add-member insère un `manager` sans réserve, pour tout appelant
--   ayant la permission `manage_roster`. Les deux chemins mènent au même geste
--   — ajouter quelqu'un à SON équipe — et divergeaient sur le résultat.
--
-- WHAT:
--   `manager` rejoint la liste. Le repli sur 'player' reste pour toute valeur
--   inconnue : une invitation ne doit jamais insérer un rôle arbitraire.
--
-- CE QUI NE CHANGE PAS:
--   - `captain` n'est toujours PAS acceptable ici. Le capitanat vit dans
--     `teams.captain_id`, pas dans `team_members.role` : l'accorder demande
--     transfer-captain / designate_captain, pas une insertion de ligne.
--   - L'anti-escalation de PROMOTION (`/api/teams/update-member-role` : seul le
--     capitaine peut accorder un rôle privilégié à un membre EXISTANT) est
--     intacte — elle vit côté API et couvre un autre geste.
--   - `is_substitute` ne se lève que pour 'substitute' ; un manager n'est pas
--     remplaçant.
--   - Le quota de roster ne bouge pas : `enforce_team_max_players` exempte déjà
--     coach ET manager.
--   - L'unicité par tenant non plus : `team_members_tenant_user_key` est un
--     index PARTIEL qui exclut `manager` depuis allow_manager_multi_team.sql —
--     insérer un manager qui encadre déjà une autre équipe passe.
--
-- CAVEATS:
--   - Idempotente : CREATE OR REPLACE du corps complet.
--   - Aucune donnée à rattraper : les invitations déjà acceptées ont créé des
--     lignes `player` bien réelles. Les corriger demanderait de deviner
--     l'intention d'origine — c'est à l'équipe de rectifier le rôle depuis son
--     espace, ce que l'écran permet.

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_demande_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_demande public.demandes%ROWTYPE; v_role text; v_is_sub boolean; v_member public.team_members%ROWTYPE;
BEGIN
  SELECT * INTO v_demande FROM public.demandes WHERE id = p_demande_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'demande_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_demande.type <> 'invite' THEN RAISE EXCEPTION 'demande_wrong_type' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.status <> 'pending' THEN RAISE EXCEPTION 'demande_not_pending' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'not_owner' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.team_id IS NULL THEN RAISE EXCEPTION 'demande_no_team' USING ERRCODE = 'raise_exception'; END IF;
  v_role := lower(coalesce(v_demande.payload->>'desired_role', 'player'));
  -- `manager` ajouté le 2026-08-20 : le rôle est proposé à l'invitation et
  -- déjà accordable via /api/teams/add-member. `captain` reste exclu — le
  -- capitanat vit dans teams.captain_id, pas ici.
  IF v_role NOT IN ('player','substitute','coach','manager') THEN v_role := 'player'; END IF;
  v_is_sub := (v_role = 'substitute');
  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute)
  VALUES (v_demande.tenant_id, v_demande.team_id, v_demande.user_id, v_role, nullif(v_demande.payload->>'battle_tag',''), v_is_sub)
  RETURNING * INTO v_member;
  UPDATE public.demandes SET status='approved', processed_at=now() WHERE id = p_demande_id;
  RETURN to_jsonb(v_member);
END; $function$;

COMMIT;
