-- database/migrations/add_pool_staff_placement.sql
-- Répartition de la liste d'attente par le staff — lot 2 de l'inscription
-- regroupée en équipes de 5 (cf. add_tournament_pooled_teams.sql).
-- Date: 2026-09-27
--
-- WHY:
--   Le staff place des joueuses en attente dans une équipe (le noyau de leur
--   équipe réelle, ou une équipe mixte créée pour la soirée), ou en retire
--   une. Deux gestes qui touchent à la fois les inscriptions individuelles,
--   `tournament_teams` et `stage_teams` : ils doivent être ATOMIQUES, et
--   sérialisés avec les inscriptions (`pool_register`) sur le MÊME verrou —
--   sinon une inscription automatique et un placement staff simultanés
--   pourraient mettre 6 joueuses dans une équipe de 5.
--
-- INVARIANTS TENUS ICI (et pas seulement dans l'écran):
--   - on ne place que des joueuses EN ATTENTE de CE tournoi ;
--   - une équipe ne dépasse jamais `p_team_size` joueuses placées ;
--   - une équipe qui reçoit sa première joueuse est inscrite au tournoi et
--     rattachée à toutes ses phases ;
--   - une équipe qui perd sa DERNIÈRE joueuse est désinscrite — mais
--     seulement si elle n'a encore aucun match dans ce tournoi : on ne défait
--     pas un bracket généré.
--
-- TENANCY / RLS: fonctions réservées au service role (routes admin).
-- SCHEMA CACHE: pas de FK nouvelle → pas de reload nécessaire.
--
-- Idempotente (CREATE OR REPLACE). Ré-appliquable.

CREATE OR REPLACE FUNCTION public.pool_place(
  p_tenant_id uuid,
  p_tournament_id uuid,
  p_entry_ids uuid[],
  p_team_id uuid,
  p_team_size integer DEFAULT 5
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_waiting integer;
  v_placed integer;
  v_n integer := coalesce(array_length(p_entry_ids, 1), 0);
BEGIN
  IF v_n = 0 THEN
    RAISE EXCEPTION 'pool_place: no entries' USING ERRCODE = 'P0001', HINT = 'empty';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pool_register:' || p_tournament_id::text));

  SELECT count(*) INTO v_waiting
    FROM public.tournament_pool_entries
   WHERE tournament_id = p_tournament_id
     AND tenant_id = p_tenant_id
     AND id = ANY (p_entry_ids)
     AND status = 'waitlist';
  IF v_waiting <> v_n THEN
    RAISE EXCEPTION 'pool_place: entries not waiting' USING ERRCODE = 'P0001', HINT = 'not_waiting';
  END IF;

  SELECT count(*) INTO v_placed
    FROM public.tournament_pool_entries
   WHERE tournament_id = p_tournament_id
     AND placed_team_id = p_team_id
     AND status = 'placed';
  IF v_placed + v_n > p_team_size THEN
    RAISE EXCEPTION 'pool_place: team full' USING ERRCODE = 'P0001', HINT = 'team_full';
  END IF;

  UPDATE public.tournament_pool_entries
     SET status = 'placed', placed_team_id = p_team_id, placed_at = now(), updated_at = now()
   WHERE tournament_id = p_tournament_id AND id = ANY (p_entry_ids);

  INSERT INTO public.tournament_teams (tenant_id, tournament_id, team_id, status)
  VALUES (p_tenant_id, p_tournament_id, p_team_id, 'registered')
  ON CONFLICT (tournament_id, team_id) DO NOTHING;

  INSERT INTO public.stage_teams (stage_id, team_id, tenant_id)
  SELECT s.id, p_team_id, p_tenant_id
    FROM public.tournament_stages s
   WHERE s.tournament_id = p_tournament_id
  ON CONFLICT (stage_id, team_id) DO NOTHING;

  RETURN v_placed + v_n;
END;
$function$;

-- Rend : 'unplaced' (l'équipe garde des joueuses ou a déjà des matchs) ou
-- 'team_unregistered' (c'était sa dernière joueuse : équipe désinscrite).
CREATE OR REPLACE FUNCTION public.pool_unplace(
  p_tenant_id uuid,
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_team uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pool_register:' || p_tournament_id::text));

  UPDATE public.tournament_pool_entries e
     SET status = 'waitlist', placed_team_id = NULL, placed_at = NULL, updated_at = now()
    FROM (SELECT id, placed_team_id FROM public.tournament_pool_entries
           WHERE id = p_entry_id AND tournament_id = p_tournament_id
             AND tenant_id = p_tenant_id AND status = 'placed'
           FOR UPDATE) old
   WHERE e.id = old.id
  RETURNING old.placed_team_id INTO v_team;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'pool_unplace: entry not placed' USING ERRCODE = 'P0001', HINT = 'not_placed';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.tournament_pool_entries
        WHERE tournament_id = p_tournament_id AND placed_team_id = v_team AND status = 'placed')
     AND NOT EXISTS (
       SELECT 1 FROM public.matches
        WHERE tournament_id = p_tournament_id AND (team1_id = v_team OR team2_id = v_team))
  THEN
    DELETE FROM public.stage_teams st
     USING public.tournament_stages s
     WHERE st.stage_id = s.id AND s.tournament_id = p_tournament_id AND st.team_id = v_team;
    DELETE FROM public.tournament_teams
     WHERE tournament_id = p_tournament_id AND team_id = v_team;
    RETURN 'team_unregistered';
  END IF;

  RETURN 'unplaced';
END;
$function$;

REVOKE ALL ON FUNCTION public.pool_place(uuid, uuid, uuid[], uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pool_place(uuid, uuid, uuid[], uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.pool_unplace(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pool_unplace(uuid, uuid, uuid) TO service_role;
