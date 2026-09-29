-- =============================================================================
-- SOCLE DE SCHÉMA (baseline) — conference-website / Supabase
-- =============================================================================
-- Provenance : reconstruit le 2026-09-29 par INTROSPECTION DU CATALOGUE de la
-- base de production (projet Supabase `owwomenscup`, ref yhfdhpqgmazfxyyklomp,
-- PostgreSQL 17.6), faute de pouvoir lancer `supabase db dump` (ni CLI, ni
-- pg_dump, ni Docker, ni mot de passe base). Requêtes exclusivement en lecture
-- sur pg_catalog / pg_policies / pg_publication_tables, via pg_get_*def() et
-- format_type() — voir docs/E2E-LOCAL-SUPABASE.md.
--
-- Ce fichier ne contient AUCUNE DONNÉE : uniquement le schéma `public`
-- (séquences, fonctions, tables, contraintes, index, vues, clés étrangères,
-- triggers, RLS, policies, droits, publication realtime) et la déclaration des
-- deux buckets de stockage utilisés par le code.
-- `auth` et `storage` sont fournis par `supabase start`.
--
-- Écarts assumés par rapport à la production :
--   * aucun OWNER TO ; aucun COMMENT ;
--   * extensions propres à l'hébergé non recréées (pg_stat_statements,
--     supabase_vault, pg_graphql : aucun objet de `public` n'en dépend) ;
--   * droits : seuls PUBLIC / anon / authenticated / service_role sont repris.
--
-- Les migrations postérieures s'empilent dessus, horodatées, dans
-- supabase/migrations/. Les 340 fichiers de database/migrations/ restent une
-- archive et ne sont PAS rejoués.
-- =============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- ---------------------------------------------------------------- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ---------------------------------------------------------------- SÉQUENCES
CREATE SEQUENCE IF NOT EXISTS public.admin_idempotency_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.bot_event_outbox_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.bot_idempotency_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.bot_player_actions_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.bracket_snapshots_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.email_deliveries_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.stage_tiebreaker_overrides_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.tenant_plan_checkouts_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.tenant_plan_payments_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;


-- ---------------------------------------------------------------- FONCTIONS
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
  IF v_role NOT IN ('player','substitute','coach','manager') THEN v_role := 'player'; END IF;
  v_is_sub := (v_role = 'substitute');
  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute, accepted_at)
  VALUES (v_demande.tenant_id, v_demande.team_id, v_demande.user_id, v_role, nullif(v_demande.payload->>'battle_tag',''), v_is_sub, now())
  RETURNING * INTO v_member;
  UPDATE public.demandes SET status='approved', processed_at=now() WHERE id = p_demande_id;
  RETURN to_jsonb(v_member);
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_get_user_profiles(p_ids uuid[])
 RETURNS TABLE(id uuid, email text, display_name text, full_name text, avatar_url text, battle_tag text, discord text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT
    u.id,
    u.email::text,
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'battle_tag',
    u.raw_user_meta_data->>'discord'
  FROM auth.users u
  WHERE u.id = ANY(p_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_users(p_query text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_filters text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, email text, role text, display_name text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, banned_until timestamp with time zone, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  WITH norm AS (
    SELECT
      NULLIF(lower(trim(p_query)), '') AS q,
      NULLIF(lower(trim(p_role)),  '') AS r,
      coalesce(p_filters, ARRAY[]::text[]) AS f,
      CASE lower(coalesce(p_sort, 'created_at'))
        WHEN 'display_name'    THEN 'display_name'
        WHEN 'email'           THEN 'email'
        WHEN 'role'            THEN 'role'
        WHEN 'last_sign_in_at' THEN 'last_sign_in_at'
        ELSE 'created_at'
      END AS s,
      CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END AS d
  ),
  filtered AS (
    SELECT
      u.id,
      u.email::text                                   AS email,
      lower(u.raw_user_meta_data->>'role')            AS role,
      u.raw_user_meta_data->>'display_name'           AS display_name,
      u.created_at,
      u.last_sign_in_at,
      u.banned_until
    FROM auth.users u, norm
    WHERE
      (norm.r IS NULL OR lower(u.raw_user_meta_data->>'role') = norm.r)
      AND (
        norm.q IS NULL
        OR lower(u.email) LIKE '%' || norm.q || '%'
        OR lower(u.raw_user_meta_data->>'display_name') LIKE '%' || norm.q || '%'
        OR lower(u.raw_user_meta_data->>'role') LIKE '%' || norm.q || '%'
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.user_id = u.id
            AND lower(tm.battle_tag) LIKE '%' || norm.q || '%'
        )
      )
      AND (
        NOT ('staff' = ANY(norm.f))
        OR lower(u.raw_user_meta_data->>'role') IN ('caster', 'admin', 'owner')
      )
      AND (
        NOT ('community' = ANY(norm.f))
        OR coalesce(lower(u.raw_user_meta_data->>'role'), 'member')
             NOT IN ('caster', 'admin', 'owner')
      )
      AND (
        NOT ('no_team' = ANY(norm.f))
        OR NOT EXISTS (
          SELECT 1 FROM public.team_members tm WHERE tm.user_id = u.id
        )
      )
      AND (
        NOT ('never_signed_in' = ANY(norm.f))
        OR u.last_sign_in_at IS NULL
      )
      AND (
        NOT ('inactive_6m' = ANY(norm.f))
        OR u.last_sign_in_at IS NULL
        OR u.last_sign_in_at < now() - interval '6 months'
      )
      AND (
        NOT ('suspended' = ANY(norm.f))
        OR (u.banned_until IS NOT NULL AND u.banned_until > now())
      )
      AND (
        NOT ('no_discord' = ANY(norm.f))
        OR NOT EXISTS (
          SELECT 1
          FROM public.user_discord_links dl
          WHERE dl.auth_user_id = u.id
        )
      )
      AND (
        NOT ('battletag_mismatch' = ANY(norm.f))
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          LEFT JOIN public.user_battlenet_links bl ON bl.auth_user_id = u.id
          WHERE tm.user_id = u.id
            AND (
              (tm.verified_battle_net_id IS NOT NULL
                AND tm.battle_tag_verified_at IS NULL)
              OR (
                NULLIF(lower(trim(bl.battle_tag)), '') IS NOT NULL
                AND NULLIF(lower(trim(tm.battle_tag)), '') IS NOT NULL
                AND lower(trim(bl.battle_tag)) <> lower(trim(tm.battle_tag))
              )
            )
        )
      )
  )
  SELECT
    f.id,
    f.email,
    f.role,
    f.display_name,
    f.created_at,
    f.last_sign_in_at,
    f.banned_until,
    count(*) OVER() AS total_count
  FROM filtered f, norm
  ORDER BY
    (CASE
       WHEN norm.d = 'asc' AND norm.s = 'display_name' THEN lower(f.display_name)
       WHEN norm.d = 'asc' AND norm.s = 'email'        THEN lower(f.email)
       WHEN norm.d = 'asc' AND norm.s = 'role'         THEN f.role
     END) ASC NULLS LAST,
    (CASE
       WHEN norm.d = 'desc' AND norm.s = 'display_name' THEN lower(f.display_name)
       WHEN norm.d = 'desc' AND norm.s = 'email'        THEN lower(f.email)
       WHEN norm.d = 'desc' AND norm.s = 'role'         THEN f.role
     END) DESC NULLS LAST,
    (CASE
       WHEN norm.d = 'asc' AND norm.s = 'created_at'      THEN f.created_at
       WHEN norm.d = 'asc' AND norm.s = 'last_sign_in_at' THEN f.last_sign_in_at
     END) ASC NULLS LAST,
    (CASE
       WHEN norm.d = 'desc' AND norm.s = 'created_at'      THEN f.created_at
       WHEN norm.d = 'desc' AND norm.s = 'last_sign_in_at' THEN f.last_sign_in_at
     END) DESC NULLS LAST,
    f.created_at DESC, f.id
  LIMIT p_limit OFFSET p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_search_tcg_players(p_tenant_id uuid, p_query text)
 RETURNS TABLE(id uuid, display_name text, battle_tag text, team_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  WITH norm AS (
    SELECT
      lower(trim(p_query)) AS q,
      replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') AS q_like
  ),
  attached AS (
    SELECT tm.user_id
    FROM public.team_members tm
    WHERE p_tenant_id IS NOT NULL
      AND tm.tenant_id = p_tenant_id
      AND tm.user_id IS NOT NULL
      AND tm.accepted_at IS NOT NULL
    UNION
    SELECT e.user_id
    FROM public.tcg_wallet_entries e
    WHERE p_tenant_id IS NOT NULL
      AND e.tenant_id = p_tenant_id
      AND e.source_kind IN (
        'twitch_drop',
        'supporter_welcome',
        'battlenet_verified',
        'collection_set'
      )
  ),
  member AS (
    SELECT DISTINCT ON (tm.user_id)
           tm.user_id, tm.battle_tag, tm.display_name, tm.team_id
    FROM public.team_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id IS NOT NULL
    ORDER BY tm.user_id, tm.id
  ),
  matched AS (
    SELECT DISTINCT a.user_id
    FROM attached a
    CROSS JOIN norm
    LEFT JOIN auth.users u ON u.id = a.user_id
    WHERE norm.q IS NOT NULL
      AND length(norm.q) >= 2
      AND (
        lower(u.raw_user_meta_data->>'display_name') LIKE '%' || norm.q_like || '%'
        OR lower(u.raw_user_meta_data->>'full_name') LIKE '%' || norm.q_like || '%'
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.tenant_id = p_tenant_id
            AND tm.user_id = a.user_id
            AND (
              lower(tm.battle_tag) LIKE '%' || norm.q_like || '%'
              OR lower(tm.display_name) LIKE '%' || norm.q_like || '%'
            )
        )
      )
  )
  SELECT
    x.user_id AS id,
    COALESCE(
      m.display_name,
      u.raw_user_meta_data->>'display_name',
      u.raw_user_meta_data->>'full_name'
    ) AS display_name,
    m.battle_tag AS battle_tag,
    t.name AS team_name
  FROM matched x
  LEFT JOIN auth.users u ON u.id = x.user_id
  LEFT JOIN member m ON m.user_id = x.user_id
  LEFT JOIN public.teams t ON t.id = m.team_id AND t.tenant_id = p_tenant_id
  ORDER BY 2 NULLS LAST, 1
  LIMIT 20;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text)
 RETURNS TABLE(id uuid, email text, display_name text, battle_tag text, team_id uuid, team_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  WITH norm AS (SELECT lower(trim(p_query)) AS q),
  member AS (
    SELECT DISTINCT ON (tm.user_id) tm.user_id, tm.battle_tag, tm.display_name, tm.team_id
    FROM public.team_members tm WHERE tm.user_id IS NOT NULL ORDER BY tm.user_id, tm.id
  ),
  candidates AS (
    SELECT u.id AS user_id FROM auth.users u, norm
    WHERE norm.q IS NOT NULL AND length(norm.q) >= 2
      AND (lower(u.email) LIKE '%'||norm.q||'%' OR lower(u.raw_user_meta_data->>'display_name') LIKE '%'||norm.q||'%')
    UNION
    SELECT tm.user_id FROM public.team_members tm, norm
    WHERE tm.user_id IS NOT NULL AND norm.q IS NOT NULL AND length(norm.q) >= 2
      AND (lower(tm.battle_tag) LIKE '%'||norm.q||'%' OR lower(tm.display_name) LIKE '%'||norm.q||'%')
  ),
  limited AS (SELECT DISTINCT c.user_id FROM candidates c LIMIT 30)
  SELECT l.user_id AS id, u.email::text AS email,
    COALESCE(m.display_name, u.raw_user_meta_data->>'display_name') AS display_name,
    m.battle_tag AS battle_tag, m.team_id AS team_id, t.name AS team_name
  FROM limited l
  LEFT JOIN auth.users u ON u.id = l.user_id
  LEFT JOIN member m ON m.user_id = l.user_id
  LEFT JOIN public.teams t ON t.id = m.team_id;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_demande_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_demande public.demandes%ROWTYPE; v_role text; v_is_sub boolean; v_member public.team_members%ROWTYPE;
BEGIN
  SELECT * INTO v_demande FROM public.demandes WHERE id = p_demande_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'demande_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_demande.type <> 'join' THEN RAISE EXCEPTION 'demande_wrong_type' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.status <> 'pending' THEN RAISE EXCEPTION 'demande_not_pending' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.team_id IS NULL THEN RAISE EXCEPTION 'demande_no_team' USING ERRCODE = 'raise_exception'; END IF;
  v_role := lower(coalesce(v_demande.payload->>'desired_role', 'player'));
  IF v_role NOT IN ('player','substitute','coach') THEN v_role := 'player'; END IF;
  v_is_sub := (v_role = 'substitute');
  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute, accepted_at)
  VALUES (v_demande.tenant_id, v_demande.team_id, v_demande.user_id, v_role, nullif(v_demande.payload->>'user_battle_tag',''), v_is_sub, now())
  RETURNING * INTO v_member;
  UPDATE public.demandes SET status='approved', processed_at=now() WHERE id = p_demande_id;
  RETURN to_jsonb(v_member);
END; $function$
;

CREATE OR REPLACE FUNCTION public.approve_transfer_request(p_demande_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_demande public.demandes%ROWTYPE; v_role text; v_is_sub boolean; v_battle_tag text; v_current_team uuid; v_member public.team_members%ROWTYPE;
BEGIN
  SELECT * INTO v_demande FROM public.demandes WHERE id = p_demande_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'demande_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_demande.type <> 'transfer' THEN RAISE EXCEPTION 'demande_wrong_type' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.status <> 'pending' THEN RAISE EXCEPTION 'demande_not_pending' USING ERRCODE = 'raise_exception'; END IF;
  IF v_demande.team_id IS NULL THEN RAISE EXCEPTION 'demande_no_team' USING ERRCODE = 'raise_exception'; END IF;
  v_role := lower(coalesce(v_demande.payload->>'desired_role', 'player'));
  IF v_role NOT IN ('player','substitute','coach') THEN v_role := 'player'; END IF;
  v_is_sub := (v_role = 'substitute');
  SELECT team_id, battle_tag INTO v_current_team, v_battle_tag FROM public.team_members
    WHERE tenant_id = v_demande.tenant_id AND user_id = v_demande.user_id FOR UPDATE;
  IF v_current_team = v_demande.team_id THEN
    UPDATE public.demandes SET status='approved', processed_at=now() WHERE id = p_demande_id;
    SELECT * INTO v_member FROM public.team_members WHERE tenant_id = v_demande.tenant_id AND user_id = v_demande.user_id;
    RETURN to_jsonb(v_member);
  END IF;
  v_battle_tag := coalesce(nullif(v_demande.payload->>'user_battle_tag',''), v_battle_tag);
  IF v_current_team IS NOT NULL THEN
    DELETE FROM public.team_members WHERE tenant_id = v_demande.tenant_id AND user_id = v_demande.user_id;
  END IF;
  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute, accepted_at)
  VALUES (v_demande.tenant_id, v_demande.team_id, v_demande.user_id, v_role, v_battle_tag, v_is_sub, now())
  RETURNING * INTO v_member;
  UPDATE public.demandes SET status='approved', processed_at=now() WHERE id = p_demande_id;
  RETURN to_jsonb(v_member);
END; $function$
;

CREATE OR REPLACE FUNCTION public.caster_presence_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_supporter_role_on_roster_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     text;
  v_nouveau  text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.raw_user_meta_data->>'role'
    INTO v_role
    FROM auth.users u
   WHERE u.id = NEW.user_id;

  IF v_role IS DISTINCT FROM 'supporter' THEN
    RETURN NULL;
  END IF;

  v_nouveau := CASE WHEN NEW.role = 'manager' THEN 'manager' ELSE 'player' END;

  BEGIN
    UPDATE auth.users u
       SET raw_user_meta_data =
             (COALESCE(u.raw_user_meta_data, '{}'::jsonb)
              || jsonb_build_object('role', v_nouveau))
             - 'previous_role'
     WHERE u.id = NEW.user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'clear_supporter_role_on_roster_join: role non mis a jour pour % (%)',
      NEW.user_id, SQLERRM;
  END;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_api_usage(p_tenant_id uuid, p_minute_key text, p_month_key text)
 RETURNS TABLE(minute_count integer, month_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_minute integer;
  v_month integer;
BEGIN
  INSERT INTO public.api_usage_counters (tenant_id, window_kind, window_key, count, updated_at)
  VALUES (p_tenant_id, 'minute', p_minute_key, 1, now())
  ON CONFLICT (tenant_id, window_kind, window_key)
  DO UPDATE SET count = api_usage_counters.count + 1, updated_at = now()
  RETURNING count INTO v_minute;

  INSERT INTO public.api_usage_counters (tenant_id, window_kind, window_key, count, updated_at)
  VALUES (p_tenant_id, 'month', p_month_key, 1, now())
  ON CONFLICT (tenant_id, window_kind, window_key)
  DO UPDATE SET count = api_usage_counters.count + 1, updated_at = now()
  RETURNING count INTO v_month;

  RETURN QUERY SELECT v_minute, v_month;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w    timestamptz;
  cnt  int;
BEGIN
  w := to_timestamp(
         floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
       );

  INSERT INTO public.rate_limit_buckets (bucket, window_start, hits)
  VALUES (p_bucket, w, 1)
  ON CONFLICT (bucket, window_start)
    DO UPDATE SET hits = rate_limit_buckets.hits + 1
  RETURNING hits INTO cnt;

  RETURN cnt <= p_max;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.count_confirmed_auth_users()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT count(*)
  FROM auth.users
  WHERE email_confirmed_at IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.designate_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

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
    IF NOT EXISTS (
      SELECT 1 FROM staff WHERE auth_user_id = NEW.auth_user_id
    ) THEN
      RAISE EXCEPTION
        'cast_members.auth_user_id (%) doit referencer un membre du staff',
        NEW.auth_user_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_team_max_players()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INTEGER;
  v_min_max_players INTEGER;
BEGIN
  -- Encadrement : hors quota, quoi qu'il arrive.
  IF NEW.role IN ('coach', 'manager') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM team_members
  WHERE team_id = NEW.team_id AND role NOT IN ('coach', 'manager');

  IF TG_OP = 'INSERT' THEN
    v_count := v_count + 1;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.role IN ('coach', 'manager')
        AND NEW.role NOT IN ('coach', 'manager') THEN
    v_count := v_count + 1;
  END IF;

  SELECT MIN(t.max_players) INTO v_min_max_players
  FROM tournament_teams tt
  INNER JOIN tournaments t ON t.id = tt.tournament_id
  WHERE tt.team_id = NEW.team_id AND t.max_players IS NOT NULL;

  IF v_min_max_players IS NOT NULL AND v_count > v_min_max_players THEN
    RAISE EXCEPTION
      'team % exceeds tournament max_players limit (% > %)',
      NEW.team_id, v_count, v_min_max_players
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.entity_blacklist_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.event_runs_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.event_segments_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.event_stations_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.event_waves_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.final_rankings_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_member_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  year_prefix TEXT;
  next_number INTEGER;
BEGIN
  IF NEW.member_number IS NULL THEN
    year_prefix := TO_CHAR(NEW.join_date, 'YYYY');

    SELECT COALESCE(MAX(
      CAST(SUBSTRING(member_number FROM 6) AS INTEGER)
    ), 0) + 1
    INTO next_number
    FROM adherents
    WHERE member_number LIKE year_prefix || '-%';

    NEW.member_number := year_prefix || '-' || LPAD(next_number::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT u.id
  FROM auth.users u
  WHERE nullif(lower(trim(p_email)), '') IS NOT NULL
    AND lower(u.email) = lower(trim(p_email))
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_caster_scenes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_caster_themes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.introspect_foreign_keys()
 RETURNS TABLE(constraint_name text, source_table text, target_table text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.conname::text,
         src.relname::text,
         tgt.relname::text
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE c.contype = 'f'
     AND n.nspname = 'public'
   ORDER BY c.conname;
$function$
;

CREATE OR REPLACE FUNCTION public.match_predictions_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.predicted_winner_team_id IS NOT DISTINCT FROM OLD.predicted_winner_team_id
     AND NEW.match_id = OLD.match_id
     AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'prediction_locked' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.tenant_id, m.team1_id, m.team2_id, m.status, m.started_at,
         m.scheduled_at, m.deleted_at, m.is_bye, m.scrim_id
    INTO v_match
    FROM public.matches m
   WHERE m.id = NEW.match_id
   FOR SHARE;

  IF NOT FOUND
     OR v_match.tenant_id <> NEW.tenant_id
     OR v_match.deleted_at IS NOT NULL
     OR COALESCE(v_match.is_bye, false)
     OR v_match.scrim_id IS NOT NULL
     OR v_match.team1_id IS NULL
     OR v_match.team2_id IS NULL THEN
    RAISE EXCEPTION 'prediction_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_match.status <> 'pending'
     OR v_match.started_at IS NOT NULL
     OR (v_match.scheduled_at IS NOT NULL AND v_match.scheduled_at <= now()) THEN
    RAISE EXCEPTION 'prediction_locked' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.predicted_winner_team_id <> v_match.team1_id
     AND NEW.predicted_winner_team_id <> v_match.team2_id THEN
    RAISE EXCEPTION 'prediction_team_invalid' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.result := NULL;
    NEW.settled_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_score_reports_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.player_action_snoozes_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.player_blacklist_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.player_ratings_leagues_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pool_place(p_tenant_id uuid, p_tournament_id uuid, p_entry_ids uuid[], p_team_id uuid, p_team_size integer DEFAULT 5)
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
$function$
;

CREATE OR REPLACE FUNCTION public.pool_register(p_tenant_id uuid, p_tournament_id uuid, p_user_id uuid, p_display_name text, p_battle_tag text, p_origin_team_id uuid, p_team_size integer DEFAULT 5)
 RETURNS TABLE(entry_id uuid, entry_status text, team_registered boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry public.tournament_pool_entries%ROWTYPE;
  v_ready integer;
  v_registered boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pool_register:' || p_tournament_id::text));

  SELECT * INTO v_entry
    FROM public.tournament_pool_entries
   WHERE tournament_id = p_tournament_id AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.tournament_pool_entries
      (tenant_id, tournament_id, user_id, display_name, battle_tag, origin_team_id)
    VALUES
      (p_tenant_id, p_tournament_id, p_user_id, p_display_name, p_battle_tag, p_origin_team_id)
    RETURNING * INTO v_entry;
  ELSIF v_entry.status = 'placed' THEN
    UPDATE public.tournament_pool_entries
       SET display_name = p_display_name, battle_tag = p_battle_tag, updated_at = now()
     WHERE id = v_entry.id
    RETURNING * INTO v_entry;
  ELSE
    UPDATE public.tournament_pool_entries
       SET display_name = p_display_name,
           battle_tag = p_battle_tag,
           origin_team_id = p_origin_team_id,
           status = 'waitlist',
           updated_at = now()
     WHERE id = v_entry.id
    RETURNING * INTO v_entry;
  END IF;

  IF v_entry.status = 'waitlist'
     AND v_entry.origin_team_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.tournament_teams
        WHERE tournament_id = p_tournament_id AND team_id = v_entry.origin_team_id
     )
  THEN
    SELECT count(*) INTO v_ready
      FROM public.tournament_pool_entries
     WHERE tournament_id = p_tournament_id
       AND origin_team_id = v_entry.origin_team_id
       AND status = 'waitlist';

    IF v_ready >= p_team_size THEN
      UPDATE public.tournament_pool_entries e
         SET status = 'placed',
             placed_team_id = e.origin_team_id,
             placed_at = now(),
             updated_at = now()
       WHERE e.id IN (
         SELECT id FROM public.tournament_pool_entries
          WHERE tournament_id = p_tournament_id
            AND origin_team_id = v_entry.origin_team_id
            AND status = 'waitlist'
          ORDER BY created_at, id
          LIMIT p_team_size
       );

      INSERT INTO public.tournament_teams (tenant_id, tournament_id, team_id, status)
      VALUES (p_tenant_id, p_tournament_id, v_entry.origin_team_id, 'registered')
      ON CONFLICT (tournament_id, team_id) DO NOTHING;

      INSERT INTO public.stage_teams (stage_id, team_id, tenant_id)
      SELECT s.id, v_entry.origin_team_id, p_tenant_id
        FROM public.tournament_stages s
       WHERE s.tournament_id = p_tournament_id
      ON CONFLICT (stage_id, team_id) DO NOTHING;

      v_registered := true;

      SELECT * INTO v_entry FROM public.tournament_pool_entries WHERE id = v_entry.id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_entry.id, v_entry.status, v_registered;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pool_unplace(p_tenant_id uuid, p_tournament_id uuid, p_entry_id uuid)
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
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid)
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
$function$
;

CREATE OR REPLACE FUNCTION public.scrim_plannings_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scrim_score_reports_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scrim_searches_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scrims_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.slugify_text(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s text;
BEGIN
  IF input IS NULL OR length(btrim(input)) = 0 THEN
    RETURN 'team';
  END IF;
  s := lower(public.unaccent(input));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF length(s) = 0 THEN
    RETURN 'team';
  END IF;
  RETURN substring(s FROM 1 FOR 64);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_cast_members_on_staff_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_team_member_battletag_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link_tag   text;
  v_link_bnet  text;
  v_link_when  timestamptz;
BEGIN
  IF NEW.user_id IS NULL OR NEW.battle_tag IS NULL OR btrim(NEW.battle_tag) = '' THEN
    NEW.battle_tag_verified_at := NULL;
    NEW.verified_battle_net_id := NULL;
    RETURN NEW;
  END IF;

  SELECT l.battle_tag, l.battle_net_id, l.verified_at
    INTO v_link_tag, v_link_bnet, v_link_when
    FROM public.user_battlenet_links l
   WHERE l.auth_user_id = NEW.user_id;

  IF v_link_tag IS NOT NULL
     AND lower(btrim(v_link_tag)) = lower(btrim(NEW.battle_tag))
  THEN
    NEW.battle_tag_verified_at := COALESCE(v_link_when, now());
    NEW.verified_battle_net_id := v_link_bnet;
  ELSE
    NEW.battle_tag_verified_at := NULL;
    NEW.verified_battle_net_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tenant_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.is_active := (new.lifecycle_state = 'active');
    return new;
  end if;

  if new.lifecycle_state is distinct from old.lifecycle_state then
    -- L'état fait foi.
    new.is_active := (new.lifecycle_state = 'active');
  elsif new.is_active is distinct from old.is_active then
    -- Écriture héritée sur le booléen : on la traduit.
    new.lifecycle_state := case when new.is_active then 'active' else 'archived' end;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_accept_trade(p_tenant_id uuid, p_trade_id uuid, p_user_id uuid, p_max_accepted_per_day integer, p_min_account_age_days integer, p_min_collection_age_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_proposer uuid;
  v_recipient uuid;
  v_trade public.tcg_trades%ROWTYPE;
  v_expected integer;
  v_locked integer := 0;
  v_count integer;
  v_item record;
  v_copy record;
  v_req_ords smallint[] := '{}';
  v_req_packs uuid[] := '{}';
  v_req_positions smallint[] := '{}';
  v_req_rarities text[] := '{}';
  v_req_foils boolean[] := '{}';
  v_proposer_pack uuid;
  v_recipient_pack uuid;
  v_pos integer;
  v_i integer;
  v_cancelled jsonb := '[]'::jsonb;
BEGIN
  -- a) La paire, sans verrou.
  SELECT proposer_id, recipient_id INTO v_proposer, v_recipient
    FROM public.tcg_trades
   WHERE id = p_trade_id AND tenant_id = p_tenant_id;
  IF NOT FOUND OR v_recipient <> p_user_id THEN
    -- 404 côté route : on ne confirme pas l'existence d'une proposition qui
    -- n'est pas adressée à l'appelante.
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- b) Verrous consultatifs, ordre stable.
  IF v_proposer::text < v_recipient::text THEN
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_proposer));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_recipient));
  ELSE
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_recipient));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_proposer));
  END IF;

  -- c) La proposition, verrouillée et relue.
  SELECT * INTO v_trade FROM public.tcg_trades
   WHERE id = p_trade_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Supprimée entre la lecture et le verrou : sans ce test, `v_trade.status`
    -- vaudrait NULL et aucune des comparaisons suivantes ne l'arrêterait.
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_trade.status = 'accepted' THEN
    RETURN jsonb_build_object('status', 'already_accepted', 'tradeId', v_trade.id,
      'proposerId', v_trade.proposer_id, 'recipientId', v_trade.recipient_id);
  END IF;
  IF v_trade.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'not_pending', 'current', v_trade.status);
  END IF;
  IF v_trade.expires_at <= v_now THEN
    -- Transition faite ICI : c'est cet appel, et lui seul, qui l'annonce.
    UPDATE public.tcg_trades SET status = 'expired', resolved_at = v_now
     WHERE id = v_trade.id;
    RETURN jsonb_build_object('status', 'expired', 'tradeId', v_trade.id,
      'proposerId', v_trade.proposer_id, 'recipientId', v_trade.recipient_id);
  END IF;

  -- d) Plafond d'échanges acceptés par 24 h glissantes, pour CHACUNE des deux.
  --    Garde multi-comptes : même à parité, un réseau de comptes secondaires ne
  --    peut faire converger qu'un nombre borné de cartes par jour.
  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND status = 'accepted'
     AND resolved_at > v_now - interval '24 hours'
     AND (proposer_id = v_trade.recipient_id OR recipient_id = v_trade.recipient_id);
  IF v_count >= p_max_accepted_per_day THEN
    RETURN jsonb_build_object('status', 'daily_limit');
  END IF;
  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND status = 'accepted'
     AND resolved_at > v_now - interval '24 hours'
     AND (proposer_id = v_trade.proposer_id OR recipient_id = v_trade.proposer_id);
  IF v_count >= p_max_accepted_per_day THEN
    RETURN jsonb_build_object('status', 'partner_daily_limit');
  END IF;

  -- Ancienneté revérifiée (défense en profondeur ; l'activation l'exigeait).
  IF NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, v_trade.recipient_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false)
     OR NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, v_trade.proposer_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'not_eligible');
  END IF;

  -- e) RE-VÉRIFICATION des cartes offertes, verrouillées : toujours au paquet
  --    OUVERT de la proposante, dans cet espace, non recyclées, et du même
  --    sujet qu'à la proposition. Une ligne recyclée ou déplacée entre-temps ne
  --    passe pas le filtre (Postgres réévalue le WHERE sur la version
  --    committée d'une ligne qu'il a dû attendre).
  SELECT count(*) INTO v_expected FROM public.tcg_trade_items
   WHERE trade_id = v_trade.id AND side = 'offered';

  FOR v_item IN
    SELECT pc.pack_id
      FROM public.tcg_trade_items i
      JOIN public.tcg_pack_cards pc
        ON pc.pack_id = i.from_pack_id AND pc.position = i.from_position
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE i.trade_id = v_trade.id
       AND i.side = 'offered'
       AND p.tenant_id = p_tenant_id
       AND p.user_id = v_trade.proposer_id
       AND p.opened_at IS NOT NULL
       AND public.tcg_pack_source_tradeable(p.source_kind)
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = i.subject_kind
       AND pc.card_user_id IS NOT DISTINCT FROM i.card_user_id
       AND pc.card_team_id IS NOT DISTINCT FROM i.card_team_id
       AND pc.card_map_slug IS NOT DISTINCT FROM i.card_map_slug
       AND pc.card_fanart_id IS NOT DISTINCT FROM i.card_fanart_id
       AND pc.card_mascot_slug IS NOT DISTINCT FROM i.card_mascot_slug
     ORDER BY pc.pack_id, pc.position
     FOR UPDATE OF pc
  LOOP
    v_locked := v_locked + 1;
  END LOOP;

  IF v_locked < v_expected THEN
    -- La proposante n'a plus ce qu'elle offrait : la proposition devient
    -- caduque PROPREMENT (annulée par le système, annoncée à la proposante),
    -- plutôt que de rester acceptable en apparence et refusée à chaque clic.
    UPDATE public.tcg_trades
       SET status = 'cancelled', resolution_reason = 'offered_unavailable', resolved_at = v_now
     WHERE id = v_trade.id;
    RETURN jsonb_build_object('status', 'stale', 'tradeId', v_trade.id,
      'proposerId', v_trade.proposer_id, 'recipientId', v_trade.recipient_id);
  END IF;

  -- f) Cartes demandées : l'exemplaire le MOINS précieux de la destinataire,
  --    de préférence non engagé dans ses propres propositions, verrouillé.
  FOR v_item IN
    SELECT ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
           card_fanart_id, card_mascot_slug
      FROM public.tcg_trade_items
     WHERE trade_id = v_trade.id AND side = 'requested'
     ORDER BY ordinal
  LOOP
    SELECT pc.pack_id, pc.position, pc.rarity, pc.is_foil
      INTO v_copy
      FROM public.tcg_pack_cards pc
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE p.tenant_id = p_tenant_id
       AND p.user_id = v_trade.recipient_id
       AND p.opened_at IS NOT NULL
       AND public.tcg_pack_source_tradeable(p.source_kind)
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = v_item.subject_kind
       AND pc.card_user_id IS NOT DISTINCT FROM v_item.card_user_id
       AND pc.card_team_id IS NOT DISTINCT FROM v_item.card_team_id
       AND pc.card_map_slug IS NOT DISTINCT FROM v_item.card_map_slug
       AND pc.card_fanart_id IS NOT DISTINCT FROM v_item.card_fanart_id
       AND pc.card_mascot_slug IS NOT DISTINCT FROM v_item.card_mascot_slug
     ORDER BY
       EXISTS (
         SELECT 1 FROM public.tcg_trade_items oi
           JOIN public.tcg_trades ot ON ot.id = oi.trade_id
          WHERE oi.side = 'offered'
            AND oi.from_pack_id = pc.pack_id
            AND oi.from_position = pc.position
            AND ot.status = 'pending'
       ),
       public.tcg_rarity_rank(pc.rarity), pc.is_foil, pc.pack_id, pc.position
     LIMIT 1
     FOR UPDATE OF pc;

    IF NOT FOUND THEN
      -- Rien n'a été écrit : la transaction rend ses verrous, la proposition
      -- reste en attente. On ne l'annule PAS — l'annoncer à la proposante lui
      -- apprendrait ce que la destinataire ne possède plus.
      RETURN jsonb_build_object('status', 'requested_unavailable');
    END IF;

    v_req_ords := v_req_ords || v_item.ordinal;
    v_req_packs := v_req_packs || v_copy.pack_id;
    v_req_positions := v_req_positions || v_copy.position;
    v_req_rarities := v_req_rarities || v_copy.rarity;
    v_req_foils := v_req_foils || v_copy.is_foil;
  END LOOP;

  -- g) Écriture. Deux paquets `trade`, ouverts d'emblée.
  INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at)
  VALUES (p_tenant_id, v_trade.recipient_id, 'trade', NULL, v_now, v_now)
  RETURNING id INTO v_recipient_pack;

  INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at)
  VALUES (p_tenant_id, v_trade.proposer_id, 'trade', NULL, v_now, v_now)
  RETURNING id INTO v_proposer_pack;

  -- Offertes → destinataire. La LIGNE change de paquet : rareté et brillance
  -- du tirage la suivent, aucune image n'existe à recopier.
  v_pos := 0;
  FOR v_item IN
    SELECT ordinal, from_pack_id, from_position
      FROM public.tcg_trade_items
     WHERE trade_id = v_trade.id AND side = 'offered'
     ORDER BY ordinal
  LOOP
    UPDATE public.tcg_pack_cards
       SET pack_id = v_recipient_pack, position = v_pos
     WHERE pack_id = v_item.from_pack_id AND position = v_item.from_position;
    UPDATE public.tcg_trade_items
       SET to_pack_id = v_recipient_pack, to_position = v_pos
     WHERE trade_id = v_trade.id AND side = 'offered' AND ordinal = v_item.ordinal;
    v_pos := v_pos + 1;
  END LOOP;

  -- Demandées → proposante.
  FOR v_i IN 1 .. COALESCE(array_length(v_req_ords, 1), 0) LOOP
    UPDATE public.tcg_pack_cards
       SET pack_id = v_proposer_pack, position = v_i - 1
     WHERE pack_id = v_req_packs[v_i] AND position = v_req_positions[v_i];
    UPDATE public.tcg_trade_items
       SET from_pack_id = v_req_packs[v_i],
           from_position = v_req_positions[v_i],
           rarity = v_req_rarities[v_i],
           is_foil = v_req_foils[v_i],
           to_pack_id = v_proposer_pack,
           to_position = v_i - 1
     WHERE trade_id = v_trade.id AND side = 'requested' AND ordinal = v_req_ords[v_i];
  END LOOP;

  UPDATE public.tcg_trades
     SET status = 'accepted', resolved_at = v_now,
         proposer_pack_id = v_proposer_pack, recipient_pack_id = v_recipient_pack
   WHERE id = v_trade.id;

  -- h) Caducité en cascade : toute AUTRE proposition en attente qui offrait un
  --    exemplaire qui vient de bouger ne peut plus aboutir. On l'annule tout de
  --    suite (système) plutôt que de laisser sa destinataire tomber dessus.
  WITH moved AS (
    SELECT from_pack_id, from_position FROM public.tcg_trade_items
     WHERE trade_id = v_trade.id AND from_pack_id IS NOT NULL
  ), hit AS (
    UPDATE public.tcg_trades t
       SET status = 'cancelled', resolution_reason = 'card_unavailable', resolved_at = v_now
     WHERE t.tenant_id = p_tenant_id
       AND t.status = 'pending'
       AND t.id <> v_trade.id
       AND EXISTS (
         SELECT 1 FROM public.tcg_trade_items i
           JOIN moved m ON m.from_pack_id = i.from_pack_id AND m.from_position = i.from_position
          WHERE i.trade_id = t.id AND i.side = 'offered'
       )
    RETURNING t.id, t.proposer_id, t.recipient_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tradeId', id, 'proposerId', proposer_id, 'recipientId', recipient_id)), '[]'::jsonb)
    INTO v_cancelled
    FROM hit;

  RETURN jsonb_build_object(
    'status', 'accepted',
    'tradeId', v_trade.id,
    'proposerId', v_trade.proposer_id,
    'recipientId', v_trade.recipient_id,
    'proposerPackId', v_proposer_pack,
    'recipientPackId', v_recipient_pack,
    'cancelled', v_cancelled
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_admin_debit(p_tenant_id uuid, p_user_id uuid, p_cost integer, p_source_ref text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sum bigint;
  v_entry_id uuid;
  v_balance integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_cost IS NULL OR p_cost <= 0
     OR p_source_ref IS NULL OR length(p_source_ref) = 0 THEN
    RAISE EXCEPTION 'invalid_debit' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance)
  VALUES (p_tenant_id, p_user_id, 0)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  PERFORM 1
  FROM public.tcg_wallets
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  IF v_sum < p_cost THEN
    v_balance := LEAST(GREATEST(v_sum, 0), 2147483647)::integer;
    UPDATE public.tcg_wallets
    SET balance = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    RETURN jsonb_build_object('status', 'insufficient', 'balance', v_balance);
  END IF;
  INSERT INTO public.tcg_wallet_entries (
    tenant_id, user_id, amount, source_kind, source_ref, note
  )
  VALUES (p_tenant_id, p_user_id, -p_cost, 'admin_grant', p_source_ref, p_note)
  RETURNING id INTO v_entry_id;
  v_balance := LEAST(GREATEST(v_sum - p_cost, 0), 2147483647)::integer;
  UPDATE public.tcg_wallets
  SET balance = v_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  RETURN jsonb_build_object(
    'status', 'ok',
    'entry_id', v_entry_id,
    'balance', v_balance
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_buy_cosmetic(p_tenant_id uuid, p_user_id uuid, p_key text, p_price integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_balance integer;
  v_owned text[];
BEGIN
  IF p_price < 0 THEN
    RAISE EXCEPTION 'cosmetic_invalid_price';
  END IF;

  -- La ligne de vitrine existe peut-être déjà, peut-être pas : on la crée sans
  -- rien poser, pour pouvoir la verrouiller ensuite.
  INSERT INTO public.tcg_showcases (tenant_id, user_id)
  VALUES (p_tenant_id, p_user_id)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- Verrou de ligne : deux achats simultanés du même cosmétique ne doivent pas
  -- passer tous les deux la vérification « déjà acheté ».
  SELECT unlocked_cosmetics INTO v_owned
    FROM public.tcg_showcases
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id
   FOR UPDATE;

  IF p_key = ANY (coalesce(v_owned, '{}'::text[])) THEN
    RAISE EXCEPTION 'cosmetic_already_owned';
  END IF;

  -- Le solde vient du REGISTRE, pas de son cache : un cache périmé
  -- autoriserait une dépense à découvert.
  SELECT coalesce(sum(amount), 0) INTO v_balance
    FROM public.tcg_wallet_entries
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_balance < p_price THEN
    RAISE EXCEPTION 'cosmetic_insufficient_funds';
  END IF;

  INSERT INTO public.tcg_wallet_entries
    (tenant_id, user_id, amount, source_kind, source_ref, created_at)
  VALUES (p_tenant_id, p_user_id, -p_price, 'showcase_cosmetic',
          'cosmetic:' || p_key, v_now);

  UPDATE public.tcg_showcases
     SET unlocked_cosmetics = array_append(coalesce(unlocked_cosmetics, '{}'::text[]), p_key),
         updated_at = v_now
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance, updated_at)
  VALUES (p_tenant_id, p_user_id, v_balance - p_price, v_now)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('ok', true, 'balance', v_balance - p_price);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_forge_card(p_tenant_id uuid, p_user_id uuid, p_cards jsonb, p_fee integer, p_rarity text, p_subject_kind text, p_card_user_id uuid DEFAULT NULL::uuid, p_card_team_id uuid DEFAULT NULL::uuid, p_card_map_slug text DEFAULT NULL::text, p_card_mascot_slug text DEFAULT NULL::text, p_card_fanart_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_expected integer := jsonb_array_length(p_cards);
  v_marked integer := 0;
  v_balance integer;
  v_pack_id uuid;
  v_ref text;
  v_orphan integer;
BEGIN
  IF v_expected < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough');
  END IF;
  IF p_fee < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_fee');
  END IF;

  WITH wanted AS (
    SELECT (e->>'packId')::uuid AS pack_id, (e->>'position')::smallint AS position
    FROM jsonb_array_elements(p_cards) AS e
  ),
  mine AS (
    SELECT c.pack_id, c.position
    FROM public.tcg_pack_cards c
    JOIN public.tcg_packs p ON p.id = c.pack_id
    JOIN wanted w ON w.pack_id = c.pack_id AND w.position = c.position
    WHERE p.tenant_id = p_tenant_id
      AND p.user_id = p_user_id
      AND p.opened_at IS NOT NULL
      AND c.recycled_at IS NULL
  ),
  marked AS (
    UPDATE public.tcg_pack_cards c
       SET recycled_at = v_now
      FROM mine m
     WHERE c.pack_id = m.pack_id
       AND c.position = m.position
       AND c.recycled_at IS NULL
    RETURNING c.pack_id
  )
  SELECT count(*) INTO v_marked FROM marked;

  IF v_marked <> v_expected THEN
    RAISE EXCEPTION 'forge_cards_unavailable';
  END IF;

  SELECT count(*) INTO v_orphan
  FROM (
    SELECT DISTINCT coalesce(
             c.card_user_id::text, c.card_team_id::text,
             c.card_map_slug, c.card_mascot_slug, c.card_fanart_id::text
           ) AS subject_key
      FROM public.tcg_pack_cards c
      JOIN jsonb_array_elements(p_cards) AS e
        ON c.pack_id = (e->>'packId')::uuid
       AND c.position = (e->>'position')::smallint
  ) consumed
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.tcg_pack_cards c2
      JOIN public.tcg_packs p2 ON p2.id = c2.pack_id
     WHERE p2.tenant_id = p_tenant_id
       AND p2.user_id = p_user_id
       AND p2.opened_at IS NOT NULL
       AND c2.recycled_at IS NULL
       AND coalesce(
             c2.card_user_id::text, c2.card_team_id::text,
             c2.card_map_slug, c2.card_mascot_slug, c2.card_fanart_id::text
           ) = consumed.subject_key
  );

  IF v_orphan > 0 THEN
    RAISE EXCEPTION 'forge_would_empty_subject';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_balance
    FROM public.tcg_wallet_entries
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_balance < p_fee THEN
    RAISE EXCEPTION 'forge_insufficient_funds';
  END IF;

  v_ref := 'forge:' || (p_cards->0->>'packId') || ':' || (p_cards->0->>'position');
  INSERT INTO public.tcg_wallet_entries
    (tenant_id, user_id, amount, source_kind, source_ref, created_at)
  VALUES (p_tenant_id, p_user_id, -p_fee, 'card_forged', v_ref, v_now);

  INSERT INTO public.tcg_packs
    (tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at)
  VALUES (p_tenant_id, p_user_id, 'forge', NULL, v_now, v_now)
  RETURNING id INTO v_pack_id;

  INSERT INTO public.tcg_pack_cards
    (pack_id, position, subject_kind, card_user_id, card_team_id,
     card_map_slug, card_mascot_slug, card_fanart_id, rarity, is_foil)
  VALUES (v_pack_id, 0, p_subject_kind, p_card_user_id, p_card_team_id,
          p_card_map_slug, p_card_mascot_slug, p_card_fanart_id, p_rarity, false);

  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance, updated_at)
  VALUES (p_tenant_id, p_user_id, v_balance - p_fee, v_now)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'ok', true,
    'packId', v_pack_id,
    'rarity', p_rarity,
    'balance', v_balance - p_fee
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_pack_source_tradeable(p_source_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_source_kind IN ('victory', 'placement', 'purchase', 'trade');
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_propose_trade(p_tenant_id uuid, p_proposer_id uuid, p_recipient_id uuid, p_offered jsonb, p_requested jsonb, p_ttl_hours integer, p_max_cards integer, p_max_pending_sent integer, p_max_pending_received integer, p_decline_cooldown_hours integer, p_min_account_age_days integer, p_min_collection_age_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_n_offered integer;
  v_n_requested integer;
  v_count integer;
  v_item record;
  v_kind text;
  v_raw_id text;
  v_user uuid;
  v_team uuid;
  v_map text;
  v_fanart uuid;
  v_mascot text;
  v_copy record;
  v_trade_id uuid;
  v_expires timestamptz;
  v_offered_rows jsonb := '[]'::jsonb;
  v_requested_rows jsonb := '[]'::jsonb;
  v_rarity text;
  v_foil boolean;
  v_tradeable integer;
BEGIN
  -- 0) Forme. Le JSON a déjà été validé par zod côté route ; on revérifie ce
  --    dont la sûreté dépend, parce que la fonction ne doit pas avoir à
  --    faire confiance à son appelant.
  IF p_offered IS NULL OR jsonb_typeof(p_offered) <> 'array'
     OR p_requested IS NULL OR jsonb_typeof(p_requested) <> 'array' THEN
    RETURN jsonb_build_object('status', 'invalid_items');
  END IF;
  v_n_offered := jsonb_array_length(p_offered);
  v_n_requested := jsonb_array_length(p_requested);
  IF v_n_offered < 1 OR v_n_offered > LEAST(p_max_cards, 10)
     OR v_n_offered <> v_n_requested THEN
    -- Carte contre carte, À PARITÉ : jamais de don unilatéral, et un compte
    -- secondaire ne peut pas céder cinq cartes contre une seule.
    RETURN jsonb_build_object('status', 'invalid_items');
  END IF;
  -- Sujets distincts de chaque côté, et aucun sujet des deux côtés à la fois.
  IF (SELECT count(DISTINCT e.value) FROM jsonb_array_elements(p_offered) e) <> v_n_offered
     OR (SELECT count(DISTINCT e.value) FROM jsonb_array_elements(p_requested) e) <> v_n_requested
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_offered) o
       JOIN jsonb_array_elements(p_requested) r ON o.value = r.value
     ) THEN
    RETURN jsonb_build_object('status', 'invalid_items');
  END IF;

  IF p_proposer_id = p_recipient_id THEN
    RETURN jsonb_build_object('status', 'self_trade');
  END IF;

  -- 1) Verrous consultatifs sur les DEUX joueuses, dans un ordre stable (pas
  --    d'interblocage). Ils sérialisent les plafonds et l'engagement d'un
  --    exemplaire : deux propositions simultanées ne peuvent pas promettre la
  --    même carte, ni dépasser un plafond d'une unité.
  IF p_proposer_id::text < p_recipient_id::text THEN
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_proposer_id));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_recipient_id));
  ELSE
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_recipient_id));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_proposer_id));
  END IF;

  -- 2) Consentements. On ne sollicite que si l'on est soi-même sollicitable :
  --    personne ne peut envoyer des propositions en restant injoignable.
  IF NOT EXISTS (
    SELECT 1 FROM public.tcg_trade_settings
     WHERE tenant_id = p_tenant_id AND user_id = p_proposer_id AND accepts_proposals
  ) THEN
    RETURN jsonb_build_object('status', 'trading_disabled');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tcg_trade_settings
     WHERE tenant_id = p_tenant_id AND user_id = p_recipient_id AND accepts_proposals
  ) THEN
    -- Même réponse qu'une destinataire inexistante ou d'un autre espace : on
    -- ne confirme pas qui existe.
    RETURN jsonb_build_object('status', 'recipient_unavailable');
  END IF;

  -- 2 bis) Blocage orienté. Une personne bloquée n'apprend RIEN : meme code
  --    que ci-dessus, indistinguable d'une destinataire qui n'accepte pas les
  --    echanges. Un refus qui se distingue est un refus qui informe, et qui
  --    invite la represaille ailleurs. Place AVANT les plafonds et la lecture
  --    des cartes : aucun travail consomme, rien a lire dans le temps de
  --    reponse.
  IF EXISTS (
    SELECT 1 FROM public.tcg_trade_blocks
     WHERE tenant_id = p_tenant_id
       AND user_id = p_recipient_id
       AND blocked_user_id = p_proposer_id
  ) THEN
    RETURN jsonb_build_object('status', 'recipient_unavailable');
  END IF;

  -- 3) Ancienneté du compte ET de la collection (garde multi-comptes), pour
  --    les deux. L'activation l'exige déjà ; on la revérifie ici parce que la
  --    fonction ne doit pas dépendre de l'ordre des gestes de l'appelante.
  IF NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, p_proposer_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'collection_too_recent');
  END IF;
  IF NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, p_recipient_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'recipient_unavailable');
  END IF;

  -- 4) Plafonds d'attente. Une proposition échue mais pas encore marquée ne
  --    compte plus : `expires_at > now()`.
  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND proposer_id = p_proposer_id
     AND status = 'pending' AND expires_at > v_now;
  IF v_count >= p_max_pending_sent THEN
    RETURN jsonb_build_object('status', 'too_many_pending');
  END IF;

  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND recipient_id = p_recipient_id
     AND status = 'pending' AND expires_at > v_now;
  IF v_count >= p_max_pending_received THEN
    RETURN jsonb_build_object('status', 'recipient_inbox_full');
  END IF;

  -- Une seule par paire orientée (l'index unique partiel le garantit aussi ;
  -- le vérifier ici rend un code au lieu d'une violation 23505).
  IF EXISTS (
    SELECT 1 FROM public.tcg_trades
     WHERE tenant_id = p_tenant_id AND proposer_id = p_proposer_id
       AND recipient_id = p_recipient_id AND status = 'pending'
  ) THEN
    -- Une proposition échue mais non marquée bloquerait la paire : la route
    -- expire paresseusement AVANT d'appeler, ce cas reste donc rare.
    RETURN jsonb_build_object('status', 'already_pending');
  END IF;

  -- Un refus se respecte : pas de nouvelle proposition à la même personne
  -- avant le délai. Sans lui, « non » ne serait qu'une invitation à insister.
  IF EXISTS (
    SELECT 1 FROM public.tcg_trades
     WHERE tenant_id = p_tenant_id AND proposer_id = p_proposer_id
       AND recipient_id = p_recipient_id AND status = 'declined'
       AND resolved_at > v_now - make_interval(hours => p_decline_cooldown_hours)
  ) THEN
    RETURN jsonb_build_object('status', 'recently_declined');
  END IF;

  -- 5) Cartes offertes : pour chaque sujet, l'exemplaire le MOINS précieux de
  --    la proposante, possédé (paquet ouvert à elle, non recyclé) et non déjà
  --    engagé dans une autre proposition en attente. Verrouillé jusqu'à la fin
  --    de la transaction.
  FOR v_item IN
    SELECT e.value AS v, (e.ordinality - 1)::smallint AS ord
      FROM jsonb_array_elements(p_offered) WITH ORDINALITY e
  LOOP
    v_kind := v_item.v ->> 'kind';
    v_raw_id := v_item.v ->> 'id';
    v_user := NULL; v_team := NULL; v_map := NULL; v_fanart := NULL; v_mascot := NULL;
    IF v_kind IN ('player', 'team', 'fanart')
       AND v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF v_kind = 'player' THEN v_user := v_raw_id::uuid;
      ELSIF v_kind = 'team' THEN v_team := v_raw_id::uuid;
      ELSE v_fanart := v_raw_id::uuid; END IF;
    ELSIF v_kind = 'map' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_map := v_raw_id;
    ELSIF v_kind = 'mascot' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_mascot := v_raw_id;
    ELSE
      RETURN jsonb_build_object('status', 'invalid_items');
    END IF;

    SELECT pc.pack_id, pc.position, pc.rarity, pc.is_foil
      INTO v_copy
      FROM public.tcg_pack_cards pc
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE p.tenant_id = p_tenant_id
       AND p.user_id = p_proposer_id
       AND p.opened_at IS NOT NULL
       AND public.tcg_pack_source_tradeable(p.source_kind)
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = v_kind
       AND (v_user IS NULL OR pc.card_user_id = v_user)
       AND (v_team IS NULL OR pc.card_team_id = v_team)
       AND (v_map IS NULL OR pc.card_map_slug = v_map)
       AND (v_fanart IS NULL OR pc.card_fanart_id = v_fanart)
       AND (v_mascot IS NULL OR pc.card_mascot_slug = v_mascot)
       AND NOT EXISTS (
         SELECT 1 FROM public.tcg_trade_items i
           JOIN public.tcg_trades t ON t.id = i.trade_id
          WHERE i.side = 'offered'
            AND i.from_pack_id = pc.pack_id
            AND i.from_position = pc.position
            AND t.status = 'pending'
            AND t.expires_at > v_now
       )
     ORDER BY public.tcg_rarity_rank(pc.rarity), pc.is_foil, pc.pack_id, pc.position
     LIMIT 1
     FOR UPDATE OF pc;

    IF NOT FOUND THEN
      -- Ni possédée, ni échangeable (paquet cadeau, série, drop), ni libre :
      -- un seul code, la joueuse sait ce qu'elle a.
      RETURN jsonb_build_object('status', 'offered_not_owned', 'kind', v_kind, 'id', v_raw_id);
    END IF;

    v_offered_rows := v_offered_rows || jsonb_build_object(
      'ord', v_item.ord, 'kind', v_kind, 'user', v_user, 'team', v_team, 'map', v_map,
      'fanart', v_fanart, 'mascot', v_mascot,
      'pack', v_copy.pack_id, 'position', v_copy.position,
      'rarity', v_copy.rarity, 'foil', v_copy.is_foil
    );
  END LOOP;

  -- 6) Cartes demandées : seulement ce que la destinataire MONTRE, c'est-à-dire
  --    un sujet dont elle a au moins deux exemplaires. On ne verrouille rien
  --    chez elle : une demande ne doit pas pouvoir geler la collection d'une
  --    autre (sinon demander = empêcher de recycler). La possession est
  --    revérifiée à l'acceptation.
  FOR v_item IN
    SELECT e.value AS v, (e.ordinality - 1)::smallint AS ord
      FROM jsonb_array_elements(p_requested) WITH ORDINALITY e
  LOOP
    v_kind := v_item.v ->> 'kind';
    v_raw_id := v_item.v ->> 'id';
    v_user := NULL; v_team := NULL; v_map := NULL; v_fanart := NULL; v_mascot := NULL;
    IF v_kind IN ('player', 'team', 'fanart')
       AND v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF v_kind = 'player' THEN v_user := v_raw_id::uuid;
      ELSIF v_kind = 'team' THEN v_team := v_raw_id::uuid;
      ELSE v_fanart := v_raw_id::uuid; END IF;
    ELSIF v_kind = 'map' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_map := v_raw_id;
    ELSIF v_kind = 'mascot' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_mascot := v_raw_id;
    ELSE
      RETURN jsonb_build_object('status', 'invalid_items');
    END IF;

    -- Le compte ET la rareté de l'exemplaire qu'elle céderait (le moins
    -- précieux) : c'est ce que sa vitrine de doubles montre déjà, rien de plus.
    -- La rareté réelle est réécrite à l'acceptation.
    --
    -- DEUX CONDITIONS : au moins deux exemplaires (on ne demande que ce qu'elle
    -- a en double) ET au moins un exemplaire ÉCHANGEABLE — c'est lui qui
    -- partira, jamais une carte de paquet cadeau.
    SELECT count(*),
           count(*) FILTER (WHERE public.tcg_pack_source_tradeable(p.source_kind)),
           (array_agg(pc.rarity ORDER BY public.tcg_rarity_rank(pc.rarity), pc.is_foil)
              FILTER (WHERE public.tcg_pack_source_tradeable(p.source_kind)))[1],
           (array_agg(pc.is_foil ORDER BY public.tcg_rarity_rank(pc.rarity), pc.is_foil)
              FILTER (WHERE public.tcg_pack_source_tradeable(p.source_kind)))[1]
      INTO v_count, v_tradeable, v_rarity, v_foil
      FROM public.tcg_pack_cards pc
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE p.tenant_id = p_tenant_id
       AND p.user_id = p_recipient_id
       AND p.opened_at IS NOT NULL
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = v_kind
       AND (v_user IS NULL OR pc.card_user_id = v_user)
       AND (v_team IS NULL OR pc.card_team_id = v_team)
       AND (v_map IS NULL OR pc.card_map_slug = v_map)
       AND (v_fanart IS NULL OR pc.card_fanart_id = v_fanart)
       AND (v_mascot IS NULL OR pc.card_mascot_slug = v_mascot);
    IF v_count < 2 OR v_tradeable < 1 THEN
      RETURN jsonb_build_object('status', 'requested_not_available', 'kind', v_kind, 'id', v_raw_id);
    END IF;

    v_requested_rows := v_requested_rows || jsonb_build_object(
      'ord', v_item.ord, 'kind', v_kind, 'user', v_user, 'team', v_team, 'map', v_map,
      'fanart', v_fanart, 'mascot', v_mascot,
      'rarity', v_rarity, 'foil', v_foil
    );
  END LOOP;

  -- 7) Écriture.
  v_expires := v_now + make_interval(hours => p_ttl_hours);
  INSERT INTO public.tcg_trades (tenant_id, proposer_id, recipient_id, status, created_at, expires_at)
  VALUES (p_tenant_id, p_proposer_id, p_recipient_id, 'pending', v_now, v_expires)
  RETURNING id INTO v_trade_id;

  INSERT INTO public.tcg_trade_items (
    trade_id, side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
    card_fanart_id, card_mascot_slug,
    rarity, is_foil, from_pack_id, from_position
  )
  SELECT v_trade_id, 'offered', (o ->> 'ord')::smallint, o ->> 'kind',
         (o ->> 'user')::uuid, (o ->> 'team')::uuid, o ->> 'map',
         (o ->> 'fanart')::uuid, o ->> 'mascot',
         o ->> 'rarity', (o ->> 'foil')::boolean,
         (o ->> 'pack')::uuid, (o ->> 'position')::smallint
    FROM jsonb_array_elements(v_offered_rows) o;

  -- Demandées : sujet + rareté ATTENDUE, sans exemplaire (`from_*` NULL).
  INSERT INTO public.tcg_trade_items (
    trade_id, side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
    card_fanart_id, card_mascot_slug,
    rarity, is_foil
  )
  SELECT v_trade_id, 'requested', (r ->> 'ord')::smallint, r ->> 'kind',
         (r ->> 'user')::uuid, (r ->> 'team')::uuid, r ->> 'map',
         (r ->> 'fanart')::uuid, r ->> 'mascot',
         r ->> 'rarity', (r ->> 'foil')::boolean
    FROM jsonb_array_elements(v_requested_rows) r;

  RETURN jsonb_build_object('status', 'proposed', 'tradeId', v_trade_id, 'expiresAt', v_expires);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_purchase_booster(p_tenant_id uuid, p_user_id uuid, p_price integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sum bigint;
  v_pack_id uuid;
  v_balance integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'invalid_purchase' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  IF v_sum < p_price THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_funds',
      'balance', GREATEST(v_sum, 0),
      'price', p_price
    );
  END IF;
  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance)
  VALUES (p_tenant_id, p_user_id, 0)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  PERFORM 1
  FROM public.tcg_wallets
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  IF v_sum < p_price THEN
    v_balance := LEAST(GREATEST(v_sum, 0), 2147483647)::integer;
    UPDATE public.tcg_wallets
    SET balance = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    RETURN jsonb_build_object(
      'status', 'insufficient_funds',
      'balance', v_balance,
      'price', p_price
    );
  END IF;
  INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id)
  VALUES (p_tenant_id, p_user_id, 'purchase', NULL)
  RETURNING id INTO v_pack_id;
  INSERT INTO public.tcg_wallet_entries (
    tenant_id, user_id, amount, source_kind, source_ref
  )
  VALUES (p_tenant_id, p_user_id, -p_price, 'booster_purchase', v_pack_id::text);
  v_balance := LEAST(GREATEST(v_sum - p_price, 0), 2147483647)::integer;
  UPDATE public.tcg_wallets
  SET balance = v_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  RETURN jsonb_build_object(
    'status', 'ok',
    'pack_id', v_pack_id,
    'balance', v_balance,
    'price', p_price
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_rarity_rank(p_rarity text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_rarity
    WHEN 'common' THEN 0
    WHEN 'rare' THEN 1
    WHEN 'epic' THEN 2
    WHEN 'legendary' THEN 3
    ELSE 4
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_refresh_wallet_balance(p_tenant_id uuid, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sum bigint;
  v_balance integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_wallet' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance)
  VALUES (p_tenant_id, p_user_id, 0)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  PERFORM 1
  FROM public.tcg_wallets
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  v_balance := LEAST(GREATEST(v_sum, 0), 2147483647)::integer;
  UPDATE public.tcg_wallets
  SET balance = v_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  RETURN v_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_trade_eligibility(p_tenant_id uuid, p_user_id uuid, p_min_account_age_days integer, p_min_collection_age_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account timestamptz;
  v_first_pack timestamptz;
  v_at timestamptz;
BEGIN
  SELECT created_at INTO v_account FROM auth.users WHERE id = p_user_id;
  SELECT min(granted_at) INTO v_first_pack FROM public.tcg_packs
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND source_kind <> 'trade';
  IF v_account IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'eligibleAt', NULL, 'reason', 'no_account');
  END IF;
  IF v_first_pack IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'eligibleAt', NULL, 'reason', 'no_collection');
  END IF;
  v_at := GREATEST(
    v_account + make_interval(days => p_min_account_age_days),
    v_first_pack + make_interval(days => p_min_collection_age_days)
  );
  RETURN jsonb_build_object(
    'eligible', v_at <= now(),
    'eligibleAt', v_at,
    'reason', CASE WHEN v_at <= now() THEN NULL ELSE 'too_recent' END
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT hashtextextended('tcg_trade:' || p_tenant_id::text || ':' || p_user_id::text, 0);
$function$
;

CREATE OR REPLACE FUNCTION public.team_availability_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.team_reviews_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.teams_set_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  base_slug text;
  candidate text;
  counter int;
BEGIN
  IF NEW.slug IS NULL OR length(btrim(NEW.slug)) = 0 THEN
    base_slug := public.slugify_text(NEW.name);
    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.teams
      WHERE slug = candidate AND id IS DISTINCT FROM NEW.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tenant_discord_config_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_match_drafts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_old uuid;
BEGIN
  SELECT captain_id INTO v_old FROM public.teams WHERE id = p_team_id AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_not_found' USING ERRCODE='no_data_found'; END IF;
  IF v_old IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'not_captain' USING ERRCODE='raise_exception'; END IF;
  IF p_new_captain = p_actor THEN RAISE EXCEPTION 'same_user' USING ERRCODE='raise_exception'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND tenant_id = p_tenant AND user_id = p_new_captain AND role <> 'coach'
  ) THEN RAISE EXCEPTION 'target_not_member' USING ERRCODE='raise_exception'; END IF;
  UPDATE public.teams SET captain_id = p_new_captain, updated_at = now() WHERE id = p_team_id AND tenant_id = p_tenant;
  RETURN jsonb_build_object('team_id', p_team_id, 'captain_id', p_new_captain, 'previous_captain', v_old);
END; $function$
;

CREATE OR REPLACE FUNCTION public.twitch_broadcaster_connections_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_adherents_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_association_pole_members_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_blizzard_media_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_blizzard_news_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_cast_members_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contact_submissions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_demandes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_free_players_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_partners_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_partnership_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_patch_notes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_site_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_team_openings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_map_pool_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenants_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_twitch_channels_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_web_push_deliveries_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

-- ---------------------------------------------------------------- TABLES
CREATE TABLE IF NOT EXISTS public.adherent_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  adherent_id uuid NOT NULL,
  year integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_date date NOT NULL,
  payment_method text,
  payment_reference text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.adherents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  birth_date date,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'France'::text,
  member_number text,
  join_date date DEFAULT CURRENT_DATE NOT NULL,
  current_year integer DEFAULT EXTRACT(year FROM CURRENT_DATE) NOT NULL,
  payment_status text DEFAULT 'pending'::text NOT NULL,
  payment_amount numeric(10,2) DEFAULT 0,
  payment_date date,
  payment_method text,
  payment_reference text,
  is_active boolean DEFAULT true,
  role text DEFAULT 'member'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  auth_user_id uuid,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.admin_idempotency (
  id bigint DEFAULT nextval('admin_idempotency_id_seq'::regclass) NOT NULL,
  cache_key text NOT NULL,
  status smallint NOT NULL,
  body jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  cta_label text,
  cta_url text,
  is_active boolean DEFAULT true NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.api_usage_counters (
  tenant_id uuid NOT NULL,
  window_kind text NOT NULL,
  window_key text NOT NULL,
  count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  alerted_at timestamp with time zone,
  alerted_threshold smallint
);

CREATE TABLE IF NOT EXISTS public.association_pole_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pole_key text NOT NULL,
  name text NOT NULL,
  title text,
  description text,
  image_url text,
  link_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blacklist_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  blacklist_entry_id uuid,
  discord_user_id text,
  battle_tag text,
  display_name text,
  matched_on text NOT NULL,
  strength text NOT NULL,
  criteria jsonb,
  reason text,
  source text NOT NULL,
  context text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.blizzard_media (
  id text NOT NULL,
  title text NOT NULL,
  type text NOT NULL,
  category text,
  link text NOT NULL,
  thumbnail_url text,
  description text,
  parts integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blizzard_news (
  id text NOT NULL,
  title text NOT NULL,
  date text NOT NULL,
  date_parsed date,
  link text NOT NULL,
  image_url text,
  category text,
  summary text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_event_outbox (
  id bigint DEFAULT nextval('bot_event_outbox_id_seq'::regclass) NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  push_attempts smallint DEFAULT 0 NOT NULL,
  last_push_error text,
  last_push_at timestamp with time zone,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bot_idempotency (
  id bigint DEFAULT nextval('bot_idempotency_id_seq'::regclass) NOT NULL,
  cache_key text NOT NULL,
  status smallint NOT NULL,
  body jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bot_locks (
  name text NOT NULL,
  holder text NOT NULL,
  acquired_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bot_player_actions (
  id bigint DEFAULT nextval('bot_player_actions_id_seq'::regclass) NOT NULL,
  actor_auth_user_id uuid NOT NULL,
  actor_discord_user_id text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  target_auth_user_id uuid,
  target_discord_user_id text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bracket_snapshots (
  id bigint DEFAULT nextval('bracket_snapshots_id_seq'::regclass) NOT NULL,
  stage_id uuid NOT NULL,
  taken_at timestamp with time zone DEFAULT now() NOT NULL,
  taken_by_staff_id uuid,
  reason text,
  matches_snapshot jsonb NOT NULL,
  match_count integer DEFAULT 0 NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.broadcast_email_optouts (
  email text NOT NULL,
  unsubscribed_at timestamp with time zone DEFAULT now() NOT NULL,
  source text
);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  campaign_id text NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  label text,
  status text DEFAULT 'pending'::text NOT NULL,
  sent_at timestamp with time zone,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.broadcast_schedules (
  campaign_id text NOT NULL,
  wave_size integer DEFAULT 10 NOT NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  last_wave_at timestamp with time zone,
  total_recipients integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.captcha_challenges (
  nonce text NOT NULL,
  answer_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts smallint DEFAULT 0 NOT NULL,
  consumed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.cast_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid,
  cast_member_id uuid NOT NULL,
  briefing_at timestamp with time zone NOT NULL,
  briefing_reminder_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  acked_at timestamp with time zone,
  tenant_id uuid NOT NULL,
  scrim_id uuid,
  role text
);

CREATE TABLE IF NOT EXISTS public.cast_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  title text,
  description text,
  image_url text,
  twitch_url text,
  city text,
  is_active boolean DEFAULT true,
  is_promo boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  auth_user_id uuid,
  tenant_id uuid NOT NULL,
  is_internal boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.caster_presence (
  cast_member_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  event_run_id uuid,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  user_agent text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.caster_scenes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  "overlay" text,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.caster_themes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.circuit_partner_applications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  organization_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  game text NOT NULL,
  format text NOT NULL,
  season_start date,
  expected_teams integer,
  website text,
  community_url text,
  existing_tenant_slug text,
  message text NOT NULL,
  commits_code_of_conduct boolean NOT NULL,
  commits_safety_lead boolean NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  admin_notes text,
  granted_tenant_id uuid,
  granted_plan text,
  granted_until timestamp with time zone,
  decided_by uuid,
  decided_at timestamp with time zone,
  ip_address text,
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.custom_game_presets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  game text DEFAULT 'overwatch'::text NOT NULL,
  tournament_id uuid,
  stage_id uuid,
  name text NOT NULL,
  import_code text NOT NULL,
  description text,
  map_pool jsonb DEFAULT '[]'::jsonb NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.demandes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  auth_user_id uuid,
  message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone,
  handled_at timestamp with time zone,
  handled_by_staff_id uuid,
  user_id uuid,
  comment text,
  staff_note text,
  processed_by_staff_id uuid,
  processed_at timestamp with time zone,
  source text,
  payload jsonb,
  team_id uuid,
  tournament_id uuid,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.discord_event_ack (
  event_id uuid NOT NULL,
  handled_at timestamp with time zone DEFAULT now() NOT NULL,
  source text
);

CREATE TABLE IF NOT EXISTS public.discord_guild_presence (
  tenant_id uuid NOT NULL,
  discord_user_id text NOT NULL,
  in_guild boolean NOT NULL,
  checked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.discord_guilds (
  guild_id text NOT NULL,
  tenant_id uuid NOT NULL,
  is_primary boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.discord_webhooks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid,
  channel_type text NOT NULL,
  webhook_url text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  role_mention text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_post_at timestamp with time zone,
  last_post_status text,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id text NOT NULL,
  name text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  subject text NOT NULL,
  audience text DEFAULT 'all-confirmed-users'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  heading text NOT NULL,
  greeting_enabled boolean DEFAULT true NOT NULL,
  body_paragraphs jsonb DEFAULT '[]'::jsonb NOT NULL,
  cta_label text,
  cta_url text,
  footer_note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  body_format text DEFAULT 'structured'::text NOT NULL,
  body_html text
);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id bigint DEFAULT nextval('email_deliveries_id_seq'::regclass) NOT NULL,
  tenant_id uuid NOT NULL,
  outbox_event_id text NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'sent'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.entity_blacklist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  entity_type text NOT NULL,
  name text NOT NULL,
  reason text,
  notes text,
  banned_by uuid,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_cue_acks (
  cue_id uuid NOT NULL,
  cast_member_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  acked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_cues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  event_run_id uuid NOT NULL,
  severity text NOT NULL,
  body text NOT NULL,
  created_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  dedup_key text,
  retracted_at timestamp with time zone,
  retracted_by_user_id uuid
);

CREATE TABLE IF NOT EXISTS public.event_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  scheduled_at timestamp with time zone NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  broadcast_state jsonb DEFAULT '{"v": 1, "pip": {"enabled": false}, "on_air": false, "lower_third": null}'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_segments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_run_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  ord integer NOT NULL,
  type text NOT NULL,
  match_id uuid,
  title text NOT NULL,
  duration_min integer,
  status text DEFAULT 'upcoming'::text NOT NULL,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  broadcast_message jsonb,
  caster_checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  planned_start_at timestamp with time zone,
  wave_id uuid,
  station_id uuid,
  obs_scene text
);

CREATE TABLE IF NOT EXISTS public.event_stations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  event_run_id uuid NOT NULL,
  ord integer DEFAULT 0 NOT NULL,
  name text NOT NULL,
  stream_url text,
  notes text,
  status text DEFAULT 'idle'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_waves (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  event_run_id uuid NOT NULL,
  ord integer NOT NULL,
  title text NOT NULL,
  planned_start_at timestamp with time zone,
  duration_min integer,
  status text DEFAULT 'upcoming'::text NOT NULL,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.final_rankings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  rank integer NOT NULL,
  prize text,
  notes text,
  frozen_at timestamp with time zone DEFAULT now() NOT NULL,
  frozen_by_staff_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.free_players (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  discord_user_id text,
  discord_username text,
  auth_user_id uuid,
  marked_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source text DEFAULT 'discord'::text NOT NULL,
  display_name text,
  roles text[] DEFAULT '{}'::text[] NOT NULL,
  availability text,
  level text,
  note text,
  contact_email text,
  contact_discord text,
  expires_at timestamp with time zone,
  share_across_tenants boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.game_heroes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  game text NOT NULL,
  external_id text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  title text,
  roles text[] DEFAULT '{}'::text[] NOT NULL,
  attribute text,
  image_url text NOT NULL,
  icon_url text,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  fetched_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.games (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  match_id uuid NOT NULL,
  map_name text,
  map_order integer,
  team1_score integer DEFAULT 0,
  team2_score integer DEFAULT 0,
  is_tiebreaker boolean DEFAULT false,
  went_overtime boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  winner_team_id uuid,
  duration_minutes integer,
  tenant_id uuid NOT NULL,
  picked_by_team_id uuid,
  hero_bans jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.helloasso_donations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  helloasso_payment_id text NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  form_type text,
  form_slug text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.integration_secrets (
  tenant_id uuid NOT NULL,
  key text NOT NULL,
  value_encrypted text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.league_scrims (
  league_id uuid NOT NULL,
  scrim_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  weight numeric DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.league_standings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  points numeric DEFAULT 0 NOT NULL,
  tournaments_counted integer DEFAULT 0 NOT NULL,
  best_rank integer,
  rank integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  scrims_counted integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.league_tournaments (
  league_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  weight numeric DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leagues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  game text,
  status text DEFAULT 'draft'::text NOT NULL,
  start_date date,
  end_date date,
  points_table jsonb DEFAULT '{"1": 100, "2": 80, "3": 60, "4": 50, "5": 40, "6": 30, "7": 20, "8": 10}'::jsonb NOT NULL,
  is_public boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lobbies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  stage_id uuid,
  name text,
  round_number integer,
  best_of integer,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lobby_placements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lobby_id uuid NOT NULL,
  team_id uuid NOT NULL,
  placement integer,
  points numeric,
  score numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_draft_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  draft_id uuid NOT NULL,
  step_number integer NOT NULL,
  phase text NOT NULL,
  action text NOT NULL,
  side text NOT NULL,
  hero_id uuid,
  committed_at timestamp with time zone,
  deadline_at timestamp with time zone,
  auto_picked boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_drafts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid NOT NULL,
  game_index integer NOT NULL,
  game text NOT NULL,
  team1_side text,
  team2_side text,
  current_step integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  fearless boolean DEFAULT false NOT NULL,
  pick_timer_seconds integer DEFAULT 30 NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  tenant_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  team_side smallint,
  submitted_by_auth_user_id uuid,
  discord_user_id text,
  kind text NOT NULL,
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes integer,
  sha256 text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_lineups (
  tenant_id uuid NOT NULL,
  match_id uuid NOT NULL,
  team_id uuid NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  validated_by uuid,
  validated_by_kind text,
  validated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_map_vetos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid NOT NULL,
  step_number integer NOT NULL,
  action text NOT NULL,
  team_id uuid,
  map_name text NOT NULL,
  map_type text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_mvp_polls (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid NOT NULL,
  posted_at timestamp with time zone,
  duration_hours integer DEFAULT 24 NOT NULL,
  candidate_player_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  winner_member_id uuid,
  winner_battle_tag text,
  winner_imported_at timestamp with time zone,
  winner_imported_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL,
  closes_at timestamp with time zone,
  closed_at timestamp with time zone,
  winner_source text,
  winner_votes integer,
  total_votes integer,
  discord_channel_id text,
  discord_message_id text
);

CREATE TABLE IF NOT EXISTS public.match_mvp_votes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  match_id uuid NOT NULL,
  member_id uuid NOT NULL,
  source text NOT NULL,
  voter_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  match_id uuid NOT NULL,
  tournament_id uuid,
  team_id uuid NOT NULL,
  user_id uuid,
  battle_tag text,
  role text,
  is_substitute boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_prediction_settings (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  show_in_leaderboard boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_predictions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  match_id uuid NOT NULL,
  user_id uuid NOT NULL,
  predicted_winner_team_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  result text,
  settled_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.match_public_mvp_polls (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  match_id uuid NOT NULL,
  opened_at timestamp with time zone,
  closes_at timestamp with time zone,
  closed_at timestamp with time zone,
  candidate_member_ids uuid[],
  winner_member_id uuid,
  winner_battle_tag text,
  winner_votes integer,
  total_votes integer,
  settled_at timestamp with time zone,
  discord_channel_id text,
  discord_message_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_public_mvp_votes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  match_id uuid NOT NULL,
  member_id uuid NOT NULL,
  source text NOT NULL,
  voter_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.match_score_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid NOT NULL,
  team_side smallint NOT NULL,
  reported_by_auth_user_id uuid NOT NULL,
  discord_user_id text,
  team1_score integer NOT NULL,
  team2_score integer NOT NULL,
  reported_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tournament_id uuid,
  stage_id uuid,
  team1_id uuid,
  team2_id uuid,
  team1_score integer DEFAULT 0,
  team2_score integer DEFAULT 0,
  winner_team_id uuid,
  match_format text DEFAULT 'bo3'::text,
  status text DEFAULT 'pending'::text NOT NULL,
  is_bye boolean DEFAULT false,
  round_name text,
  round_number integer,
  bracket_side text DEFAULT 'none'::text,
  bracket_slot integer,
  group_key text,
  scheduled_at timestamp with time zone,
  completed_at timestamp with time zone,
  stream_url text,
  lobby_code text,
  notes text,
  parent_match_win_id uuid,
  parent_match_lose_id uuid,
  next_match_win_id uuid,
  next_match_lose_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  next_match_win_slot integer,
  next_match_lose_slot integer,
  deleted_at timestamp with time zone,
  forfeit_team_id uuid,
  team1_checkin_token text,
  team1_checked_in_at timestamp with time zone,
  team2_checkin_token text,
  team2_checked_in_at timestamp with time zone,
  checkin_email_sent_at timestamp with time zone,
  reminder_30_sent_at timestamp with time zone,
  reminder_15_sent_at timestamp with time zone,
  forfeit_processed_at timestamp with time zone,
  dispute_reason text,
  dispute_opened_by uuid,
  dispute_opened_at timestamp with time zone,
  dispute_resolution text,
  dispute_resolved_by uuid,
  dispute_resolved_at timestamp with time zone,
  replay_url text,
  team1_captain_dm_30_sent_at timestamp with time zone,
  team2_captain_dm_30_sent_at timestamp with time zone,
  scrim_id uuid,
  discord_thread_id text,
  discord_scheduled_event_id text,
  discord_dispute_thread_id text,
  veto_locked_at timestamp with time zone,
  tenant_id uuid NOT NULL,
  escalation_pinged_at timestamp with time zone,
  no_show_reason text,
  discord_match_channel_id text,
  team1_lineup_reminder_sent_at timestamp with time zone,
  team2_lineup_reminder_sent_at timestamp with time zone,
  best_of integer,
  started_at timestamp with time zone,
  team1_lineup_dm_sent_at timestamp with time zone,
  team2_lineup_dm_sent_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.news (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  excerpt text,
  content text NOT NULL,
  image_url text,
  status text DEFAULT 'draft'::text NOT NULL,
  published_at timestamp with time zone,
  author_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tag text DEFAULT 'general'::text NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid
);

CREATE TABLE IF NOT EXISTS public.news_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  news_id uuid NOT NULL,
  author_name text,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  confirm_token text,
  confirmed_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  source text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  channel text DEFAULT 'push'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.overlay_heartbeats (
  tenant_id uuid NOT NULL,
  source text NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  logo_url text,
  website_url text,
  note text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.partnership_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  website text,
  category text NOT NULL,
  message text NOT NULL,
  budget_range text,
  status text DEFAULT 'new'::text,
  admin_notes text,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone,
  contacted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.patch_notes (
  id text NOT NULL,
  title text NOT NULL,
  date text NOT NULL,
  date_parsed date,
  link text NOT NULL,
  summary text,
  heroes jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pending_guild_links (
  guild_id text NOT NULL,
  guild_name text,
  owner_discord_id text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_cgv_acceptances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  cgv_version text NOT NULL,
  plan text NOT NULL,
  term text NOT NULL,
  amount_cents integer NOT NULL,
  cgv_accepted boolean DEFAULT false NOT NULL,
  immediate_execution_waiver boolean DEFAULT false NOT NULL,
  accepted_at timestamp with time zone DEFAULT now() NOT NULL,
  checkout_intent_id bigint
);

CREATE TABLE IF NOT EXISTS public.player_action_snoozes (
  discord_user_id text NOT NULL,
  action_key text NOT NULL,
  snoozed_until timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_blacklist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  battle_tag text,
  display_name text,
  discord_user_id text,
  reason text,
  notes text,
  banned_by uuid,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_calendar_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  token text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.player_discovery_profiles (
  auth_user_id uuid NOT NULL,
  discoverable boolean DEFAULT false NOT NULL,
  display_name text,
  avatar_url text,
  tagline text,
  show_ratings boolean DEFAULT true NOT NULL,
  show_teams boolean DEFAULT true NOT NULL,
  opted_in_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_follows (
  follower_id uuid NOT NULL,
  followee_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_hero_preferences (
  auth_user_id uuid NOT NULL,
  picks text[] DEFAULT '{}'::text[] NOT NULL,
  bans text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_rating_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  match_id uuid NOT NULL,
  tournament_id uuid,
  rating_before double precision NOT NULL,
  rating_after double precision NOT NULL,
  rd_before double precision NOT NULL,
  rd_after double precision NOT NULL,
  volatility_before double precision NOT NULL,
  volatility_after double precision NOT NULL,
  opponent_avg_rating double precision,
  result text NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_ratings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating double precision DEFAULT 1500 NOT NULL,
  rd double precision DEFAULT 350 NOT NULL,
  volatility double precision DEFAULT 0.06 NOT NULL,
  games_played integer DEFAULT 0 NOT NULL,
  wins integer DEFAULT 0 NOT NULL,
  losses integer DEFAULT 0 NOT NULL,
  draws integer DEFAULT 0 NOT NULL,
  peak_rating double precision DEFAULT 1500 NOT NULL,
  last_match_at timestamp with time zone,
  display_name text,
  battle_tag text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prize_pool_checkouts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  checkout_intent_id text NOT NULL,
  prize_pool_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  contributor_name text,
  contributor_email text,
  message text,
  is_anonymous boolean DEFAULT false NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prize_pool_contributions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  prize_pool_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  helloasso_payment_id text NOT NULL,
  checkout_intent_id text,
  amount_cents integer NOT NULL,
  contributor_name text,
  is_anonymous boolean DEFAULT false NOT NULL,
  message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  hits integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scrim_planning_availabilities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  planning_id uuid NOT NULL,
  party text NOT NULL,
  user_id uuid NOT NULL,
  display_name text,
  slots jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scrim_plannings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  created_by uuid,
  team1_id uuid NOT NULL,
  team2_id uuid NOT NULL,
  source_demande_id uuid,
  scrim_id uuid,
  title text,
  game text,
  status text DEFAULT 'open'::text NOT NULL,
  horizon_start date NOT NULL,
  horizon_days integer DEFAULT 21 NOT NULL,
  slot_minutes integer DEFAULT 30 NOT NULL,
  day_start_min integer DEFAULT 960 NOT NULL,
  day_end_min integer DEFAULT 1440 NOT NULL,
  timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
  validated_slot timestamp with time zone,
  is_public boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  reminder_pinged_at timestamp with time zone,
  staff_required boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scrim_score_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  scrim_id uuid NOT NULL,
  team_side smallint NOT NULL,
  reported_by_auth_user_id uuid NOT NULL,
  team1_score integer NOT NULL,
  team2_score integer NOT NULL,
  reported_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scrim_searches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  created_by uuid,
  slots jsonb DEFAULT '[]'::jsonb NOT NULL,
  format text,
  note text,
  status text DEFAULT 'active'::text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scrims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text,
  game text,
  status text DEFAULT 'draft'::text NOT NULL,
  team1_id uuid,
  team2_id uuid,
  scheduled_date timestamp with time zone,
  timezone text DEFAULT 'Europe/Paris'::text,
  is_public boolean DEFAULT false NOT NULL,
  logo_url text,
  banner_url text,
  description text,
  stream_url text,
  source_demande_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  settings jsonb,
  tenant_id uuid NOT NULL,
  discord_thread_id text,
  source_planning_id uuid,
  duration_minutes integer DEFAULT 120,
  winner_team_id uuid,
  team1_score integer,
  team2_score integer,
  completed_at timestamp with time zone,
  ranked boolean DEFAULT true NOT NULL,
  dispute_reason text
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  key text NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  tenant_id uuid DEFAULT 'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  platform text NOT NULL,
  external_account_id text,
  handle text,
  access_token_encrypted text,
  token_expires_at timestamp with time zone,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'connected'::text NOT NULL,
  last_error text,
  connected_at timestamp with time zone,
  connected_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  refresh_token_encrypted text,
  refresh_token_expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.social_feed_items (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  source text NOT NULL,
  external_id text NOT NULL,
  url text NOT NULL,
  text text DEFAULT ''::text NOT NULL,
  thumbnail_url text,
  published_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.social_post_targets (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  post_id uuid NOT NULL,
  platform text NOT NULL,
  text_override text,
  image_override text,
  title_override text,
  status text DEFAULT 'pending'::text NOT NULL,
  external_id text,
  permalink text,
  error text,
  attempts smallint DEFAULT 0 NOT NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  hashtags text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  base_text text NOT NULL,
  base_image_url text,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.staff (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  auth_user_id uuid,
  email text NOT NULL,
  display_name text,
  role text DEFAULT 'helper'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  avatar_url text,
  is_active boolean DEFAULT true NOT NULL,
  deleted_at timestamp with time zone,
  is_pole_admin boolean DEFAULT false NOT NULL,
  extra_permissions text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS public.staff_logs (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  staff_id uuid,
  staff_role text,
  staff_name text,
  action text,
  description text,
  entity_type text,
  entity_id uuid,
  changes jsonb,
  payload jsonb,
  tournament_id uuid,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stage_teams (
  stage_id uuid NOT NULL,
  team_id uuid NOT NULL,
  seed integer,
  is_substitute boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stage_tiebreaker_overrides (
  id bigint DEFAULT nextval('stage_tiebreaker_overrides_id_seq'::regclass) NOT NULL,
  stage_id uuid NOT NULL,
  winner_team_id uuid NOT NULL,
  loser_team_id uuid NOT NULL,
  reason text,
  set_by_staff_id uuid,
  set_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stream_alert_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  twitch_message_id text NOT NULL,
  kind text NOT NULL,
  actor_name text,
  amount integer,
  tier text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stream_alert_rules (
  tenant_id uuid NOT NULL,
  kind text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  message text,
  min_amount integer,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stream_alert_settings (
  tenant_id uuid NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  duration_ms integer,
  sound_url text,
  sound_volume integer DEFAULT 70 NOT NULL,
  accent_color text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  frame_path text,
  frame_kind text,
  sound_path text
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid,
  reporter_user_id uuid,
  reporter_name text,
  reporter_email text,
  is_anonymous boolean DEFAULT false NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  subject text,
  message text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  resolution_note text,
  discord_message_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  discord_user_id text,
  discord_username text,
  source text DEFAULT 'web'::text NOT NULL,
  reported_target_type text,
  reported_target_name text,
  reported_battle_tag text,
  converted_player_blacklist_id uuid,
  converted_entity_blacklist_id uuid,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_boards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  "position" integer DEFAULT 0 NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL,
  label text NOT NULL,
  is_done boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_columns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  board_id uuid NOT NULL,
  name text NOT NULL,
  "position" integer NOT NULL,
  wip_limit integer,
  is_done boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL,
  author_staff_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_labels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  board_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  board_id uuid NOT NULL,
  column_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium'::text NOT NULL,
  assignee_staff_id uuid,
  due_date date,
  "position" integer DEFAULT 0 NOT NULL,
  labels text[] DEFAULT '{}'::text[] NOT NULL,
  created_by uuid,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tcg_fanart_cards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  submitted_by uuid,
  title text NOT NULL,
  artist_name text NOT NULL,
  artist_url text,
  image_path text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  rarity text,
  licence_accepted_at timestamp with time zone NOT NULL,
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category text DEFAULT 'fanart'::text NOT NULL,
  source_ref text
);

CREATE TABLE IF NOT EXISTS public.tcg_overlay_themes (
  tenant_id uuid NOT NULL,
  accent_color text,
  media_path text,
  media_kind text,
  drop_line text,
  win_line text,
  "position" text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.tcg_overlay_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  token text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tcg_pack_cards (
  pack_id uuid NOT NULL,
  "position" smallint NOT NULL,
  subject_kind text NOT NULL,
  card_user_id uuid,
  card_team_id uuid,
  rarity text NOT NULL,
  is_foil boolean DEFAULT false NOT NULL,
  recycled_at timestamp with time zone,
  card_map_slug text,
  card_fanart_id uuid,
  card_mascot_slug text
);

CREATE TABLE IF NOT EXISTS public.tcg_packs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source_match_id uuid,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  opened_at timestamp with time zone,
  source_kind text DEFAULT 'victory'::text NOT NULL,
  guaranteed_fanart_id uuid
);

CREATE TABLE IF NOT EXISTS public.tcg_photo_purges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_attempt_at timestamp with time zone,
  last_error text
);

CREATE TABLE IF NOT EXISTS public.tcg_player_cards (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  opted_in_at timestamp with time zone,
  revoked_at timestamp with time zone,
  photo_path text,
  photo_status text DEFAULT 'none'::text NOT NULL,
  photo_reviewed_by uuid,
  photo_reviewed_at timestamp with time zone,
  photo_rejected_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  excluded_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tcg_showcases (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  subject_keys text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  frame text,
  background text,
  unlocked_cosmetics text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tcg_trade_blocks (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  blocked_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tcg_trade_items (
  trade_id uuid NOT NULL,
  side text NOT NULL,
  ordinal smallint NOT NULL,
  subject_kind text NOT NULL,
  card_user_id uuid,
  card_team_id uuid,
  card_map_slug text,
  rarity text,
  is_foil boolean,
  from_pack_id uuid,
  from_position smallint,
  to_pack_id uuid,
  to_position smallint,
  card_fanart_id uuid,
  card_mascot_slug text
);

CREATE TABLE IF NOT EXISTS public.tcg_trade_settings (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  accepts_proposals boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tcg_trades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  proposer_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  resolution_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  resolved_at timestamp with time zone,
  proposer_pack_id uuid,
  recipient_pack_id uuid
);

CREATE TABLE IF NOT EXISTS public.tcg_wallet_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  source_kind text NOT NULL,
  source_ref text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  note text
);

CREATE TABLE IF NOT EXISTS public.tcg_wallets (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  balance integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_availability (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
  slots jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_availability_constraints (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  tournament_id uuid,
  kind text NOT NULL,
  starts_on date,
  ends_on date,
  time_of_day time without time zone,
  weekdays smallint[],
  timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.team_discord_channels (
  team_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  role_id text,
  role_name text,
  role_exists boolean DEFAULT false NOT NULL,
  text_channel_id text,
  text_channel_name text,
  text_channel_exists boolean DEFAULT false NOT NULL,
  voice_channel_id text,
  voice_channel_name text,
  voice_channel_exists boolean DEFAULT false NOT NULL,
  access jsonb DEFAULT '[]'::jsonb NOT NULL,
  warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
  captured_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_invite_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  token_hash text NOT NULL,
  role text DEFAULT 'player'::text NOT NULL,
  created_by uuid,
  expires_at timestamp with time zone NOT NULL,
  max_uses integer,
  uses_count integer DEFAULT 0 NOT NULL,
  revoked_at timestamp with time zone,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_member_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by uuid
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'player'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  battle_tag text DEFAULT 'Unknown#0000'::text,
  is_substitute boolean DEFAULT false NOT NULL,
  display_name text,
  specialty text,
  avatar_url text,
  pronouns text,
  tagline text,
  twitter text,
  twitch text,
  tenant_id uuid NOT NULL,
  battle_tag_verified_at timestamp with time zone,
  verified_battle_net_id text,
  skill_rating integer,
  accepted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.team_openings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  source text DEFAULT 'web'::text NOT NULL,
  team_id uuid,
  team_name text,
  roles text[] DEFAULT '{}'::text[] NOT NULL,
  level text,
  availability text,
  note text,
  contact_email text,
  contact_discord text,
  marked_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.team_ratings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  rating double precision DEFAULT 1500 NOT NULL,
  rd double precision,
  games_played integer DEFAULT 0 NOT NULL,
  wins integer DEFAULT 0 NOT NULL,
  losses integer DEFAULT 0 NOT NULL,
  roster_size integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  opponent_team_id uuid,
  played_at timestamp with time zone,
  vod_url text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  objectives text
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  short_name text,
  logo_url text,
  country text,
  description text,
  captain_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  banner_url text,
  discord text,
  twitter text,
  website text,
  deleted_at timestamp with time zone,
  is_joinable boolean DEFAULT true NOT NULL,
  discord_role_id text,
  public_content text,
  accent_color text,
  slug text,
  secondary_color text,
  banner_overlay text,
  banner_focal text,
  youtube text,
  twitch text,
  instagram text,
  tiktok text,
  achievements jsonb DEFAULT '[]'::jsonb NOT NULL,
  sponsors jsonb DEFAULT '[]'::jsonb NOT NULL,
  embed_provider text,
  embed_id text,
  pinned_announcement text,
  pinned_announcement_until timestamp with time zone,
  discord_voice_channel_id text,
  tenant_id uuid NOT NULL,
  open_for_scrim boolean DEFAULT false NOT NULL,
  discord_channel_id text,
  skill_rating integer,
  tcg_image_path text,
  logo_credit_name text,
  logo_credit_url text,
  preferred_locale text
);

CREATE TABLE IF NOT EXISTS public.tenant_api_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  token_hash text NOT NULL,
  token_prefix text NOT NULL,
  name text NOT NULL,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone,
  comp boolean DEFAULT false NOT NULL,
  comp_note text,
  expires_at timestamp with time zone,
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.tenant_discord_config (
  guild_id text NOT NULL,
  staff_log_channel_id text,
  matches_live_channel_id text,
  disputes_forum_channel_id text,
  news_ingest_channel_id text,
  scrims_announce_channel_id text,
  captain_role_id text,
  substitute_role_id text,
  teams_voice_category_id text,
  disputes_forum_tag_open_id text,
  disputes_forum_tag_pending_id text,
  disputes_forum_tag_resolved_id text,
  extras jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  staff_role_admin_id text,
  staff_role_caster_id text,
  staff_role_owner_id text,
  welcome_enabled boolean DEFAULT false NOT NULL,
  welcome_channel_id text,
  welcome_message text,
  welcome_dm_message text,
  member_leave_channel_id text,
  placement_roles jsonb,
  free_players_channel_id text,
  team_openings_channel_id text,
  mvp_results_channel_id text
);

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  invited_by uuid,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  accepted_staff_id uuid,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tenant_map_pool (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  game text NOT NULL,
  map_name text NOT NULL,
  map_type text,
  image_url text,
  enabled boolean DEFAULT true NOT NULL,
  order_index integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tenant_plan_checkouts (
  id bigint DEFAULT nextval('tenant_plan_checkouts_id_seq'::regclass) NOT NULL,
  checkout_intent_id bigint NOT NULL,
  tenant_id uuid NOT NULL,
  plan text NOT NULL,
  amount_expected integer NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  term text DEFAULT 'year'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tenant_plan_payments (
  id bigint DEFAULT nextval('tenant_plan_payments_id_seq'::regclass) NOT NULL,
  helloasso_payment_id bigint NOT NULL,
  tenant_id uuid NOT NULL,
  plan text NOT NULL,
  amount integer NOT NULL,
  checkout_intent_id bigint,
  applied_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tenant_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requester_discord_user_id text NOT NULL,
  requester_discord_display_name text,
  requester_email text NOT NULL,
  requester_auth_user_id uuid,
  requested_slug text NOT NULL,
  requested_name text NOT NULL,
  description text,
  status text DEFAULT 'pending_email_verification'::text NOT NULL,
  rejection_reason text,
  email_verification_token text,
  email_verified_at timestamp with time zone,
  secrets_reveal_token text,
  secrets_reveal_token_expires_at timestamp with time zone,
  secrets_revealed_at timestamp with time zone,
  created_tenant_id uuid,
  created_guild_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  ip_address inet,
  user_agent text,
  pending_secrets_reveal jsonb,
  source text DEFAULT 'web'::text NOT NULL,
  cgv_version text,
  cgv_accepted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tenant_secrets (
  tenant_id uuid NOT NULL,
  bot_api_key_hash text NOT NULL,
  bot_webhook_secret text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  rotated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_platform_key boolean DEFAULT false NOT NULL,
  previous_key_hash text,
  previous_key_expires_at timestamp with time zone,
  last_used_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tenant_staff (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  role text DEFAULT 'admin'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  default_locale text DEFAULT 'fr'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  dispute_sla_minutes integer DEFAULT 60 NOT NULL,
  logo_url text,
  primary_color text,
  accent_color text,
  custom_domain text,
  plan text DEFAULT 'discovery'::text NOT NULL,
  plan_status text DEFAULT 'active'::text NOT NULL,
  plan_started_at timestamp with time zone,
  plan_expires_at timestamp with time zone,
  plan_last_reminder_at timestamp with time zone,
  kind text DEFAULT 'organizer'::text NOT NULL,
  plan_is_trial boolean DEFAULT false NOT NULL,
  custom_domain_state text,
  custom_domain_token text,
  custom_domain_checked_at timestamp with time zone,
  custom_domain_error text,
  lifecycle_state text DEFAULT 'active'::text NOT NULL,
  lifecycle_reason text,
  lifecycle_changed_at timestamp with time zone,
  lifecycle_changed_by uuid,
  purge_after timestamp with time zone,
  plan_term text DEFAULT 'year'::text NOT NULL,
  cgv_version text,
  cgv_accepted_at timestamp with time zone,
  cgv_accepted_by uuid,
  nonprofit_verified_at timestamp with time zone,
  nonprofit_org_name text,
  network_share_scrims boolean DEFAULT false NOT NULL,
  network_share_recruitment boolean DEFAULT false NOT NULL,
  nonprofit_rna text,
  nonprofit_rna_declared_at timestamp with time zone,
  nonprofit_verified_via text
);

CREATE TABLE IF NOT EXISTS public.tournament_maps (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tournament_id uuid NOT NULL,
  map_name text NOT NULL,
  map_slug text,
  map_type text,
  enabled boolean DEFAULT true NOT NULL,
  order_index integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  image_url text,
  tenant_id uuid NOT NULL,
  round_number integer,
  play_date date
);

CREATE TABLE IF NOT EXISTS public.tournament_pool_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  battle_tag text NOT NULL,
  origin_team_id uuid,
  status text DEFAULT 'waitlist'::text NOT NULL,
  placed_team_id uuid,
  placed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tournament_prize_pools (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  title text,
  currency text DEFAULT 'EUR'::text NOT NULL,
  goal_amount_cents integer,
  base_amount_cents integer DEFAULT 0 NOT NULL,
  raised_amount_cents integer DEFAULT 0 NOT NULL,
  is_open boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tournament_stages (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tournament_id uuid NOT NULL,
  name text NOT NULL,
  stage_type text NOT NULL,
  default_match_format text DEFAULT 'bo3'::text,
  swiss_rounds integer,
  bracket_format text,
  visible boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  end_date timestamp with time zone,
  is_active boolean DEFAULT false,
  is_public boolean DEFAULT false,
  order_index integer DEFAULT 0,
  settings jsonb,
  slug text,
  start_date timestamp with time zone,
  deleted_at timestamp with time zone,
  tiebreaker_policy text DEFAULT 'manual'::text,
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid NOT NULL,
  team_id uuid NOT NULL,
  seed integer,
  status text DEFAULT 'registered'::text,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid NOT NULL,
  field_values jsonb DEFAULT '{}'::jsonb NOT NULL,
  roster_unlocked_until timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  short_name text,
  slug text,
  game text,
  status text DEFAULT 'draft'::text NOT NULL,
  format text,
  max_teams integer,
  start_date date,
  end_date date,
  rules_url text,
  visibility text DEFAULT 'public'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  banner_url text,
  format_type text,
  min_players integer,
  is_featured boolean DEFAULT false NOT NULL,
  logo_url text,
  timezone text,
  max_players integer,
  description_info text,
  schedule_details text,
  schedule_rules text,
  format_details text,
  roster_locked_at timestamp with time zone,
  j1_reminder_sent_at timestamp with time zone,
  tenant_id uuid NOT NULL,
  checkin_grace_minutes integer DEFAULT 60 NOT NULL,
  registration_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  roster_unlocked_until timestamp with time zone,
  default_stream_url text,
  overlay_day_date date,
  overlay_day_set_at timestamp with time zone,
  solo_mode boolean DEFAULT false NOT NULL,
  pooled_teams boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.twitch_broadcaster_connections (
  tenant_id uuid NOT NULL,
  broadcaster_id text NOT NULL,
  broadcaster_login text NOT NULL,
  access_token_enc text NOT NULL,
  refresh_token_enc text NOT NULL,
  scope text[] DEFAULT '{}'::text[] NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  connected_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tcg_reward_id text,
  tcg_featured_reward_id text,
  tcg_featured_fanart_id uuid
);

CREATE TABLE IF NOT EXISTS public.twitch_channels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel text NOT NULL,
  label text NOT NULL,
  badge text,
  description text,
  background_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tenant_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_battlenet_links (
  auth_user_id uuid NOT NULL,
  battle_net_id text NOT NULL,
  battle_tag text NOT NULL,
  region text,
  verified_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_discord_links (
  auth_user_id uuid NOT NULL,
  discord_user_id text NOT NULL,
  discord_username text,
  linked_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_twitch_links (
  auth_user_id uuid NOT NULL,
  twitch_user_id text NOT NULL,
  twitch_login text,
  linked_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.web_push_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  outbox_event_id text NOT NULL,
  subscription_id uuid NOT NULL,
  status text NOT NULL,
  delivered_at timestamp with time zone,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  acked_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  outbox_event_id text NOT NULL,
  event_name text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  response_status integer,
  last_error text,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  event_types text[] DEFAULT '{}'::text[] NOT NULL,
  description text,
  enabled boolean DEFAULT true NOT NULL,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  disabled_at timestamp with time zone,
  last_delivery_at timestamp with time zone,
  last_error text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE public.admin_idempotency_id_seq OWNED BY public.admin_idempotency.id;
ALTER SEQUENCE public.bot_event_outbox_id_seq OWNED BY public.bot_event_outbox.id;
ALTER SEQUENCE public.bot_idempotency_id_seq OWNED BY public.bot_idempotency.id;
ALTER SEQUENCE public.bot_player_actions_id_seq OWNED BY public.bot_player_actions.id;
ALTER SEQUENCE public.bracket_snapshots_id_seq OWNED BY public.bracket_snapshots.id;
ALTER SEQUENCE public.email_deliveries_id_seq OWNED BY public.email_deliveries.id;
ALTER SEQUENCE public.stage_tiebreaker_overrides_id_seq OWNED BY public.stage_tiebreaker_overrides.id;
ALTER SEQUENCE public.tenant_plan_checkouts_id_seq OWNED BY public.tenant_plan_checkouts.id;
ALTER SEQUENCE public.tenant_plan_payments_id_seq OWNED BY public.tenant_plan_payments.id;

-- ---------------------------------------------------------------- CONTRAINTES (PK, UNIQUE, CHECK)
ALTER TABLE ONLY public.adherent_payments ADD CONSTRAINT adherent_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.adherent_payments ADD CONSTRAINT adherent_payments_adherent_id_year_key UNIQUE (adherent_id, year);
ALTER TABLE ONLY public.adherent_payments ADD CONSTRAINT adherent_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'check'::text, 'transfer'::text, 'card'::text, 'helloasso'::text, 'other'::text])));
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_auth_user_id_key UNIQUE (auth_user_id);
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_email_key UNIQUE (email);
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_member_number_key UNIQUE (member_number);
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'check'::text, 'transfer'::text, 'card'::text, 'helloasso'::text, 'other'::text])));
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'exempt'::text, 'overdue'::text])));
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_role_check CHECK ((role = ANY (ARRAY['member'::text, 'volunteer'::text, 'board'::text, 'president'::text, 'treasurer'::text, 'secretary'::text])));
ALTER TABLE ONLY public.admin_idempotency ADD CONSTRAINT admin_idempotency_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.admin_idempotency ADD CONSTRAINT admin_idempotency_tenant_id_cache_key_key UNIQUE (tenant_id, cache_key);
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_usage_counters ADD CONSTRAINT api_usage_counters_pkey PRIMARY KEY (tenant_id, window_kind, window_key);
ALTER TABLE ONLY public.api_usage_counters ADD CONSTRAINT api_usage_counters_window_kind_chk CHECK ((window_kind = ANY (ARRAY['minute'::text, 'month'::text])));
ALTER TABLE ONLY public.association_pole_members ADD CONSTRAINT association_pole_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.association_pole_members ADD CONSTRAINT association_pole_members_pole_key_check CHECK ((pole_key = ANY (ARRAY['direction'::text, 'tournoi'::text, 'production'::text, 'communaute'::text])));
ALTER TABLE ONLY public.blacklist_alerts ADD CONSTRAINT blacklist_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.blacklist_alerts ADD CONSTRAINT blacklist_alerts_matched_on_check CHECK ((matched_on = ANY (ARRAY['battle_tag'::text, 'display_name'::text, 'discord_user_id'::text])));
ALTER TABLE ONLY public.blacklist_alerts ADD CONSTRAINT blacklist_alerts_source_check CHECK ((source = ANY (ARRAY['bot_scan'::text, 'bot_member_add'::text, 'registration'::text])));
ALTER TABLE ONLY public.blacklist_alerts ADD CONSTRAINT blacklist_alerts_strength_check CHECK ((strength = ANY (ARRAY['strong'::text, 'soft'::text])));
ALTER TABLE ONLY public.blizzard_media ADD CONSTRAINT blizzard_media_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.blizzard_news ADD CONSTRAINT blizzard_news_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bot_event_outbox ADD CONSTRAINT bot_event_outbox_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bot_event_outbox ADD CONSTRAINT bot_event_outbox_event_id_key UNIQUE (event_id);
ALTER TABLE ONLY public.bot_event_outbox ADD CONSTRAINT bot_event_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text])));
ALTER TABLE ONLY public.bot_idempotency ADD CONSTRAINT bot_idempotency_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bot_idempotency ADD CONSTRAINT bot_idempotency_tenant_id_cache_key_key UNIQUE (tenant_id, cache_key);
ALTER TABLE ONLY public.bot_locks ADD CONSTRAINT bot_locks_pkey PRIMARY KEY (tenant_id, name);
ALTER TABLE ONLY public.bot_player_actions ADD CONSTRAINT bot_player_actions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bracket_snapshots ADD CONSTRAINT bracket_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.broadcast_email_optouts ADD CONSTRAINT broadcast_email_optouts_pkey PRIMARY KEY (email);
ALTER TABLE ONLY public.broadcast_recipients ADD CONSTRAINT broadcast_recipients_pkey PRIMARY KEY (campaign_id, user_id);
ALTER TABLE ONLY public.broadcast_recipients ADD CONSTRAINT broadcast_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE ONLY public.broadcast_schedules ADD CONSTRAINT broadcast_schedules_pkey PRIMARY KEY (campaign_id);
ALTER TABLE ONLY public.broadcast_schedules ADD CONSTRAINT broadcast_schedules_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'paused'::text, 'completed'::text])));
ALTER TABLE ONLY public.broadcast_schedules ADD CONSTRAINT broadcast_schedules_wave_size_check CHECK (((wave_size > 0) AND (wave_size <= 290)));
ALTER TABLE ONLY public.captcha_challenges ADD CONSTRAINT captcha_challenges_pkey PRIMARY KEY (nonce);
ALTER TABLE ONLY public.captcha_challenges ADD CONSTRAINT captcha_challenges_answer_hash_check CHECK (((char_length(answer_hash) >= 32) AND (char_length(answer_hash) <= 128)));
ALTER TABLE ONLY public.captcha_challenges ADD CONSTRAINT captcha_challenges_attempts_check CHECK ((attempts >= 0));
ALTER TABLE ONLY public.captcha_challenges ADD CONSTRAINT captcha_challenges_nonce_check CHECK (((char_length(nonce) >= 16) AND (char_length(nonce) <= 64)));
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT cast_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT cast_assignments_match_id_cast_member_id_key UNIQUE (match_id, cast_member_id);
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT chk_cast_assignments_entity_xor CHECK ((((match_id IS NOT NULL) AND (scrim_id IS NULL)) OR ((match_id IS NULL) AND (scrim_id IS NOT NULL))));
ALTER TABLE ONLY public.cast_members ADD CONSTRAINT cast_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.caster_presence ADD CONSTRAINT caster_presence_pkey PRIMARY KEY (cast_member_id);
ALTER TABLE ONLY public.caster_scenes ADD CONSTRAINT caster_scenes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.caster_scenes ADD CONSTRAINT caster_scenes_type_check CHECK ((type = ANY (ARRAY['starting'::text, 'match'::text, 'pause'::text, 'results'::text, 'end'::text, 'mvp'::text, 'scrim'::text, 'webcam'::text, 'bracket'::text, 'player'::text, 'leaderboard'::text, 'standings'::text, 'camera'::text, 'schedule'::text])));
ALTER TABLE ONLY public.caster_themes ADD CONSTRAINT caster_themes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_admin_notes_check CHECK (((admin_notes IS NULL) OR (char_length(admin_notes) <= 3000)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_community_url_check CHECK (((community_url IS NULL) OR (char_length(community_url) <= 500)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_contact_name_check CHECK (((char_length(contact_name) >= 1) AND (char_length(contact_name) <= 200)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_email_check CHECK (((char_length(email) >= 3) AND (char_length(email) <= 320)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_existing_tenant_slug_check CHECK (((existing_tenant_slug IS NULL) OR (char_length(existing_tenant_slug) <= 100)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_expected_teams_check CHECK (((expected_teams IS NULL) OR ((expected_teams >= 2) AND (expected_teams <= 512))));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_format_check CHECK ((format = ANY (ARRAY['feminin'::text, 'mixte'::text])));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_game_check CHECK (((char_length(game) >= 1) AND (char_length(game) <= 50)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_message_check CHECK (((char_length(message) >= 1) AND (char_length(message) <= 3000)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_organization_name_check CHECK (((char_length(organization_name) >= 1) AND (char_length(organization_name) <= 200)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_website_check CHECK (((website IS NULL) OR (char_length(website) <= 500)));
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_approved_has_grant CHECK (((status <> 'approved'::text) OR ((granted_plan IS NOT NULL) AND (granted_until IS NOT NULL) AND (decided_at IS NOT NULL))));
ALTER TABLE ONLY public.custom_game_presets ADD CONSTRAINT custom_game_presets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.custom_game_presets ADD CONSTRAINT custom_game_presets_import_code_not_blank CHECK ((length(btrim(import_code)) > 0));
ALTER TABLE ONLY public.custom_game_presets ADD CONSTRAINT custom_game_presets_name_not_blank CHECK ((length(btrim(name)) > 0));
ALTER TABLE ONLY public.custom_game_presets ADD CONSTRAINT custom_game_presets_stage_needs_tournament CHECK (((stage_id IS NULL) OR (tournament_id IS NOT NULL)));
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_type_check CHECK ((type = ANY (ARRAY['join'::text, 'leave'::text, 'captain_request'::text, 'team_registration'::text, 'transfer'::text, 'invite'::text, 'caster_application'::text, 'scrim'::text, 'other'::text])));
ALTER TABLE ONLY public.discord_event_ack ADD CONSTRAINT discord_event_ack_pkey PRIMARY KEY (event_id);
ALTER TABLE ONLY public.discord_guild_presence ADD CONSTRAINT discord_guild_presence_pkey PRIMARY KEY (tenant_id, discord_user_id);
ALTER TABLE ONLY public.discord_guilds ADD CONSTRAINT discord_guilds_pkey PRIMARY KEY (guild_id);
ALTER TABLE ONLY public.discord_webhooks ADD CONSTRAINT discord_webhooks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.discord_webhooks ADD CONSTRAINT discord_webhooks_channel_type_check CHECK ((channel_type = ANY (ARRAY['match_announcements'::text, 'match_results'::text, 'bracket_updates'::text, 'general_announcements'::text, 'veto_live'::text, 'checkin_reminders'::text, 'support_tickets'::text, 'mvp_polls'::text])));
ALTER TABLE ONLY public.discord_webhooks ADD CONSTRAINT discord_webhooks_last_post_status_check CHECK (((last_post_status = ANY (ARRAY['ok'::text, 'failed'::text])) OR (last_post_status IS NULL)));
ALTER TABLE ONLY public.email_campaigns ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_campaigns ADD CONSTRAINT email_campaigns_audience_allowed CHECK ((audience = ANY (ARRAY['all-confirmed-users'::text, 'team-captains'::text, 'team-captains-managers'::text, 'team-staff'::text, 'team-members'::text, 'staff'::text, 'adherents'::text, 'tournament-members'::text, 'tournament-never-logged-in'::text, 'tournament-captains-incomplete-roster'::text, 'team-members-without-discord'::text, 'team-members-without-battletag'::text, 'newsletter'::text, 'all-plus-newsletter'::text, 'adherents-plus-newsletter'::text])));
ALTER TABLE ONLY public.email_campaigns ADD CONSTRAINT email_campaigns_body_format_check CHECK ((body_format = ANY (ARRAY['structured'::text, 'html'::text])));
ALTER TABLE ONLY public.email_campaigns ADD CONSTRAINT email_campaigns_body_html_present CHECK (((body_format <> 'html'::text) OR ((body_html IS NOT NULL) AND (length(btrim(body_html)) > 0))));
ALTER TABLE ONLY public.email_campaigns ADD CONSTRAINT email_campaigns_status_check CHECK ((status = ANY (ARRAY['active'::text, 'draft'::text, 'archived'::text])));
ALTER TABLE ONLY public.email_deliveries ADD CONSTRAINT email_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_deliveries ADD CONSTRAINT email_deliveries_event_user_unique UNIQUE (outbox_event_id, user_id);
ALTER TABLE ONLY public.email_deliveries ADD CONSTRAINT email_deliveries_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])));
ALTER TABLE ONLY public.entity_blacklist ADD CONSTRAINT entity_blacklist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.entity_blacklist ADD CONSTRAINT entity_blacklist_entity_type_check CHECK ((entity_type = ANY (ARRAY['team'::text, 'org'::text])));
ALTER TABLE ONLY public.event_cue_acks ADD CONSTRAINT event_cue_acks_pkey PRIMARY KEY (cue_id, cast_member_id);
ALTER TABLE ONLY public.event_cues ADD CONSTRAINT event_cues_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_cues ADD CONSTRAINT event_cues_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)));
ALTER TABLE ONLY public.event_cues ADD CONSTRAINT event_cues_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warn'::text, 'urgent'::text])));
ALTER TABLE ONLY public.event_runs ADD CONSTRAINT event_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_runs ADD CONSTRAINT event_runs_tenant_slug_unique UNIQUE (tenant_id, slug);
ALTER TABLE ONLY public.event_runs ADD CONSTRAINT event_runs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'done'::text])));
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_run_ord_unique UNIQUE (event_run_id, ord) DEFERRABLE;
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_duration_positive_chk CHECK (((duration_min IS NULL) OR (duration_min > 0)));
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_match_requires_id_chk CHECK ((((type = 'match'::text) AND (match_id IS NOT NULL)) OR (type <> 'match'::text)));
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'live'::text, 'done'::text, 'skipped'::text])));
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_type_check CHECK ((type = ANY (ARRAY['match'::text, 'break'::text, 'intro'::text, 'outro'::text, 'custom'::text])));
ALTER TABLE ONLY public.event_stations ADD CONSTRAINT event_stations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_stations ADD CONSTRAINT event_stations_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'in_use'::text, 'offline'::text])));
ALTER TABLE ONLY public.event_waves ADD CONSTRAINT event_waves_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_waves ADD CONSTRAINT event_waves_run_ord_unique UNIQUE (event_run_id, ord) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ONLY public.event_waves ADD CONSTRAINT event_waves_duration_min_check CHECK (((duration_min IS NULL) OR (duration_min > 0)));
ALTER TABLE ONLY public.event_waves ADD CONSTRAINT event_waves_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'live'::text, 'done'::text, 'skipped'::text])));
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT final_rankings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT uniq_final_rankings_tournament_rank UNIQUE (tournament_id, rank);
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT uniq_final_rankings_tournament_team UNIQUE (tournament_id, team_id);
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT chk_final_rankings_rank_positive CHECK ((rank >= 1));
ALTER TABLE ONLY public.free_players ADD CONSTRAINT free_players_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.free_players ADD CONSTRAINT free_players_source_check CHECK ((source = ANY (ARRAY['discord'::text, 'web'::text])));
ALTER TABLE ONLY public.free_players ADD CONSTRAINT free_players_source_fields_check CHECK ((((source = 'discord'::text) AND (discord_user_id IS NOT NULL)) OR ((source = 'web'::text) AND (display_name IS NOT NULL) AND (length(btrim(display_name)) > 0) AND (contact_email IS NOT NULL) AND (length(btrim(contact_email)) > 0))));
ALTER TABLE ONLY public.game_heroes ADD CONSTRAINT game_heroes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.game_heroes ADD CONSTRAINT game_heroes_game_external_id_key UNIQUE (game, external_id);
ALTER TABLE ONLY public.game_heroes ADD CONSTRAINT game_heroes_game_check CHECK ((game = ANY (ARRAY['lol'::text, 'dota2'::text])));
ALTER TABLE ONLY public.games ADD CONSTRAINT games_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.games ADD CONSTRAINT games_hero_bans_is_array CHECK ((jsonb_typeof(hero_bans) = 'array'::text));
ALTER TABLE ONLY public.helloasso_donations ADD CONSTRAINT helloasso_donations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.helloasso_donations ADD CONSTRAINT helloasso_donations_tenant_payment_key UNIQUE (tenant_id, helloasso_payment_id);
ALTER TABLE ONLY public.helloasso_donations ADD CONSTRAINT helloasso_donations_amount_cents_check CHECK ((amount_cents >= 0));
ALTER TABLE ONLY public.integration_secrets ADD CONSTRAINT integration_secrets_pkey PRIMARY KEY (tenant_id, key);
ALTER TABLE ONLY public.league_scrims ADD CONSTRAINT league_scrims_pkey PRIMARY KEY (league_id, scrim_id);
ALTER TABLE ONLY public.league_standings ADD CONSTRAINT league_standings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.league_standings ADD CONSTRAINT league_standings_league_team_unique UNIQUE (league_id, team_id);
ALTER TABLE ONLY public.league_tournaments ADD CONSTRAINT league_tournaments_pkey PRIMARY KEY (league_id, tournament_id);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_tenant_slug_unique UNIQUE (tenant_id, slug);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'finished'::text, 'archived'::text])));
ALTER TABLE ONLY public.lobbies ADD CONSTRAINT lobbies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lobbies ADD CONSTRAINT lobbies_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE ONLY public.lobby_placements ADD CONSTRAINT lobby_placements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lobby_placements ADD CONSTRAINT uq_lobby_placements_lobby_team UNIQUE (lobby_id, team_id);
ALTER TABLE ONLY public.lobby_placements ADD CONSTRAINT lobby_placements_placement_check CHECK (((placement IS NULL) OR (placement >= 1)));
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_draft_id_step_number_key UNIQUE (draft_id, step_number);
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_action_check CHECK ((action = ANY (ARRAY['ban'::text, 'pick'::text])));
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_phase_check CHECK ((phase = ANY (ARRAY['ban_1'::text, 'pick_1'::text, 'ban_2'::text, 'pick_2'::text, 'ban_3'::text, 'pick_3'::text])));
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_side_check CHECK ((side = ANY (ARRAY['team1'::text, 'team2'::text])));
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_step_number_check CHECK ((step_number >= 1));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_match_id_game_index_key UNIQUE (match_id, game_index);
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_check CHECK ((((team1_side IS NULL) AND (team2_side IS NULL)) OR ((team1_side IS NOT NULL) AND (team2_side IS NOT NULL) AND (team1_side <> team2_side))));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_game_check CHECK ((game = ANY (ARRAY['lol'::text, 'dota2'::text])));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_game_index_check CHECK ((game_index >= 1));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_pick_timer_seconds_check CHECK (((pick_timer_seconds >= 5) AND (pick_timer_seconds <= 300)));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_team1_side_check CHECK (((team1_side IS NULL) OR (team1_side = ANY (ARRAY['blue'::text, 'red'::text, 'radiant'::text, 'dire'::text]))));
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_team2_side_check CHECK (((team2_side IS NULL) OR (team2_side = ANY (ARRAY['blue'::text, 'red'::text, 'radiant'::text, 'dire'::text]))));
ALTER TABLE ONLY public.match_evidence ADD CONSTRAINT match_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_evidence ADD CONSTRAINT match_evidence_kind_chk CHECK ((kind = ANY (ARRAY['screenshot'::text, 'replay_file'::text, 'replay_url'::text])));
ALTER TABLE ONLY public.match_evidence ADD CONSTRAINT match_evidence_location_chk CHECK ((((kind = 'replay_url'::text) AND (external_url IS NOT NULL) AND (storage_path IS NULL)) OR ((kind = ANY (ARRAY['screenshot'::text, 'replay_file'::text])) AND (storage_path IS NOT NULL) AND (external_url IS NULL))));
ALTER TABLE ONLY public.match_evidence ADD CONSTRAINT match_evidence_team_side_chk CHECK (((team_side IS NULL) OR (team_side = ANY (ARRAY[1, 2]))));
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT match_lineups_pkey PRIMARY KEY (match_id, team_id);
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT chk_match_lineups_status CHECK ((status = ANY (ARRAY['draft'::text, 'validated'::text])));
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT chk_match_lineups_validated_by_kind CHECK (((validated_by_kind IS NULL) OR (validated_by_kind = ANY (ARRAY['team'::text, 'admin'::text]))));
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT chk_match_lineups_validation_complete CHECK ((((status = 'validated'::text) AND (validated_at IS NOT NULL) AND (validated_by_kind IS NOT NULL)) OR ((status <> 'validated'::text) AND (validated_at IS NULL) AND (validated_by_kind IS NULL))));
ALTER TABLE ONLY public.match_map_vetos ADD CONSTRAINT match_map_vetos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_map_vetos ADD CONSTRAINT match_map_vetos_action_check CHECK ((action = ANY (ARRAY['ban'::text, 'pick'::text, 'decider'::text])));
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_match_id_key UNIQUE (match_id);
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_winner_source_chk CHECK (((winner_source IS NULL) OR (winner_source = ANY (ARRAY['discord'::text, 'twitch'::text, 'manual'::text]))));
ALTER TABLE ONLY public.match_mvp_votes ADD CONSTRAINT match_mvp_votes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_mvp_votes ADD CONSTRAINT match_mvp_votes_source_check CHECK ((source = ANY (ARRAY['discord'::text, 'twitch'::text])));
ALTER TABLE ONLY public.match_participants ADD CONSTRAINT match_participants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_participants ADD CONSTRAINT match_participants_match_team_user_unique UNIQUE (match_id, team_id, user_id);
ALTER TABLE ONLY public.match_prediction_settings ADD CONSTRAINT match_prediction_settings_pkey PRIMARY KEY (tenant_id, user_id);
ALTER TABLE ONLY public.match_predictions ADD CONSTRAINT match_predictions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_predictions ADD CONSTRAINT match_predictions_one_per_user UNIQUE (tenant_id, match_id, user_id);
ALTER TABLE ONLY public.match_predictions ADD CONSTRAINT match_predictions_result_check CHECK (((result IS NULL) OR (result = ANY (ARRAY['won'::text, 'lost'::text, 'void'::text]))));
ALTER TABLE ONLY public.match_predictions ADD CONSTRAINT match_predictions_settlement_coherent CHECK (((result IS NULL) = (settled_at IS NULL)));
ALTER TABLE ONLY public.match_public_mvp_polls ADD CONSTRAINT match_public_mvp_polls_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_public_mvp_polls ADD CONSTRAINT match_public_mvp_polls_match_id_key UNIQUE (match_id);
ALTER TABLE ONLY public.match_public_mvp_votes ADD CONSTRAINT match_public_mvp_votes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_public_mvp_votes ADD CONSTRAINT match_public_mvp_votes_source_check CHECK ((source = ANY (ARRAY['discord'::text, 'twitch'::text])));
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_unique_side UNIQUE (match_id, team_side);
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_side_chk CHECK ((team_side = ANY (ARRAY[1, 2])));
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_t1_nonneg CHECK ((team1_score >= 0));
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_t2_nonneg CHECK ((team2_score >= 0));
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.matches ADD CONSTRAINT chk_matches_status CHECK ((status = ANY (ARRAY['pending'::text, 'ongoing'::text, 'finished'::text, 'cancelled'::text, 'postponed'::text, 'disputed'::text, 'walkover'::text])));
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_bye_check CHECK (((is_bye = false) OR ((is_bye = true) AND (team1_id IS NOT NULL) AND (team2_id IS NULL))));
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_owner_check CHECK ((((tournament_id IS NOT NULL) AND (scrim_id IS NULL)) OR ((tournament_id IS NULL) AND (scrim_id IS NOT NULL))));
ALTER TABLE ONLY public.news ADD CONSTRAINT news_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.news ADD CONSTRAINT news_tenant_id_slug_key UNIQUE (tenant_id, slug);
ALTER TABLE ONLY public.news ADD CONSTRAINT news_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])));
ALTER TABLE ONLY public.news_comments ADD CONSTRAINT news_comments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'unsubscribed'::text])));
ALTER TABLE ONLY public.notification_prefs ADD CONSTRAINT notification_prefs_pkey PRIMARY KEY (user_id, event_type, channel);
ALTER TABLE ONLY public.notification_prefs ADD CONSTRAINT notification_prefs_channel_check CHECK ((channel = ANY (ARRAY['push'::text, 'email'::text])));
ALTER TABLE ONLY public.overlay_heartbeats ADD CONSTRAINT overlay_heartbeats_pkey PRIMARY KEY (tenant_id, source);
ALTER TABLE ONLY public.overlay_heartbeats ADD CONSTRAINT overlay_heartbeats_source_check CHECK ((source ~ '^[A-Za-z0-9:_-]{1,80}$'::text));
ALTER TABLE ONLY public.partners ADD CONSTRAINT partners_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.partners ADD CONSTRAINT partners_category_check CHECK ((category = ANY (ARRAY['super'::text, 'major'::text, 'cultural'::text])));
ALTER TABLE ONLY public.partnership_requests ADD CONSTRAINT partnership_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.partnership_requests ADD CONSTRAINT partnership_requests_category_check CHECK ((category = ANY (ARRAY['super'::text, 'major'::text, 'cultural'::text, 'other'::text])));
ALTER TABLE ONLY public.partnership_requests ADD CONSTRAINT partnership_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'contacted'::text, 'negotiating'::text, 'accepted'::text, 'declined'::text, 'archived'::text])));
ALTER TABLE ONLY public.patch_notes ADD CONSTRAINT patch_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pending_guild_links ADD CONSTRAINT pending_guild_links_pkey PRIMARY KEY (guild_id);
ALTER TABLE ONLY public.plan_cgv_acceptances ADD CONSTRAINT plan_cgv_acceptances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.plan_cgv_acceptances ADD CONSTRAINT plan_cgv_acceptances_amount_cents_check CHECK ((amount_cents > 0));
ALTER TABLE ONLY public.plan_cgv_acceptances ADD CONSTRAINT plan_cgv_acceptances_term_check CHECK ((term = ANY (ARRAY['month'::text, 'year'::text])));
ALTER TABLE ONLY public.player_action_snoozes ADD CONSTRAINT player_action_snoozes_pkey PRIMARY KEY (tenant_id, discord_user_id, action_key);
ALTER TABLE ONLY public.player_blacklist ADD CONSTRAINT player_blacklist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.player_blacklist ADD CONSTRAINT player_blacklist_at_least_one_identifier_chk CHECK (((battle_tag IS NOT NULL) OR (display_name IS NOT NULL) OR (discord_user_id IS NOT NULL)));
ALTER TABLE ONLY public.player_calendar_tokens ADD CONSTRAINT player_calendar_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.player_discovery_profiles ADD CONSTRAINT player_discovery_profiles_pkey PRIMARY KEY (auth_user_id);
ALTER TABLE ONLY public.player_discovery_profiles ADD CONSTRAINT player_discovery_tagline_len CHECK (((tagline IS NULL) OR (char_length(tagline) <= 160)));
ALTER TABLE ONLY public.player_follows ADD CONSTRAINT player_follows_pkey PRIMARY KEY (follower_id, followee_id);
ALTER TABLE ONLY public.player_follows ADD CONSTRAINT player_follows_no_self CHECK ((follower_id <> followee_id));
ALTER TABLE ONLY public.player_hero_preferences ADD CONSTRAINT player_hero_preferences_pkey PRIMARY KEY (auth_user_id);
ALTER TABLE ONLY public.player_hero_preferences ADD CONSTRAINT player_hero_prefs_bans_max CHECK ((cardinality(bans) <= 3));
ALTER TABLE ONLY public.player_hero_preferences ADD CONSTRAINT player_hero_prefs_disjoints CHECK ((NOT (picks && bans)));
ALTER TABLE ONLY public.player_hero_preferences ADD CONSTRAINT player_hero_prefs_picks_max CHECK ((cardinality(picks) <= 3));
ALTER TABLE ONLY public.player_rating_history ADD CONSTRAINT player_rating_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.player_rating_history ADD CONSTRAINT player_rating_history_match_user_unique UNIQUE (match_id, user_id);
ALTER TABLE ONLY public.player_rating_history ADD CONSTRAINT player_rating_history_result_check CHECK ((result = ANY (ARRAY['win'::text, 'loss'::text, 'draw'::text])));
ALTER TABLE ONLY public.player_ratings ADD CONSTRAINT player_ratings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.player_ratings ADD CONSTRAINT player_ratings_tenant_user_unique UNIQUE (tenant_id, user_id);
ALTER TABLE ONLY public.prize_pool_checkouts ADD CONSTRAINT prize_pool_checkouts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.prize_pool_checkouts ADD CONSTRAINT prize_pool_checkouts_checkout_intent_id_key UNIQUE (checkout_intent_id);
ALTER TABLE ONLY public.prize_pool_checkouts ADD CONSTRAINT prize_pool_checkouts_amount_cents_check CHECK ((amount_cents > 0));
ALTER TABLE ONLY public.prize_pool_checkouts ADD CONSTRAINT prize_pool_checkouts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'expired'::text])));
ALTER TABLE ONLY public.prize_pool_contributions ADD CONSTRAINT prize_pool_contributions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.prize_pool_contributions ADD CONSTRAINT prize_pool_contributions_helloasso_payment_id_key UNIQUE (helloasso_payment_id);
ALTER TABLE ONLY public.prize_pool_contributions ADD CONSTRAINT prize_pool_contributions_amount_cents_check CHECK ((amount_cents > 0));
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE ONLY public.rate_limit_buckets ADD CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (bucket, window_start);
ALTER TABLE ONLY public.scrim_planning_availabilities ADD CONSTRAINT scrim_planning_availabilities_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scrim_planning_availabilities ADD CONSTRAINT scrim_planning_avail_unique UNIQUE (planning_id, user_id);
ALTER TABLE ONLY public.scrim_planning_availabilities ADD CONSTRAINT scrim_planning_availabilities_party_check CHECK ((party = ANY (ARRAY['team1'::text, 'team2'::text, 'staff'::text])));
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_check CHECK (((day_end_min > day_start_min) AND (day_end_min <= 1440)));
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_day_start_min_check CHECK (((day_start_min >= 0) AND (day_start_min <= 1440)));
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_distinct_teams CHECK ((team1_id <> team2_id));
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_horizon_days_check CHECK (((horizon_days >= 1) AND (horizon_days <= 42)));
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_slot_minutes_check CHECK ((slot_minutes = ANY (ARRAY[30, 60])));
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'validated'::text, 'cancelled'::text, 'closed'::text])));
ALTER TABLE ONLY public.scrim_score_reports ADD CONSTRAINT scrim_score_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scrim_score_reports ADD CONSTRAINT scrim_score_reports_unique_side UNIQUE (scrim_id, team_side);
ALTER TABLE ONLY public.scrim_score_reports ADD CONSTRAINT scrim_score_reports_scores_check CHECK (((team1_score >= 0) AND (team2_score >= 0)));
ALTER TABLE ONLY public.scrim_score_reports ADD CONSTRAINT scrim_score_reports_side_check CHECK ((team_side = ANY (ARRAY[1, 2])));
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_format_len CHECK (((format IS NULL) OR (length(format) <= 40)));
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_note_len CHECK (((note IS NULL) OR (length(note) <= 280)));
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_slots_is_array CHECK ((jsonb_typeof(slots) = 'array'::text));
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'fulfilled'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_tenant_id_slug_key UNIQUE (tenant_id, slug);
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_distinct_teams CHECK (((team1_id IS NULL) OR (team2_id IS NULL) OR (team1_id <> team2_id)));
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_duration_minutes_check CHECK (((duration_minutes IS NULL) OR ((duration_minutes >= 15) AND (duration_minutes <= 720))));
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'running'::text, 'completed'::text, 'cancelled'::text, 'disputed'::text])));
ALTER TABLE ONLY public.site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (tenant_id, key);
ALTER TABLE ONLY public.social_accounts ADD CONSTRAINT social_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.social_accounts ADD CONSTRAINT social_accounts_tenant_id_platform_key UNIQUE (tenant_id, platform);
ALTER TABLE ONLY public.social_feed_items ADD CONSTRAINT social_feed_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.social_feed_items ADD CONSTRAINT social_feed_items_tenant_id_source_external_id_key UNIQUE (tenant_id, source, external_id);
ALTER TABLE ONLY public.social_post_targets ADD CONSTRAINT social_post_targets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.social_post_targets ADD CONSTRAINT social_post_targets_post_id_platform_key UNIQUE (post_id, platform);
ALTER TABLE ONLY public.social_post_targets ADD CONSTRAINT social_post_targets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
ALTER TABLE ONLY public.social_posts ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.social_posts ADD CONSTRAINT social_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'publishing'::text, 'done'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE ONLY public.staff ADD CONSTRAINT staff_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff ADD CONSTRAINT staff_email_key UNIQUE (email);
ALTER TABLE ONLY public.staff ADD CONSTRAINT staff_role_check CHECK ((role = ANY (ARRAY['caster'::text, 'admin'::text, 'owner'::text])));
ALTER TABLE ONLY public.staff_logs ADD CONSTRAINT staff_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stage_teams ADD CONSTRAINT stage_teams_pkey PRIMARY KEY (stage_id, team_id);
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT stage_tiebreaker_overrides_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT unique_override UNIQUE (stage_id, winner_team_id, loser_team_id);
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT no_self_override CHECK ((winner_team_id <> loser_team_id));
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_message_key UNIQUE (tenant_id, twitch_message_id);
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_actor_name_check CHECK (((actor_name IS NULL) OR (char_length(actor_name) <= 60)));
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_amount_check CHECK (((amount IS NULL) OR (amount >= 0)));
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_kind_check CHECK ((kind = ANY (ARRAY['follow'::text, 'sub'::text, 'resub'::text, 'gift'::text, 'cheer'::text, 'raid'::text])));
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_tier_check CHECK (((tier IS NULL) OR (tier = ANY (ARRAY['prime'::text, '1000'::text, '2000'::text, '3000'::text]))));
ALTER TABLE ONLY public.stream_alert_rules ADD CONSTRAINT stream_alert_rules_pkey PRIMARY KEY (tenant_id, kind);
ALTER TABLE ONLY public.stream_alert_rules ADD CONSTRAINT stream_alert_rules_kind_check CHECK ((kind = ANY (ARRAY['follow'::text, 'sub'::text, 'resub'::text, 'gift'::text, 'cheer'::text, 'raid'::text, 'donation'::text])));
ALTER TABLE ONLY public.stream_alert_rules ADD CONSTRAINT stream_alert_rules_message_check CHECK (((message IS NULL) OR (char_length(message) <= 120)));
ALTER TABLE ONLY public.stream_alert_rules ADD CONSTRAINT stream_alert_rules_min_amount_check CHECK (((min_amount IS NULL) OR (min_amount >= 0)));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_pkey PRIMARY KEY (tenant_id);
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_accent_color_check CHECK (((accent_color IS NULL) OR (accent_color ~ '^#[0-9A-Fa-f]{6}$'::text)));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_duration_ms_check CHECK (((duration_ms IS NULL) OR ((duration_ms >= 3000) AND (duration_ms <= 60000))));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_frame_kind_check CHECK (((frame_kind IS NULL) OR (frame_kind = ANY (ARRAY['image'::text, 'video'::text]))));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_frame_path_len CHECK (((frame_path IS NULL) OR (char_length(frame_path) <= 500)));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_sound_path_len CHECK (((sound_path IS NULL) OR (char_length(sound_path) <= 500)));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_sound_url_check CHECK (((sound_url IS NULL) OR (char_length(sound_url) <= 500)));
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_sound_volume_check CHECK (((sound_volume >= 0) AND (sound_volume <= 100)));
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_category_check CHECK ((category = ANY (ARRAY['dispute'::text, 'behavior'::text, 'technical'::text, 'other'::text])));
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_reported_target_type_chk CHECK ((reported_target_type = ANY (ARRAY['player'::text, 'team'::text, 'org'::text])));
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_source_check CHECK ((source = ANY (ARRAY['web'::text, 'discord_bot'::text])));
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])));
ALTER TABLE ONLY public.task_boards ADD CONSTRAINT task_boards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_checklist_items ADD CONSTRAINT task_checklist_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_columns ADD CONSTRAINT task_columns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_comments ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_labels ADD CONSTRAINT task_labels_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_labels ADD CONSTRAINT task_labels_board_id_name_key UNIQUE (board_id, name);
ALTER TABLE ONLY public.task_labels ADD CONSTRAINT task_labels_color_chk CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text));
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_priority_chk CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_approved_has_rarity CHECK (((status <> 'approved'::text) OR (rarity IS NOT NULL)));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_artist_name_check CHECK (((char_length(artist_name) >= 2) AND (char_length(artist_name) <= 80)));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_artist_url_check CHECK (((artist_url IS NULL) OR (char_length(artist_url) <= 300)));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_image_path_check CHECK (((char_length(image_path) >= 3) AND (char_length(image_path) <= 300)));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_rarity_check CHECK (((rarity IS NULL) OR (rarity = ANY (ARRAY['common'::text, 'rare'::text, 'epic'::text, 'legendary'::text]))));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_review_notes_check CHECK (((review_notes IS NULL) OR (char_length(review_notes) <= 500)));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_source_ref_check CHECK (((source_ref IS NULL) OR ((char_length(source_ref) >= 3) AND (char_length(source_ref) <= 120))));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'revoked'::text])));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 80)));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_category_check CHECK ((category = ANY (ARRAY['fanart'::text, 'association'::text])));
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_submitter_check CHECK (((category = 'association'::text) OR (submitted_by IS NOT NULL)));
ALTER TABLE ONLY public.tcg_overlay_themes ADD CONSTRAINT tcg_overlay_themes_pkey PRIMARY KEY (tenant_id);
ALTER TABLE ONLY public.tcg_overlay_themes ADD CONSTRAINT tcg_overlay_themes_accent_color_check CHECK (((accent_color IS NULL) OR (accent_color ~ '^#[0-9A-Fa-f]{6}$'::text)));
ALTER TABLE ONLY public.tcg_overlay_themes ADD CONSTRAINT tcg_overlay_themes_drop_line_check CHECK (((drop_line IS NULL) OR (char_length(drop_line) <= 120)));
ALTER TABLE ONLY public.tcg_overlay_themes ADD CONSTRAINT tcg_overlay_themes_media_kind_check CHECK (((media_kind IS NULL) OR (media_kind = ANY (ARRAY['image'::text, 'video'::text]))));
ALTER TABLE ONLY public.tcg_overlay_themes ADD CONSTRAINT tcg_overlay_themes_position_check CHECK ((("position" IS NULL) OR ("position" = ANY (ARRAY['top-left'::text, 'top-right'::text, 'bottom-left'::text, 'bottom-right'::text]))));
ALTER TABLE ONLY public.tcg_overlay_themes ADD CONSTRAINT tcg_overlay_themes_win_line_check CHECK (((win_line IS NULL) OR (char_length(win_line) <= 120)));
ALTER TABLE ONLY public.tcg_overlay_tokens ADD CONSTRAINT tcg_overlay_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_pkey PRIMARY KEY (pack_id, "position");
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'rare'::text, 'epic'::text, 'legendary'::text])));
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_subject_exclusif CHECK ((((subject_kind = 'player'::text) AND (card_user_id IS NOT NULL) AND (card_team_id IS NULL) AND (card_map_slug IS NULL) AND (card_fanart_id IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'team'::text) AND (card_team_id IS NOT NULL) AND (card_user_id IS NULL) AND (card_map_slug IS NULL) AND (card_fanart_id IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'map'::text) AND (card_map_slug IS NOT NULL) AND (card_user_id IS NULL) AND (card_team_id IS NULL) AND (card_fanart_id IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'fanart'::text) AND (card_fanart_id IS NOT NULL) AND (card_user_id IS NULL) AND (card_team_id IS NULL) AND (card_map_slug IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'mascot'::text) AND (card_mascot_slug IS NOT NULL) AND (card_user_id IS NULL) AND (card_team_id IS NULL) AND (card_map_slug IS NULL) AND (card_fanart_id IS NULL))));
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_subject_kind_check CHECK ((subject_kind = ANY (ARRAY['player'::text, 'team'::text, 'map'::text, 'fanart'::text, 'mascot'::text])));
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_one_per_match UNIQUE (tenant_id, user_id, source_match_id);
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_source_coherent CHECK ((((source_kind = 'victory'::text) AND (source_match_id IS NOT NULL)) OR ((source_kind = ANY (ARRAY['purchase'::text, 'welcome'::text, 'drop'::text, 'placement'::text, 'streak'::text, 'trade'::text, 'forge'::text])) AND (source_match_id IS NULL))));
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_source_kind_check CHECK ((source_kind = ANY (ARRAY['victory'::text, 'purchase'::text, 'welcome'::text, 'drop'::text, 'placement'::text, 'streak'::text, 'trade'::text, 'forge'::text])));
ALTER TABLE ONLY public.tcg_photo_purges ADD CONSTRAINT tcg_photo_purges_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tcg_photo_purges ADD CONSTRAINT tcg_photo_purges_reason_check CHECK ((reason = ANY (ARRAY['revoked'::text, 'rejected'::text])));
ALTER TABLE ONLY public.tcg_player_cards ADD CONSTRAINT tcg_player_cards_pkey PRIMARY KEY (tenant_id, user_id);
ALTER TABLE ONLY public.tcg_player_cards ADD CONSTRAINT tcg_player_cards_photo_status_check CHECK ((photo_status = ANY (ARRAY['none'::text, 'pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE ONLY public.tcg_showcases ADD CONSTRAINT tcg_showcases_pkey PRIMARY KEY (tenant_id, user_id);
ALTER TABLE ONLY public.tcg_showcases ADD CONSTRAINT tcg_showcases_max_cards CHECK ((cardinality(subject_keys) <= 3));
ALTER TABLE ONLY public.tcg_trade_blocks ADD CONSTRAINT tcg_trade_blocks_pkey PRIMARY KEY (tenant_id, user_id, blocked_user_id);
ALTER TABLE ONLY public.tcg_trade_blocks ADD CONSTRAINT tcg_trade_blocks_not_self CHECK ((user_id <> blocked_user_id));
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_pkey PRIMARY KEY (trade_id, side, ordinal);
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_offered_is_a_copy CHECK (((side <> 'offered'::text) OR ((from_pack_id IS NOT NULL) AND (from_position IS NOT NULL) AND (rarity IS NOT NULL) AND (is_foil IS NOT NULL))));
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_ordinal_check CHECK (((ordinal >= 0) AND (ordinal < 10)));
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_rarity_check CHECK (((rarity IS NULL) OR (rarity = ANY (ARRAY['common'::text, 'rare'::text, 'epic'::text, 'legendary'::text]))));
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_side_check CHECK ((side = ANY (ARRAY['offered'::text, 'requested'::text])));
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_subject_exclusif CHECK ((((subject_kind = 'player'::text) AND (card_user_id IS NOT NULL) AND (card_team_id IS NULL) AND (card_map_slug IS NULL) AND (card_fanart_id IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'team'::text) AND (card_team_id IS NOT NULL) AND (card_user_id IS NULL) AND (card_map_slug IS NULL) AND (card_fanart_id IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'map'::text) AND (card_map_slug IS NOT NULL) AND (card_user_id IS NULL) AND (card_team_id IS NULL) AND (card_fanart_id IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'fanart'::text) AND (card_fanart_id IS NOT NULL) AND (card_user_id IS NULL) AND (card_team_id IS NULL) AND (card_map_slug IS NULL) AND (card_mascot_slug IS NULL)) OR ((subject_kind = 'mascot'::text) AND (card_mascot_slug IS NOT NULL) AND (card_user_id IS NULL) AND (card_team_id IS NULL) AND (card_map_slug IS NULL) AND (card_fanart_id IS NULL))));
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_subject_kind_check CHECK ((subject_kind = ANY (ARRAY['player'::text, 'team'::text, 'map'::text, 'fanart'::text, 'mascot'::text])));
ALTER TABLE ONLY public.tcg_trade_settings ADD CONSTRAINT tcg_trade_settings_pkey PRIMARY KEY (tenant_id, user_id);
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_cancel_has_reason CHECK (((status = 'cancelled'::text) = (resolution_reason IS NOT NULL)));
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_expiry_after_creation CHECK ((expires_at > created_at));
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_not_self CHECK ((proposer_id <> recipient_id));
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_resolution_coherent CHECK (((status = 'pending'::text) = (resolved_at IS NULL)));
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_resolution_reason_check CHECK (((resolution_reason IS NULL) OR (resolution_reason = ANY (ARRAY['proposer_cancelled'::text, 'offered_unavailable'::text, 'card_unavailable'::text, 'trading_disabled'::text]))));
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE ONLY public.tcg_wallet_entries ADD CONSTRAINT tcg_wallet_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tcg_wallet_entries ADD CONSTRAINT tcg_wallet_entries_one_per_source UNIQUE (tenant_id, user_id, source_kind, source_ref);
ALTER TABLE ONLY public.tcg_wallet_entries ADD CONSTRAINT tcg_wallet_entries_amount_check CHECK ((amount <> 0));
ALTER TABLE ONLY public.tcg_wallet_entries ADD CONSTRAINT tcg_wallet_entries_note_length CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY public.tcg_wallet_entries ADD CONSTRAINT tcg_wallet_entries_source_kind_check CHECK ((source_kind = ANY (ARRAY['match_win'::text, 'scrim_win'::text, 'booster_purchase'::text, 'admin_grant'::text, 'card_recycled'::text, 'twitch_drop'::text, 'welcome_gift'::text, 'supporter_welcome'::text, 'staff_welcome'::text, 'checkin_streak'::text, 'tournament_placement'::text, 'battlenet_verified'::text, 'collection_set'::text, 'match_prediction'::text, 'card_forged'::text, 'showcase_cosmetic'::text])));
ALTER TABLE ONLY public.tcg_wallets ADD CONSTRAINT tcg_wallets_pkey PRIMARY KEY (tenant_id, user_id);
ALTER TABLE ONLY public.tcg_wallets ADD CONSTRAINT tcg_wallets_balance_check CHECK ((balance >= 0));
ALTER TABLE ONLY public.team_audit_logs ADD CONSTRAINT team_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_availability ADD CONSTRAINT team_availability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_availability ADD CONSTRAINT team_availability_slots_is_array CHECK ((jsonb_typeof(slots) = 'array'::text));
ALTER TABLE ONLY public.team_availability ADD CONSTRAINT team_availability_slots_len CHECK ((jsonb_array_length(slots) <= 70));
ALTER TABLE ONLY public.team_availability ADD CONSTRAINT team_availability_timezone_len CHECK (((length(timezone) >= 1) AND (length(timezone) <= 64)));
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_constraints_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_constraints_kind_check CHECK ((kind = ANY (ARRAY['blackout'::text, 'earliest'::text, 'latest'::text, 'weekday'::text])));
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_shape CHECK (
CASE kind
    WHEN 'blackout'::text THEN ((starts_on IS NOT NULL) AND (ends_on IS NOT NULL) AND (ends_on >= starts_on) AND (time_of_day IS NULL) AND (weekdays IS NULL))
    WHEN 'earliest'::text THEN ((time_of_day IS NOT NULL) AND (starts_on IS NULL) AND (ends_on IS NULL) AND (weekdays IS NULL))
    WHEN 'latest'::text THEN ((time_of_day IS NOT NULL) AND (starts_on IS NULL) AND (ends_on IS NULL) AND (weekdays IS NULL))
    WHEN 'weekday'::text THEN ((weekdays IS NOT NULL) AND ((array_length(weekdays, 1) >= 1) AND (array_length(weekdays, 1) <= 7)) AND (starts_on IS NULL) AND (ends_on IS NULL) AND (time_of_day IS NULL))
    ELSE false
END);
ALTER TABLE ONLY public.team_discord_channels ADD CONSTRAINT team_discord_channels_pkey PRIMARY KEY (team_id);
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_max_uses_check CHECK (((max_uses IS NULL) OR (max_uses > 0)));
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_uses_count_check CHECK ((uses_count >= 0));
ALTER TABLE ONLY public.team_member_permissions ADD CONSTRAINT team_member_permissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);
ALTER TABLE ONLY public.team_members ADD CONSTRAINT chk_team_members_role CHECK ((role = ANY (ARRAY['player'::text, 'coach'::text, 'substitute'::text, 'manager'::text])));
ALTER TABLE ONLY public.team_members ADD CONSTRAINT chk_team_members_substitute_matches_role CHECK ((is_substitute = (COALESCE(role, ''::text) = 'substitute'::text)));
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_battletag_format CHECK ((battle_tag ~ '^[[:alnum:]̀-ͯ᪰-᫿⃐-⃰]{2,}#[0-9]{3,6}$'::text));
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_skill_rating_range CHECK (((skill_rating IS NULL) OR ((skill_rating >= 0) AND (skill_rating <= 5000))));
ALTER TABLE ONLY public.team_openings ADD CONSTRAINT team_openings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_openings ADD CONSTRAINT team_openings_contact_check CHECK (((source <> 'web'::text) OR ((contact_email IS NOT NULL) AND (length(btrim(contact_email)) > 0))));
ALTER TABLE ONLY public.team_openings ADD CONSTRAINT team_openings_identity_check CHECK (((team_id IS NOT NULL) OR ((team_name IS NOT NULL) AND (length(btrim(team_name)) > 0))));
ALTER TABLE ONLY public.team_openings ADD CONSTRAINT team_openings_source_check CHECK ((source = ANY (ARRAY['web'::text, 'discord'::text])));
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_tenant_team_unique UNIQUE (tenant_id, team_id);
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_not_empty CHECK (((vod_url IS NOT NULL) OR (notes IS NOT NULL)));
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_notes_len CHECK (((notes IS NULL) OR (length(notes) <= 4000)));
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_objectives_len CHECK (((objectives IS NULL) OR (char_length(objectives) <= 2000)));
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_subject_type_check CHECK ((subject_type = ANY (ARRAY['match'::text, 'scrim'::text])));
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_vod_len CHECK (((vod_url IS NULL) OR (length(vod_url) <= 500)));
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_logo_credit_name_length CHECK (((logo_credit_name IS NULL) OR ((char_length(logo_credit_name) >= 2) AND (char_length(logo_credit_name) <= 80))));
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_logo_credit_url_https CHECK (((logo_credit_url IS NULL) OR ((char_length(logo_credit_url) <= 300) AND (logo_credit_url ~~ 'https://%'::text))));
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_preferred_locale_check CHECK (((preferred_locale IS NULL) OR (preferred_locale = ANY (ARRAY['fr'::text, 'en'::text]))));
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_skill_rating_range CHECK (((skill_rating IS NULL) OR ((skill_rating >= 0) AND (skill_rating <= 5000))));
ALTER TABLE ONLY public.tenant_api_tokens ADD CONSTRAINT tenant_api_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_api_tokens ADD CONSTRAINT tenant_api_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.tenant_discord_config ADD CONSTRAINT tenant_discord_config_pkey PRIMARY KEY (guild_id);
ALTER TABLE ONLY public.tenant_invitations ADD CONSTRAINT tenant_invitations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_invitations ADD CONSTRAINT tenant_invitations_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.tenant_invitations ADD CONSTRAINT tenant_invitations_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'caster'::text])));
ALTER TABLE ONLY public.tenant_map_pool ADD CONSTRAINT tenant_map_pool_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_plan_checkouts ADD CONSTRAINT tenant_plan_checkouts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_plan_checkouts ADD CONSTRAINT tenant_plan_checkouts_checkout_intent_id_key UNIQUE (checkout_intent_id);
ALTER TABLE ONLY public.tenant_plan_checkouts ADD CONSTRAINT tenant_plan_checkouts_plan_check CHECK ((plan = ANY (ARRAY['regie'::text, 'circuit'::text])));
ALTER TABLE ONLY public.tenant_plan_checkouts ADD CONSTRAINT tenant_plan_checkouts_term_check CHECK ((term = ANY (ARRAY['month'::text, 'year'::text])));
ALTER TABLE ONLY public.tenant_plan_payments ADD CONSTRAINT tenant_plan_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_plan_payments ADD CONSTRAINT tenant_plan_payments_helloasso_payment_id_key UNIQUE (helloasso_payment_id);
ALTER TABLE ONLY public.tenant_plan_payments ADD CONSTRAINT tenant_plan_payments_plan_check CHECK ((plan = ANY (ARRAY['regie'::text, 'circuit'::text])));
ALTER TABLE ONLY public.tenant_requests ADD CONSTRAINT tenant_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_requests ADD CONSTRAINT tenant_requests_email_verification_token_key UNIQUE (email_verification_token);
ALTER TABLE ONLY public.tenant_requests ADD CONSTRAINT tenant_requests_secrets_reveal_token_key UNIQUE (secrets_reveal_token);
ALTER TABLE ONLY public.tenant_requests ADD CONSTRAINT tenant_requests_source_check CHECK ((source = ANY (ARRAY['web'::text, 'discord_command'::text])));
ALTER TABLE ONLY public.tenant_requests ADD CONSTRAINT tenant_requests_status_check CHECK ((status = ANY (ARRAY['pending_email_verification'::text, 'pending_bot_invite'::text, 'completed'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE ONLY public.tenant_secrets ADD CONSTRAINT tenant_secrets_pkey PRIMARY KEY (tenant_id);
ALTER TABLE ONLY public.tenant_staff ADD CONSTRAINT tenant_staff_pkey PRIMARY KEY (tenant_id, staff_id);
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenants ADD CONSTRAINT chk_tenants_dispute_sla_positive CHECK ((dispute_sla_minutes >= 1));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_custom_domain_state_check CHECK ((custom_domain_state = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_kind_check CHECK ((kind = ANY (ARRAY['organizer'::text, 'developer'::text])));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text, 'purge_scheduled'::text, 'purged'::text])));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_nonprofit_rna_format CHECK (((nonprofit_rna IS NULL) OR (nonprofit_rna ~ '^W[0-9A-Z]{9}$'::text)));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_nonprofit_verified_via CHECK (((nonprofit_verified_via IS NULL) OR (nonprofit_verified_via = ANY (ARRAY['helloasso'::text, 'rna'::text, 'staff'::text]))));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_plan_check CHECK ((plan = ANY (ARRAY['foundation'::text, 'discovery'::text, 'regie'::text, 'circuit'::text, 'editor'::text])));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_plan_status_check CHECK ((plan_status = ANY (ARRAY['active'::text, 'past_due'::text, 'canceled'::text])));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_plan_term_check CHECK ((plan_term = ANY (ARRAY['month'::text, 'year'::text])));
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_slug_format_chk CHECK (((slug ~ '^[a-z0-9-]+$'::text) AND ((char_length(slug) >= 2) AND (char_length(slug) <= 50))));
ALTER TABLE ONLY public.tournament_maps ADD CONSTRAINT tournament_maps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tournament_maps ADD CONSTRAINT tournament_maps_one_scope CHECK (((play_date IS NULL) OR (round_number IS NULL)));
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_tournament_id_user_id_key UNIQUE (tournament_id, user_id);
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_battle_tag_check CHECK (((char_length(battle_tag) >= 3) AND (char_length(battle_tag) <= 40)));
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_check CHECK (((status = 'placed'::text) = (placed_team_id IS NOT NULL)));
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_display_name_check CHECK (((char_length(display_name) >= 2) AND (char_length(display_name) <= 40)));
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_status_check CHECK ((status = ANY (ARRAY['waitlist'::text, 'placed'::text, 'withdrawn'::text])));
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_tournament_id_key UNIQUE (tournament_id);
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_base_amount_cents_check CHECK ((base_amount_cents >= 0));
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_goal_amount_cents_check CHECK (((goal_amount_cents IS NULL) OR (goal_amount_cents > 0)));
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_raised_amount_cents_check CHECK ((raised_amount_cents >= 0));
ALTER TABLE ONLY public.tournament_stages ADD CONSTRAINT tournament_stages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tournament_stages ADD CONSTRAINT check_tiebreaker_policy CHECK ((tiebreaker_policy = ANY (ARRAY['manual'::text, 'extra_round'::text, 'map_diff'::text, 'seed'::text])));
ALTER TABLE ONLY public.tournament_teams ADD CONSTRAINT tournament_teams_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tournament_teams ADD CONSTRAINT tournament_teams_tournament_id_team_id_key UNIQUE (tournament_id, team_id);
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT tournaments_tenant_id_slug_key UNIQUE (tenant_id, slug);
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT check_max_gte_min_players CHECK (((max_players IS NULL) OR (min_players IS NULL) OR (max_players >= min_players)));
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT check_max_players_positive CHECK (((max_players IS NULL) OR (max_players > 0)));
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT check_min_players_positive CHECK (((min_players IS NULL) OR (min_players > 0)));
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT chk_tournaments_status CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'running'::text, 'completed'::text, 'archived'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT tournaments_checkin_grace_minutes_check CHECK (((checkin_grace_minutes >= 0) AND (checkin_grace_minutes <= 120)));
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT tournaments_game_check CHECK (((game IS NULL) OR (game = ANY (ARRAY['overwatch'::text, 'valorant'::text, 'cs2'::text, 'rocket-league'::text, 'r6-siege'::text, 'marvel-rivals'::text, 'lol'::text, 'dota2'::text]))));
ALTER TABLE ONLY public.twitch_broadcaster_connections ADD CONSTRAINT twitch_broadcaster_connections_pkey PRIMARY KEY (tenant_id);
ALTER TABLE ONLY public.twitch_channels ADD CONSTRAINT twitch_channels_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.twitch_channels ADD CONSTRAINT twitch_channels_tenant_id_channel_key UNIQUE (tenant_id, channel);
ALTER TABLE ONLY public.user_battlenet_links ADD CONSTRAINT user_battlenet_links_pkey PRIMARY KEY (auth_user_id);
ALTER TABLE ONLY public.user_battlenet_links ADD CONSTRAINT user_battlenet_links_battle_net_id_key UNIQUE (battle_net_id);
ALTER TABLE ONLY public.user_discord_links ADD CONSTRAINT user_discord_links_pkey PRIMARY KEY (auth_user_id);
ALTER TABLE ONLY public.user_discord_links ADD CONSTRAINT user_discord_links_discord_user_id_key UNIQUE (discord_user_id);
ALTER TABLE ONLY public.user_twitch_links ADD CONSTRAINT user_twitch_links_pkey PRIMARY KEY (auth_user_id);
ALTER TABLE ONLY public.user_twitch_links ADD CONSTRAINT user_twitch_links_twitch_user_id_key UNIQUE (twitch_user_id);
ALTER TABLE ONLY public.web_push_deliveries ADD CONSTRAINT web_push_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.web_push_deliveries ADD CONSTRAINT web_push_deliveries_event_subscription_unique UNIQUE (outbox_event_id, subscription_id);
ALTER TABLE ONLY public.web_push_deliveries ADD CONSTRAINT web_push_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text, 'expired'::text])));
ALTER TABLE ONLY public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_uniq UNIQUE (subscription_id, outbox_event_id);
ALTER TABLE ONLY public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text])));
ALTER TABLE ONLY public.webhook_subscriptions ADD CONSTRAINT webhook_subscriptions_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------- INDEX
CREATE INDEX announcements_active_priority_idx ON public.announcements USING btree (is_active, priority DESC, created_at DESC);
CREATE INDEX announcements_ends_at_idx ON public.announcements USING btree (ends_at);
CREATE INDEX announcements_starts_at_idx ON public.announcements USING btree (starts_at);
CREATE INDEX broadcast_recipients_pending_idx ON public.broadcast_recipients USING btree (campaign_id, created_at) WHERE (status = 'pending'::text);
CREATE INDEX broadcast_schedules_active_idx ON public.broadcast_schedules USING btree (last_wave_at) WHERE (status = 'scheduled'::text);
CREATE INDEX cast_assignments_briefing_at_idx ON public.cast_assignments USING btree (briefing_at);
CREATE INDEX cast_assignments_cast_member_idx ON public.cast_assignments USING btree (cast_member_id);
CREATE UNIQUE INDEX cast_members_auth_user_id_unique ON public.cast_members USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE UNIQUE INDEX caster_themes_single_active ON public.caster_themes USING btree (is_active) WHERE is_active;
CREATE INDEX demandes_auth_user_id_idx ON public.demandes USING btree (auth_user_id);
CREATE UNIQUE INDEX demandes_invite_token_hash_idx ON public.demandes USING btree (((payload ->> 'invite_token_hash'::text))) WHERE ((type = 'invite'::text) AND (payload ? 'invite_token_hash'::text));
CREATE INDEX demandes_status_idx ON public.demandes USING btree (status);
CREATE INDEX demandes_type_idx ON public.demandes USING btree (type);
CREATE UNIQUE INDEX discord_webhooks_tenant_global_channel_uidx ON public.discord_webhooks USING btree (tenant_id, channel_type) WHERE (tournament_id IS NULL);
CREATE UNIQUE INDEX discord_webhooks_tournament_channel_uidx ON public.discord_webhooks USING btree (tournament_id, channel_type) WHERE (tournament_id IS NOT NULL);
CREATE INDEX email_campaigns_created_at_idx ON public.email_campaigns USING btree (created_at DESC);
CREATE INDEX idx_adherent_payments_year ON public.adherent_payments USING btree (year, payment_date);
CREATE INDEX idx_adherents_active ON public.adherents USING btree (is_active, current_year);
CREATE INDEX idx_adherents_active_payment_status ON public.adherents USING btree (is_active, payment_status);
CREATE INDEX idx_adherents_deleted_at ON public.adherents USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_adherents_deleted_at_desc ON public.adherents USING btree (deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_adherents_name ON public.adherents USING btree (last_name, first_name);
CREATE INDEX idx_adherents_payment_status ON public.adherents USING btree (current_year, payment_status);
CREATE INDEX idx_adherents_role ON public.adherents USING btree (role);
CREATE INDEX idx_admin_idempotency_expires_at ON public.admin_idempotency USING btree (expires_at);
CREATE INDEX idx_announcements_deleted_at ON public.announcements USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_announcements_tenant_active_created ON public.announcements USING btree (tenant_id, is_active, created_at DESC);
CREATE INDEX idx_announcements_tenant_deleted_at ON public.announcements USING btree (tenant_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_announcements_tenant_priority_created ON public.announcements USING btree (tenant_id, priority DESC, created_at DESC);
CREATE INDEX idx_api_usage_counters_updated_at ON public.api_usage_counters USING btree (updated_at);
CREATE INDEX idx_association_pole_members_pole_active_order ON public.association_pole_members USING btree (pole_key, is_active, sort_order);
CREATE INDEX idx_blacklist_alerts_blacklist_entry_id ON public.blacklist_alerts USING btree (blacklist_entry_id);
CREATE INDEX idx_blacklist_alerts_tenant_created_at ON public.blacklist_alerts USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_blacklist_alerts_tenant_discord_user_id ON public.blacklist_alerts USING btree (tenant_id, discord_user_id);
CREATE INDEX idx_blizzard_media_type ON public.blizzard_media USING btree (type);
CREATE INDEX idx_blizzard_news_date ON public.blizzard_news USING btree (date_parsed DESC NULLS LAST);
CREATE INDEX idx_bot_event_outbox_pending ON public.bot_event_outbox USING btree (created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_bot_event_outbox_status_created_at ON public.bot_event_outbox USING btree (status, created_at);
CREATE INDEX idx_bot_event_outbox_tenant_id ON public.bot_event_outbox USING btree (tenant_id);
CREATE INDEX idx_bot_idempotency_expires_at ON public.bot_idempotency USING btree (expires_at);
CREATE INDEX idx_bot_locks_expires_at ON public.bot_locks USING btree (expires_at);
CREATE INDEX idx_bot_player_actions_action_created ON public.bot_player_actions USING btree (action, created_at DESC);
CREATE INDEX idx_bot_player_actions_actor_created ON public.bot_player_actions USING btree (actor_auth_user_id, created_at DESC);
CREATE INDEX idx_bot_player_actions_target_created ON public.bot_player_actions USING btree (target_auth_user_id, created_at DESC) WHERE (target_auth_user_id IS NOT NULL);
CREATE INDEX idx_bot_player_actions_tenant_id ON public.bot_player_actions USING btree (tenant_id);
CREATE INDEX idx_bracket_snapshots_stage ON public.bracket_snapshots USING btree (stage_id, taken_at DESC);
CREATE INDEX idx_bracket_snapshots_taken_by_staff_id ON public.bracket_snapshots USING btree (taken_by_staff_id);
CREATE INDEX idx_bracket_snapshots_tenant_id ON public.bracket_snapshots USING btree (tenant_id);
CREATE INDEX idx_broadcast_recipients_campaign_status ON public.broadcast_recipients USING btree (campaign_id, status);
CREATE INDEX idx_broadcast_schedules_created_by ON public.broadcast_schedules USING btree (created_by);
CREATE INDEX idx_captcha_challenges_expires ON public.captcha_challenges USING btree (expires_at);
CREATE INDEX idx_cast_assignments_scrim_id ON public.cast_assignments USING btree (scrim_id) WHERE (scrim_id IS NOT NULL);
CREATE INDEX idx_cast_assignments_tenant_id ON public.cast_assignments USING btree (tenant_id);
CREATE INDEX idx_cast_assignments_unacked ON public.cast_assignments USING btree (briefing_at) WHERE (acked_at IS NULL);
CREATE INDEX idx_cast_members_active_order ON public.cast_members USING btree (is_active, sort_order);
CREATE INDEX idx_cast_members_deleted_at ON public.cast_members USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_cast_members_tenant_active_sort ON public.cast_members USING btree (tenant_id, is_active, sort_order);
CREATE INDEX idx_cast_members_tenant_deleted_at ON public.cast_members USING btree (tenant_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_caster_presence_event_run_id ON public.caster_presence USING btree (event_run_id);
CREATE INDEX idx_caster_presence_tenant_run_seen ON public.caster_presence USING btree (tenant_id, event_run_id, last_seen_at DESC);
CREATE INDEX idx_caster_scenes_sort_order ON public.caster_scenes USING btree (sort_order);
CREATE INDEX idx_circuit_partner_applications_granted_tenant ON public.circuit_partner_applications USING btree (granted_tenant_id);
CREATE INDEX idx_circuit_partner_applications_status ON public.circuit_partner_applications USING btree (status, created_at DESC);
CREATE INDEX idx_custom_game_presets_stage ON public.custom_game_presets USING btree (tenant_id, stage_id);
CREATE INDEX idx_custom_game_presets_tournament ON public.custom_game_presets USING btree (tenant_id, tournament_id);
CREATE INDEX idx_demandes_created_at ON public.demandes USING btree (created_at DESC);
CREATE INDEX idx_demandes_processed_by_staff_id ON public.demandes USING btree (processed_by_staff_id);
CREATE INDEX idx_demandes_team_id ON public.demandes USING btree (team_id);
CREATE INDEX idx_demandes_tenant_status_created ON public.demandes USING btree (tenant_id, status, created_at DESC);
CREATE INDEX idx_demandes_tenant_type_created ON public.demandes USING btree (tenant_id, type, created_at DESC);
CREATE INDEX idx_demandes_tournament_id ON public.demandes USING btree (tournament_id);
CREATE INDEX idx_demandes_user_id ON public.demandes USING btree (user_id);
CREATE INDEX idx_discord_event_ack_handled_at ON public.discord_event_ack USING btree (handled_at DESC);
CREATE INDEX idx_discord_guilds_tenant_id ON public.discord_guilds USING btree (tenant_id);
CREATE INDEX idx_discord_webhooks_tenant_id ON public.discord_webhooks USING btree (tenant_id);
CREATE INDEX idx_discord_webhooks_tenant_tournament ON public.discord_webhooks USING btree (tenant_id, tournament_id, channel_type) WHERE (tournament_id IS NOT NULL);
CREATE INDEX idx_email_campaigns_created_by ON public.email_campaigns USING btree (created_by);
CREATE INDEX idx_email_deliveries_created_at ON public.email_deliveries USING btree (created_at);
CREATE INDEX idx_email_deliveries_tenant_id ON public.email_deliveries USING btree (tenant_id);
CREATE INDEX idx_email_deliveries_user_id ON public.email_deliveries USING btree (user_id);
CREATE INDEX idx_entity_blacklist_banned_by ON public.entity_blacklist USING btree (banned_by);
CREATE INDEX idx_entity_blacklist_name_trgm ON public.entity_blacklist USING gin (name public.gin_trgm_ops);
CREATE INDEX idx_entity_blacklist_tenant_active ON public.entity_blacklist USING btree (tenant_id, active);
CREATE INDEX idx_entity_blacklist_tenant_entity_type ON public.entity_blacklist USING btree (tenant_id, entity_type);
CREATE INDEX idx_event_cue_acks_cast_member ON public.event_cue_acks USING btree (cast_member_id);
CREATE INDEX idx_event_cue_acks_tenant_cue ON public.event_cue_acks USING btree (tenant_id, cue_id);
CREATE INDEX idx_event_cues_tenant_run_created ON public.event_cues USING btree (tenant_id, event_run_id, created_at DESC);
CREATE INDEX idx_event_cues_urgent ON public.event_cues USING btree (event_run_id, severity) WHERE (severity = 'urgent'::text);
CREATE INDEX idx_event_runs_tenant_status_scheduled ON public.event_runs USING btree (tenant_id, status, scheduled_at DESC);
CREATE INDEX idx_event_segments_match_id ON public.event_segments USING btree (match_id) WHERE (match_id IS NOT NULL);
CREATE INDEX idx_event_segments_station_id ON public.event_segments USING btree (station_id) WHERE (station_id IS NOT NULL);
CREATE INDEX idx_event_segments_tenant_status ON public.event_segments USING btree (tenant_id, status);
CREATE INDEX idx_event_segments_wave_id ON public.event_segments USING btree (wave_id) WHERE (wave_id IS NOT NULL);
CREATE INDEX idx_event_stations_event_run_id ON public.event_stations USING btree (event_run_id);
CREATE INDEX idx_event_stations_tenant_run ON public.event_stations USING btree (tenant_id, event_run_id);
CREATE INDEX idx_event_waves_tenant_run_ord ON public.event_waves USING btree (tenant_id, event_run_id, ord);
CREATE INDEX idx_final_rankings_frozen_by_staff_id ON public.final_rankings USING btree (frozen_by_staff_id);
CREATE INDEX idx_final_rankings_team ON public.final_rankings USING btree (team_id);
CREATE INDEX idx_final_rankings_tenant ON public.final_rankings USING btree (tenant_id);
CREATE INDEX idx_free_players_auth_user_id ON public.free_players USING btree (auth_user_id);
CREATE INDEX idx_free_players_tenant_expires ON public.free_players USING btree (tenant_id, expires_at DESC NULLS LAST);
CREATE INDEX idx_free_players_tenant_source ON public.free_players USING btree (tenant_id, source);
CREATE INDEX idx_game_heroes_game ON public.game_heroes USING btree (game) WHERE (enabled = true);
CREATE INDEX idx_game_heroes_key ON public.game_heroes USING btree (game, key);
CREATE INDEX idx_games_match ON public.games USING btree (match_id);
CREATE INDEX idx_games_picked_by_team ON public.games USING btree (picked_by_team_id);
CREATE INDEX idx_games_tenant_id ON public.games USING btree (tenant_id);
CREATE INDEX idx_games_winner ON public.games USING btree (winner_team_id);
CREATE INDEX idx_helloasso_donations_tenant_created ON public.helloasso_donations USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_integration_secrets_updated_by ON public.integration_secrets USING btree (updated_by);
CREATE INDEX idx_league_scrims_scrim ON public.league_scrims USING btree (scrim_id);
CREATE INDEX idx_league_scrims_tenant ON public.league_scrims USING btree (tenant_id);
CREATE INDEX idx_league_standings_league_points ON public.league_standings USING btree (league_id, points DESC);
CREATE INDEX idx_league_standings_team_id ON public.league_standings USING btree (team_id);
CREATE INDEX idx_league_standings_tenant_id ON public.league_standings USING btree (tenant_id);
CREATE INDEX idx_league_tournaments_tenant_id ON public.league_tournaments USING btree (tenant_id);
CREATE INDEX idx_league_tournaments_tournament ON public.league_tournaments USING btree (tournament_id);
CREATE INDEX idx_lobbies_stage ON public.lobbies USING btree (stage_id);
CREATE INDEX idx_lobbies_tenant ON public.lobbies USING btree (tenant_id);
CREATE INDEX idx_lobbies_tournament ON public.lobbies USING btree (tournament_id);
CREATE INDEX idx_lobby_placements_tenant ON public.lobby_placements USING btree (tenant_id);
CREATE INDEX idx_match_draft_steps_hero_id ON public.match_draft_steps USING btree (hero_id);
CREATE INDEX idx_match_drafts_status ON public.match_drafts USING btree (status) WHERE (status = 'in_progress'::text);
CREATE INDEX idx_match_drafts_tenant ON public.match_drafts USING btree (tenant_id);
CREATE INDEX idx_match_evidence_match_id ON public.match_evidence USING btree (match_id);
CREATE INDEX idx_match_evidence_tenant_id ON public.match_evidence USING btree (tenant_id);
CREATE INDEX idx_match_lineups_team ON public.match_lineups USING btree (team_id, tenant_id);
CREATE INDEX idx_match_lineups_tenant ON public.match_lineups USING btree (tenant_id);
CREATE INDEX idx_match_lineups_validated_by ON public.match_lineups USING btree (validated_by);
CREATE INDEX idx_match_map_vetos_match_step ON public.match_map_vetos USING btree (match_id, step_number);
CREATE INDEX idx_match_map_vetos_team_id ON public.match_map_vetos USING btree (team_id);
CREATE INDEX idx_match_map_vetos_tenant_id ON public.match_map_vetos USING btree (tenant_id);
CREATE INDEX idx_match_mvp_polls_active_by_tenant ON public.match_mvp_polls USING btree (tenant_id, match_id) WHERE (winner_member_id IS NULL);
CREATE INDEX idx_match_mvp_polls_tenant_id ON public.match_mvp_polls USING btree (tenant_id);
CREATE INDEX idx_match_mvp_polls_winner_imported_by ON public.match_mvp_polls USING btree (winner_imported_by);
CREATE INDEX idx_match_mvp_polls_winner_member_id ON public.match_mvp_polls USING btree (winner_member_id);
CREATE INDEX idx_match_participants_team_id ON public.match_participants USING btree (team_id);
CREATE INDEX idx_match_participants_tenant_user ON public.match_participants USING btree (tenant_id, user_id);
CREATE INDEX idx_match_participants_tournament_id ON public.match_participants USING btree (tournament_id);
CREATE INDEX idx_match_prediction_settings_shown ON public.match_prediction_settings USING btree (tenant_id) WHERE show_in_leaderboard;
CREATE INDEX idx_match_predictions_match ON public.match_predictions USING btree (match_id);
CREATE INDEX idx_match_predictions_user ON public.match_predictions USING btree (tenant_id, user_id, created_at DESC);
CREATE INDEX idx_match_score_reports_tenant_id ON public.match_score_reports USING btree (tenant_id);
CREATE INDEX idx_matches_deleted_at ON public.matches USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_matches_forfeit_team_id ON public.matches USING btree (forfeit_team_id) WHERE (forfeit_team_id IS NOT NULL);
CREATE INDEX idx_matches_parent_match_lose_id ON public.matches USING btree (parent_match_lose_id);
CREATE INDEX idx_matches_parent_match_win_id ON public.matches USING btree (parent_match_win_id);
CREATE INDEX idx_matches_round ON public.matches USING btree (round_number);
CREATE INDEX idx_matches_scrim_id ON public.matches USING btree (scrim_id) WHERE (scrim_id IS NOT NULL);
CREATE INDEX idx_matches_sla_escalation_check ON public.matches USING btree (tenant_id, status, dispute_opened_at) WHERE ((status = 'disputed'::text) AND (escalation_pinged_at IS NULL));
CREATE INDEX idx_matches_stage ON public.matches USING btree (stage_id);
CREATE INDEX idx_matches_team1_id ON public.matches USING btree (team1_id);
CREATE INDEX idx_matches_team2_id ON public.matches USING btree (team2_id);
CREATE INDEX idx_matches_tenant_deleted_at ON public.matches USING btree (tenant_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_matches_tenant_dispute_open ON public.matches USING btree (tenant_id, dispute_opened_at) WHERE (status = 'disputed'::text);
CREATE INDEX idx_matches_tenant_id ON public.matches USING btree (tenant_id);
CREATE INDEX idx_matches_tournament ON public.matches USING btree (tournament_id);
CREATE INDEX idx_matches_winner_team_id ON public.matches USING btree (winner_team_id);
CREATE INDEX idx_news_author_id ON public.news USING btree (author_id);
CREATE INDEX idx_news_comments_news_id_created_at ON public.news_comments USING btree (news_id, created_at DESC);
CREATE INDEX idx_news_comments_tenant_id ON public.news_comments USING btree (tenant_id);
CREATE INDEX idx_news_team_id ON public.news USING btree (team_id) WHERE (team_id IS NOT NULL);
CREATE INDEX idx_partners_active ON public.partners USING btree (is_active, category);
CREATE INDEX idx_partners_category_order ON public.partners USING btree (category, display_order, created_at DESC);
CREATE INDEX idx_partners_deleted_at ON public.partners USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_partners_deleted_at_desc ON public.partners USING btree (deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_partnership_requests_email ON public.partnership_requests USING btree (email);
CREATE INDEX idx_partnership_requests_status_date ON public.partnership_requests USING btree (status, created_at DESC);
CREATE INDEX idx_patch_notes_created_at ON public.patch_notes USING btree (created_at DESC);
CREATE INDEX idx_patch_notes_date_parsed ON public.patch_notes USING btree (date_parsed DESC NULLS LAST);
CREATE INDEX idx_player_action_snoozes_until ON public.player_action_snoozes USING btree (snoozed_until);
CREATE INDEX idx_player_blacklist_banned_by ON public.player_blacklist USING btree (banned_by);
CREATE INDEX idx_player_blacklist_display_name_trgm ON public.player_blacklist USING gin (display_name public.gin_trgm_ops);
CREATE INDEX idx_player_blacklist_tenant_active ON public.player_blacklist USING btree (tenant_id, active);
CREATE INDEX idx_player_blacklist_tenant_battle_tag ON public.player_blacklist USING btree (tenant_id, battle_tag);
CREATE INDEX idx_player_blacklist_tenant_discord_user_id ON public.player_blacklist USING btree (tenant_id, discord_user_id);
CREATE INDEX idx_player_rating_history_tenant_user_time ON public.player_rating_history USING btree (tenant_id, user_id, occurred_at DESC);
CREATE INDEX idx_player_rating_history_tournament_id ON public.player_rating_history USING btree (tournament_id);
CREATE INDEX idx_player_ratings_tenant_rating ON public.player_ratings USING btree (tenant_id, rating DESC);
CREATE INDEX idx_prize_pool_checkouts_pool ON public.prize_pool_checkouts USING btree (prize_pool_id);
CREATE INDEX idx_prize_pool_checkouts_tenant ON public.prize_pool_checkouts USING btree (tenant_id);
CREATE INDEX idx_prize_pool_contributions_pool ON public.prize_pool_contributions USING btree (prize_pool_id);
CREATE INDEX idx_prize_pool_contributions_tenant ON public.prize_pool_contributions USING btree (tenant_id);
CREATE INDEX idx_push_subscriptions_tenant_id ON public.push_subscriptions USING btree (tenant_id);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_scrim_planning_avail_tenant_planning ON public.scrim_planning_availabilities USING btree (tenant_id, planning_id);
CREATE INDEX idx_scrim_plannings_deleted_at ON public.scrim_plannings USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_scrim_plannings_scrim_id ON public.scrim_plannings USING btree (scrim_id);
CREATE INDEX idx_scrim_plannings_team1_id ON public.scrim_plannings USING btree (team1_id);
CREATE INDEX idx_scrim_plannings_team2_id ON public.scrim_plannings USING btree (team2_id);
CREATE INDEX idx_scrim_plannings_tenant_status ON public.scrim_plannings USING btree (tenant_id, status);
CREATE INDEX idx_scrim_plannings_tenant_team1 ON public.scrim_plannings USING btree (tenant_id, team1_id);
CREATE INDEX idx_scrim_plannings_tenant_team2 ON public.scrim_plannings USING btree (tenant_id, team2_id);
CREATE INDEX idx_scrim_score_reports_tenant_id ON public.scrim_score_reports USING btree (tenant_id);
CREATE INDEX idx_scrims_deleted_at ON public.scrims USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_scrims_is_public ON public.scrims USING btree (is_public) WHERE (is_public = true);
CREATE INDEX idx_scrims_scheduled_date ON public.scrims USING btree (scheduled_date);
CREATE INDEX idx_scrims_source_demande ON public.scrims USING btree (source_demande_id) WHERE (source_demande_id IS NOT NULL);
CREATE UNIQUE INDEX idx_scrims_source_planning_id ON public.scrims USING btree (source_planning_id) WHERE (source_planning_id IS NOT NULL);
CREATE INDEX idx_scrims_status ON public.scrims USING btree (status);
CREATE INDEX idx_scrims_team1_id ON public.scrims USING btree (team1_id) WHERE (team1_id IS NOT NULL);
CREATE INDEX idx_scrims_team2_id ON public.scrims USING btree (team2_id) WHERE (team2_id IS NOT NULL);
CREATE INDEX idx_scrims_winner_team_id ON public.scrims USING btree (winner_team_id);
CREATE INDEX idx_site_settings_updated_by ON public.site_settings USING btree (updated_by);
CREATE INDEX idx_social_accounts_connected_by ON public.social_accounts USING btree (connected_by);
CREATE INDEX idx_social_accounts_expiring ON public.social_accounts USING btree (token_expires_at) WHERE ((status = 'connected'::text) AND (token_expires_at IS NOT NULL));
CREATE INDEX idx_social_feed_items_recent ON public.social_feed_items USING btree (tenant_id, published_at DESC);
CREATE INDEX idx_social_post_targets_hashtags ON public.social_post_targets USING gin (hashtags);
CREATE INDEX idx_social_post_targets_pending ON public.social_post_targets USING btree (post_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_social_posts_created_by ON public.social_posts USING btree (created_by);
CREATE INDEX idx_social_posts_tenant_created ON public.social_posts USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_staff_extra_permissions ON public.staff USING gin (extra_permissions) WHERE (extra_permissions <> '{}'::text[]);
CREATE INDEX idx_staff_is_active ON public.staff USING btree (is_active) WHERE (is_active = false);
CREATE INDEX idx_staff_is_pole_admin ON public.staff USING btree (is_pole_admin) WHERE (is_pole_admin = true);
CREATE INDEX idx_staff_logs_entity ON public.staff_logs USING btree (entity_type, entity_id);
CREATE INDEX idx_staff_logs_staff_id ON public.staff_logs USING btree (staff_id);
CREATE INDEX idx_staff_logs_tenant_entity_created ON public.staff_logs USING btree (tenant_id, entity_type, created_at DESC);
CREATE INDEX idx_staff_logs_tournament_id ON public.staff_logs USING btree (tournament_id);
CREATE INDEX idx_staff_recycle_bin ON public.staff USING btree (deleted_at DESC) WHERE ((is_active = false) OR (deleted_at IS NOT NULL));
CREATE INDEX idx_stage_teams_team_id ON public.stage_teams USING btree (team_id);
CREATE INDEX idx_stage_teams_tenant_id ON public.stage_teams USING btree (tenant_id);
CREATE INDEX idx_stage_tiebreaker_overrides_loser_team_id ON public.stage_tiebreaker_overrides USING btree (loser_team_id);
CREATE INDEX idx_stage_tiebreaker_overrides_set_by_staff_id ON public.stage_tiebreaker_overrides USING btree (set_by_staff_id);
CREATE INDEX idx_stage_tiebreaker_overrides_tenant_id ON public.stage_tiebreaker_overrides USING btree (tenant_id);
CREATE INDEX idx_stage_tiebreaker_overrides_winner_team_id ON public.stage_tiebreaker_overrides USING btree (winner_team_id);
CREATE INDEX idx_stream_alert_events_tenant_created ON public.stream_alert_events USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_support_tickets_converted_entity_blacklist_id ON public.support_tickets USING btree (converted_entity_blacklist_id);
CREATE INDEX idx_support_tickets_converted_player_blacklist_id ON public.support_tickets USING btree (converted_player_blacklist_id);
CREATE INDEX idx_support_tickets_reporter_user_id ON public.support_tickets USING btree (reporter_user_id);
CREATE INDEX idx_support_tickets_resolved_by ON public.support_tickets USING btree (resolved_by);
CREATE INDEX idx_support_tickets_tenant_created ON public.support_tickets USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_support_tickets_tournament_severity_status ON public.support_tickets USING btree (tournament_id, severity, status);
CREATE INDEX idx_task_boards_created_by ON public.task_boards USING btree (created_by);
CREATE INDEX idx_task_boards_tenant_id ON public.task_boards USING btree (tenant_id);
CREATE INDEX idx_task_checklist_items_task_id_position ON public.task_checklist_items USING btree (task_id, "position");
CREATE INDEX idx_task_checklist_items_tenant_id ON public.task_checklist_items USING btree (tenant_id);
CREATE INDEX idx_task_columns_board_id ON public.task_columns USING btree (board_id);
CREATE INDEX idx_task_columns_tenant_id ON public.task_columns USING btree (tenant_id);
CREATE INDEX idx_task_comments_author_staff_id ON public.task_comments USING btree (author_staff_id);
CREATE INDEX idx_task_comments_task_id_created_at ON public.task_comments USING btree (task_id, created_at);
CREATE INDEX idx_task_comments_tenant_id ON public.task_comments USING btree (tenant_id);
CREATE INDEX idx_task_labels_tenant_id ON public.task_labels USING btree (tenant_id);
CREATE INDEX idx_tasks_assignee_staff_id ON public.tasks USING btree (assignee_staff_id);
CREATE INDEX idx_tasks_board_id_active ON public.tasks USING btree (board_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_tasks_column_id_position ON public.tasks USING btree (column_id, "position");
CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);
CREATE INDEX idx_tasks_tenant_id ON public.tasks USING btree (tenant_id);
CREATE INDEX idx_tcg_fanart_approved ON public.tcg_fanart_cards USING btree (tenant_id, created_at DESC) WHERE (status = 'approved'::text);
CREATE INDEX idx_tcg_fanart_author ON public.tcg_fanart_cards USING btree (tenant_id, submitted_by, created_at DESC);
CREATE INDEX idx_tcg_fanart_category ON public.tcg_fanart_cards USING btree (tenant_id, category, created_at DESC);
CREATE INDEX idx_tcg_fanart_pending ON public.tcg_fanart_cards USING btree (tenant_id, created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_tcg_pack_cards_active ON public.tcg_pack_cards USING btree (pack_id) WHERE (recycled_at IS NULL);
CREATE INDEX idx_tcg_pack_cards_card_fanart ON public.tcg_pack_cards USING btree (card_fanart_id);
CREATE INDEX idx_tcg_pack_cards_card_map ON public.tcg_pack_cards USING btree (card_map_slug) WHERE (card_map_slug IS NOT NULL);
CREATE INDEX idx_tcg_pack_cards_card_team ON public.tcg_pack_cards USING btree (card_team_id) WHERE (card_team_id IS NOT NULL);
CREATE INDEX idx_tcg_pack_cards_card_user ON public.tcg_pack_cards USING btree (card_user_id) WHERE (card_user_id IS NOT NULL);
CREATE INDEX idx_tcg_packs_source_kind ON public.tcg_packs USING btree (tenant_id, user_id, source_kind);
CREATE INDEX idx_tcg_packs_source_match ON public.tcg_packs USING btree (source_match_id);
CREATE INDEX idx_tcg_packs_unopened ON public.tcg_packs USING btree (tenant_id, user_id, granted_at DESC) WHERE (opened_at IS NULL);
CREATE INDEX idx_tcg_packs_user ON public.tcg_packs USING btree (tenant_id, user_id, granted_at DESC);
CREATE INDEX idx_tcg_player_cards_excluded ON public.tcg_player_cards USING btree (tenant_id) WHERE (excluded_at IS NOT NULL);
CREATE INDEX idx_tcg_player_cards_photo_reviewed_by ON public.tcg_player_cards USING btree (photo_reviewed_by);
CREATE INDEX idx_tcg_player_cards_photo_status ON public.tcg_player_cards USING btree (tenant_id, photo_status, created_at);
CREATE INDEX idx_tcg_showcases_subject_keys ON public.tcg_showcases USING gin (subject_keys) WHERE enabled;
CREATE INDEX idx_tcg_trade_blocks_blocked ON public.tcg_trade_blocks USING btree (tenant_id, blocked_user_id);
CREATE INDEX idx_tcg_trade_items_from ON public.tcg_trade_items USING btree (from_pack_id, from_position) WHERE (from_pack_id IS NOT NULL);
CREATE INDEX idx_tcg_trade_settings_open ON public.tcg_trade_settings USING btree (tenant_id) WHERE accepts_proposals;
CREATE INDEX idx_tcg_trades_accepted_recent ON public.tcg_trades USING btree (tenant_id, resolved_at) WHERE (status = 'accepted'::text);
CREATE INDEX idx_tcg_trades_pending_expiry ON public.tcg_trades USING btree (expires_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_tcg_trades_proposer ON public.tcg_trades USING btree (tenant_id, proposer_id, created_at DESC, id DESC);
CREATE INDEX idx_tcg_trades_proposer_pack ON public.tcg_trades USING btree (proposer_pack_id);
CREATE INDEX idx_tcg_trades_recipient ON public.tcg_trades USING btree (tenant_id, recipient_id, created_at DESC, id DESC);
CREATE INDEX idx_tcg_trades_recipient_pack ON public.tcg_trades USING btree (recipient_pack_id);
CREATE INDEX idx_tcg_wallet_entries_user ON public.tcg_wallet_entries USING btree (tenant_id, user_id, created_at DESC);
CREATE INDEX idx_team_audit_logs_team ON public.team_audit_logs USING btree (team_id, created_at DESC);
CREATE INDEX idx_team_audit_logs_tenant_id ON public.team_audit_logs USING btree (tenant_id);
CREATE INDEX idx_team_audit_logs_user ON public.team_audit_logs USING btree (user_id, created_at DESC);
CREATE INDEX idx_team_availability_constraints_created_by ON public.team_availability_constraints USING btree (created_by);
CREATE INDEX idx_team_availability_constraints_team ON public.team_availability_constraints USING btree (team_id);
CREATE INDEX idx_team_availability_constraints_tournament ON public.team_availability_constraints USING btree (tournament_id);
CREATE INDEX idx_team_availability_team ON public.team_availability_constraints USING btree (tenant_id, team_id);
CREATE INDEX idx_team_availability_tournament ON public.team_availability_constraints USING btree (tenant_id, tournament_id) WHERE (tournament_id IS NOT NULL);
CREATE INDEX idx_team_discord_channels_tenant ON public.team_discord_channels USING btree (tenant_id);
CREATE INDEX idx_team_invite_links_created_by ON public.team_invite_links USING btree (created_by);
CREATE INDEX idx_team_invite_links_team ON public.team_invite_links USING btree (team_id);
CREATE INDEX idx_team_members_tenant_id ON public.team_members USING btree (tenant_id);
CREATE INDEX idx_team_members_user_id ON public.team_members USING btree (user_id);
CREATE INDEX idx_team_openings_team_id ON public.team_openings USING btree (team_id);
CREATE INDEX idx_team_openings_tenant_expires ON public.team_openings USING btree (tenant_id, expires_at DESC NULLS LAST);
CREATE INDEX idx_team_openings_tenant_marked ON public.team_openings USING btree (tenant_id, marked_at DESC);
CREATE INDEX idx_team_ratings_team_id ON public.team_ratings USING btree (team_id);
CREATE INDEX idx_team_ratings_tenant_rating ON public.team_ratings USING btree (tenant_id, rating DESC);
CREATE INDEX idx_team_reviews_opponent_team_id ON public.team_reviews USING btree (opponent_team_id);
CREATE INDEX idx_teams_captain_id ON public.teams USING btree (captain_id);
CREATE INDEX idx_teams_deleted_at ON public.teams USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_teams_tenant_deleted_at ON public.teams USING btree (tenant_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_teams_tenant_id ON public.teams USING btree (tenant_id);
CREATE INDEX idx_tenant_api_tokens_expires_at ON public.tenant_api_tokens USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX idx_tenant_api_tokens_tenant_id ON public.tenant_api_tokens USING btree (tenant_id);
CREATE INDEX idx_tenant_invitations_accepted_staff ON public.tenant_invitations USING btree (accepted_staff_id);
CREATE INDEX idx_tenant_invitations_invited_by ON public.tenant_invitations USING btree (invited_by);
CREATE INDEX idx_tenant_map_pool_order ON public.tenant_map_pool USING btree (tenant_id, game, order_index);
CREATE INDEX idx_tenant_plan_checkouts_tenant ON public.tenant_plan_checkouts USING btree (tenant_id);
CREATE INDEX idx_tenant_plan_payments_tenant ON public.tenant_plan_payments USING btree (tenant_id);
CREATE INDEX idx_tenant_requests_created_tenant_id ON public.tenant_requests USING btree (created_tenant_id) WHERE (created_tenant_id IS NOT NULL);
CREATE INDEX idx_tenant_requests_discord_user ON public.tenant_requests USING btree (requester_discord_user_id);
CREATE INDEX idx_tenant_requests_email_verif_token ON public.tenant_requests USING btree (email_verification_token) WHERE (status = 'pending_email_verification'::text);
CREATE INDEX idx_tenant_requests_reveal_token ON public.tenant_requests USING btree (secrets_reveal_token) WHERE (secrets_revealed_at IS NULL);
CREATE INDEX idx_tenant_requests_status ON public.tenant_requests USING btree (status);
CREATE INDEX idx_tenant_secrets_api_key_hash ON public.tenant_secrets USING btree (bot_api_key_hash);
CREATE INDEX idx_tenant_staff_staff_id ON public.tenant_staff USING btree (staff_id);
CREATE INDEX idx_tenants_lifecycle_changed_by ON public.tenants USING btree (lifecycle_changed_by);
CREATE INDEX idx_tournament_maps_enabled ON public.tournament_maps USING btree (tournament_id, enabled);
CREATE INDEX idx_tournament_maps_order ON public.tournament_maps USING btree (tournament_id, order_index);
CREATE INDEX idx_tournament_pool_entries_origin ON public.tournament_pool_entries USING btree (tournament_id, origin_team_id) WHERE (origin_team_id IS NOT NULL);
CREATE INDEX idx_tournament_pool_entries_status ON public.tournament_pool_entries USING btree (tournament_id, status, created_at);
CREATE INDEX idx_tournament_pool_entries_user ON public.tournament_pool_entries USING btree (tenant_id, user_id);
CREATE INDEX idx_tournament_prize_pools_tenant ON public.tournament_prize_pools USING btree (tenant_id);
CREATE INDEX idx_tournament_stages_deleted_at ON public.tournament_stages USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_tournament_stages_tenant_deleted_at ON public.tournament_stages USING btree (tenant_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_tournament_stages_tenant_id ON public.tournament_stages USING btree (tenant_id);
CREATE INDEX idx_tournament_stages_tournament_id ON public.tournament_stages USING btree (tournament_id);
CREATE INDEX idx_tournament_teams_team ON public.tournament_teams USING btree (team_id);
CREATE INDEX idx_tournament_teams_tenant_id ON public.tournament_teams USING btree (tenant_id);
CREATE INDEX idx_tournament_teams_tournament_status ON public.tournament_teams USING btree (tournament_id, status);
CREATE INDEX idx_twitch_channels_active_order ON public.twitch_channels USING btree (is_active, sort_order, created_at DESC);
CREATE INDEX idx_web_push_deliveries_event_status ON public.web_push_deliveries USING btree (outbox_event_id, status);
CREATE INDEX idx_web_push_deliveries_subscription_status ON public.web_push_deliveries USING btree (subscription_id, status);
CREATE INDEX idx_web_push_deliveries_unacked ON public.web_push_deliveries USING btree (subscription_id) WHERE ((acked_at IS NULL) AND (status = 'delivered'::text));
CREATE INDEX idx_webhook_deliveries_sub_created ON public.webhook_deliveries USING btree (subscription_id, created_at DESC);
CREATE INDEX idx_webhook_subscriptions_enabled ON public.webhook_subscriptions USING btree (tenant_id) WHERE enabled;
CREATE INDEX idx_webhook_subscriptions_tenant ON public.webhook_subscriptions USING btree (tenant_id);
CREATE INDEX match_mvp_votes_match_idx ON public.match_mvp_votes USING btree (match_id);
CREATE INDEX match_mvp_votes_member_idx ON public.match_mvp_votes USING btree (member_id);
CREATE UNIQUE INDEX match_mvp_votes_one_per_voter_idx ON public.match_mvp_votes USING btree (tenant_id, match_id, source, voter_key);
CREATE INDEX match_public_mvp_polls_due_idx ON public.match_public_mvp_polls USING btree (closes_at) WHERE (closed_at IS NULL);
CREATE INDEX match_public_mvp_polls_tenant_idx ON public.match_public_mvp_polls USING btree (tenant_id);
CREATE INDEX match_public_mvp_votes_match_idx ON public.match_public_mvp_votes USING btree (match_id);
CREATE INDEX match_public_mvp_votes_member_idx ON public.match_public_mvp_votes USING btree (member_id);
CREATE UNIQUE INDEX match_public_mvp_votes_one_per_voter_idx ON public.match_public_mvp_votes USING btree (tenant_id, match_id, source, voter_key);
CREATE INDEX matches_checkin_window_idx ON public.matches USING btree (scheduled_at) WHERE ((status = 'pending'::text) AND (scheduled_at IS NOT NULL));
CREATE INDEX matches_disputed_idx ON public.matches USING btree (tournament_id, dispute_opened_at) WHERE (status = 'disputed'::text);
CREATE INDEX matches_next_match_lose_id_idx ON public.matches USING btree (next_match_lose_id);
CREATE INDEX matches_next_match_win_id_idx ON public.matches USING btree (next_match_win_id);
CREATE UNIQUE INDEX matches_team1_checkin_token_uidx ON public.matches USING btree (team1_checkin_token) WHERE (team1_checkin_token IS NOT NULL);
CREATE UNIQUE INDEX matches_team2_checkin_token_uidx ON public.matches USING btree (team2_checkin_token) WHERE (team2_checkin_token IS NOT NULL);
CREATE INDEX news_published_at_idx ON public.news USING btree (published_at DESC NULLS LAST);
CREATE INDEX news_status_idx ON public.news USING btree (status);
CREATE INDEX news_tag_idx ON public.news USING btree (tag);
CREATE INDEX newsletter_subscribers_confirm_token_idx ON public.newsletter_subscribers USING btree (confirm_token) WHERE (confirm_token IS NOT NULL);
CREATE INDEX newsletter_subscribers_confirmed_idx ON public.newsletter_subscribers USING btree (tenant_id) WHERE (status = 'confirmed'::text);
CREATE UNIQUE INDEX newsletter_subscribers_tenant_email_uidx ON public.newsletter_subscribers USING btree (tenant_id, lower(email));
CREATE INDEX plan_cgv_acceptances_tenant_idx ON public.plan_cgv_acceptances USING btree (tenant_id, accepted_at DESC);
CREATE UNIQUE INDEX player_calendar_tokens_active_key ON public.player_calendar_tokens USING btree (tenant_id, auth_user_id) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX player_calendar_tokens_token_key ON public.player_calendar_tokens USING btree (token);
CREATE INDEX player_discovery_profiles_discoverable_idx ON public.player_discovery_profiles USING btree (updated_at DESC) WHERE (discoverable = true);
CREATE INDEX player_follows_followee_id_idx ON public.player_follows USING btree (followee_id);
CREATE UNIQUE INDEX scrim_searches_one_active_per_team ON public.scrim_searches USING btree (team_id) WHERE (status = 'active'::text);
CREATE INDEX scrim_searches_team_id_idx ON public.scrim_searches USING btree (team_id);
CREATE INDEX scrim_searches_tenant_active_idx ON public.scrim_searches USING btree (tenant_id, expires_at) WHERE (status = 'active'::text);
CREATE INDEX scrims_ladder_idx ON public.scrims USING btree (tenant_id, completed_at DESC) WHERE ((status = 'completed'::text) AND ranked AND (deleted_at IS NULL));
CREATE INDEX staff_auth_idx ON public.staff USING btree (auth_user_id);
CREATE INDEX staff_role_idx ON public.staff USING btree (role);
CREATE INDEX support_tickets_created_at_idx ON public.support_tickets USING btree (created_at DESC);
CREATE INDEX support_tickets_discord_user_idx ON public.support_tickets USING btree (discord_user_id);
CREATE INDEX support_tickets_severity_idx ON public.support_tickets USING btree (severity);
CREATE INDEX support_tickets_status_idx ON public.support_tickets USING btree (status);
CREATE UNIQUE INDEX tcg_overlay_tokens_active_key ON public.tcg_overlay_tokens USING btree (tenant_id) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX tcg_overlay_tokens_token_key ON public.tcg_overlay_tokens USING btree (token);
CREATE UNIQUE INDEX tcg_photo_purges_path_uniq ON public.tcg_photo_purges USING btree (storage_path);
CREATE INDEX tcg_photo_purges_pending_idx ON public.tcg_photo_purges USING btree (created_at);
CREATE UNIQUE INDEX tcg_trades_one_pending_per_pair ON public.tcg_trades USING btree (tenant_id, proposer_id, recipient_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX tcg_wallet_entries_battlenet_once_per_account ON public.tcg_wallet_entries USING btree (source_ref) WHERE (source_kind = 'battlenet_verified'::text);
CREATE UNIQUE INDEX tcg_wallet_entries_battlenet_once_per_user ON public.tcg_wallet_entries USING btree (user_id) WHERE (source_kind = 'battlenet_verified'::text);
CREATE UNIQUE INDEX team_availability_team_user_uniq ON public.team_availability USING btree (team_id, user_id);
CREATE INDEX team_availability_tenant_team_idx ON public.team_availability USING btree (tenant_id, team_id);
CREATE INDEX team_availability_user_idx ON public.team_availability USING btree (user_id);
CREATE UNIQUE INDEX team_invite_links_active_per_team ON public.team_invite_links USING btree (tenant_id, team_id) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX team_member_permissions_active_key ON public.team_member_permissions USING btree (tenant_id, team_id, user_id, permission) WHERE (revoked_at IS NULL);
CREATE INDEX team_member_permissions_team_idx ON public.team_member_permissions USING btree (tenant_id, team_id);
CREATE INDEX team_member_permissions_user_idx ON public.team_member_permissions USING btree (tenant_id, user_id) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX team_members_tenant_user_key ON public.team_members USING btree (tenant_id, user_id) WHERE (role IS DISTINCT FROM 'manager'::text);
CREATE INDEX team_reviews_team_opponent_idx ON public.team_reviews USING btree (team_id, opponent_team_id);
CREATE INDEX team_reviews_team_played_idx ON public.team_reviews USING btree (tenant_id, team_id, played_at DESC);
CREATE UNIQUE INDEX team_reviews_team_subject_uniq ON public.team_reviews USING btree (team_id, subject_type, subject_id);
CREATE UNIQUE INDEX teams_tenant_id_slug_unique_idx ON public.teams USING btree (tenant_id, slug) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX tenant_invitations_live_email_idx ON public.tenant_invitations USING btree (tenant_id, lower(email)) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));
CREATE INDEX tenant_invitations_tenant_idx ON public.tenant_invitations USING btree (tenant_id, created_at DESC);
CREATE INDEX tenant_secrets_previous_key_hash_idx ON public.tenant_secrets USING btree (previous_key_hash) WHERE (previous_key_hash IS NOT NULL);
CREATE UNIQUE INDEX tenants_custom_domain_key ON public.tenants USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);
CREATE UNIQUE INDEX tenants_slug_key ON public.tenants USING btree (slug);
CREATE UNIQUE INDEX tenants_verified_custom_domain_idx ON public.tenants USING btree (lower(custom_domain)) WHERE ((custom_domain IS NOT NULL) AND (custom_domain_state = 'verified'::text));
CREATE INDEX tournament_maps_tournament_date_idx ON public.tournament_maps USING btree (tenant_id, tournament_id, play_date, order_index) WHERE (play_date IS NOT NULL);
CREATE INDEX tournament_maps_tournament_round_idx ON public.tournament_maps USING btree (tenant_id, tournament_id, round_number, order_index);
CREATE UNIQUE INDEX tournament_maps_unique_per_scope_idx ON public.tournament_maps USING btree (tenant_id, tournament_id, round_number, play_date, map_name) NULLS NOT DISTINCT;
CREATE INDEX tournaments_roster_locked_idx ON public.tournaments USING btree (roster_locked_at) WHERE (roster_locked_at IS NOT NULL);
CREATE UNIQUE INDEX uniq_scrim_plannings_source_demande ON public.scrim_plannings USING btree (source_demande_id) WHERE (source_demande_id IS NOT NULL);
CREATE UNIQUE INDEX uq_custom_game_presets_scope ON public.custom_game_presets USING btree (tenant_id, game, COALESCE(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(stage_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX uq_event_cues_dedup_key ON public.event_cues USING btree (dedup_key) WHERE (dedup_key IS NOT NULL);
CREATE UNIQUE INDEX uq_free_players_tenant_discord ON public.free_players USING btree (tenant_id, discord_user_id) WHERE (source = 'discord'::text);
CREATE UNIQUE INDEX uq_free_players_tenant_email ON public.free_players USING btree (tenant_id, lower(contact_email)) WHERE (source = 'web'::text);
CREATE UNIQUE INDEX uq_tcg_fanart_source_ref ON public.tcg_fanart_cards USING btree (tenant_id, source_ref) WHERE (source_ref IS NOT NULL);
CREATE UNIQUE INDEX uq_team_openings_tenant_email ON public.team_openings USING btree (tenant_id, lower(contact_email)) WHERE (source = 'web'::text);
CREATE UNIQUE INDEX uq_tenant_map_pool_tenant_game_lower_name ON public.tenant_map_pool USING btree (tenant_id, game, lower(map_name));
CREATE UNIQUE INDEX uq_tenant_requests_active_per_user ON public.tenant_requests USING btree (requester_discord_user_id) WHERE (status = ANY (ARRAY['pending_email_verification'::text, 'pending_bot_invite'::text]));
CREATE UNIQUE INDEX uq_tenant_requests_active_slug ON public.tenant_requests USING btree (lower(requested_slug)) WHERE (status = ANY (ARRAY['pending_email_verification'::text, 'pending_bot_invite'::text]));

-- ---------------------------------------------------------------- VUES
CREATE OR REPLACE VIEW public.map_stats_view WITH (security_invoker=on) AS
 SELECT map_name,
    count(id) AS games_played,
    sum(
        CASE
            WHEN (team1_score > team2_score) THEN 1
            ELSE 0
        END) AS wins_team1,
    sum(
        CASE
            WHEN (team2_score > team1_score) THEN 1
            ELSE 0
        END) AS wins_team2,
    sum((team1_score + team2_score)) AS total_rounds,
    sum((team1_score - team2_score)) AS diff_team1,
    sum((team2_score - team1_score)) AS diff_team2
   FROM public.games g
  GROUP BY map_name;;

CREATE OR REPLACE VIEW public.team_map_stats WITH (security_invoker=on) AS
 WITH per_game AS (
         SELECT g.tenant_id,
            m.team1_id AS team_id,
            g.map_name,
            g.team1_score AS own_score,
            g.team2_score AS opp_score,
            g.winner_team_id
           FROM (public.games g
             JOIN public.matches m ON ((m.id = g.match_id)))
          WHERE ((m.deleted_at IS NULL) AND (COALESCE(m.is_bye, false) = false) AND (m.team1_id IS NOT NULL) AND (g.map_name IS NOT NULL))
        UNION ALL
         SELECT g.tenant_id,
            m.team2_id,
            g.map_name,
            g.team2_score,
            g.team1_score,
            g.winner_team_id
           FROM (public.games g
             JOIN public.matches m ON ((m.id = g.match_id)))
          WHERE ((m.deleted_at IS NULL) AND (COALESCE(m.is_bye, false) = false) AND (m.team2_id IS NOT NULL) AND (g.map_name IS NOT NULL))
        ), scored AS (
         SELECT p.tenant_id,
            p.team_id,
            p.map_name,
            p.own_score,
            p.opp_score,
            p.winner_team_id,
                CASE
                    WHEN (p.winner_team_id IS NOT NULL) THEN (p.winner_team_id = p.team_id)
                    ELSE (COALESCE(p.own_score, 0) > COALESCE(p.opp_score, 0))
                END AS is_win,
                CASE
                    WHEN (p.winner_team_id IS NOT NULL) THEN (p.winner_team_id <> p.team_id)
                    ELSE (COALESCE(p.opp_score, 0) > COALESCE(p.own_score, 0))
                END AS is_loss
           FROM per_game p
        )
 SELECT tenant_id,
    team_id,
    map_name,
    (count(*))::integer AS games_played,
    (count(*) FILTER (WHERE is_win))::integer AS wins,
    (count(*) FILTER (WHERE is_loss))::integer AS losses,
    (COALESCE(sum(own_score), (0)::bigint))::integer AS rounds_won,
    (COALESCE(sum(opp_score), (0)::bigint))::integer AS rounds_lost,
    (round((((count(*) FILTER (WHERE is_win))::numeric * (100)::numeric) / (NULLIF(count(*), 0))::numeric), 1))::double precision AS win_rate
   FROM scored
  GROUP BY tenant_id, team_id, map_name;;

CREATE OR REPLACE VIEW public.team_stats_view WITH (security_invoker=on) AS
 WITH match_maps AS (
         SELECT m.id,
            m.tournament_id,
            m.completed_at,
            m.team1_id,
            m.team2_id,
            m.team1_score,
            m.team2_score,
            m.winner_team_id,
            COALESCE(sum(g.team1_score), (0)::bigint) AS g_team1_maps,
            COALESCE(sum(g.team2_score), (0)::bigint) AS g_team2_maps
           FROM (public.matches m
             LEFT JOIN public.games g ON ((g.match_id = m.id)))
          WHERE (m.status = 'finished'::text)
          GROUP BY m.id
        ), per_team AS (
         SELECT match_maps.tournament_id,
            match_maps.team1_id AS team_id,
            match_maps.completed_at,
            match_maps.winner_team_id,
            match_maps.team1_score,
            match_maps.team2_score,
            match_maps.g_team1_maps AS maps_for,
            match_maps.g_team2_maps AS maps_against
           FROM match_maps
        UNION ALL
         SELECT match_maps.tournament_id,
            match_maps.team2_id AS team_id,
            match_maps.completed_at,
            match_maps.winner_team_id,
            match_maps.team2_score AS team1_score,
            match_maps.team1_score AS team2_score,
            match_maps.g_team2_maps AS maps_for,
            match_maps.g_team1_maps AS maps_against
           FROM match_maps
        ), agg AS (
         SELECT pt.team_id,
            pt.tournament_id,
            count(*) AS matches_played,
            sum(
                CASE
                    WHEN (pt.winner_team_id = pt.team_id) THEN 1
                    ELSE 0
                END) AS wins,
            sum(
                CASE
                    WHEN ((pt.winner_team_id IS NULL) AND (pt.team1_score = pt.team2_score)) THEN 1
                    ELSE 0
                END) AS draws,
            sum(
                CASE
                    WHEN ((pt.winner_team_id IS NOT NULL) AND (pt.winner_team_id <> pt.team_id)) THEN 1
                    ELSE 0
                END) AS losses,
            sum(pt.maps_for) AS maps_won,
            sum(pt.maps_against) AS maps_lost,
            max(pt.completed_at) AS last_match_at
           FROM per_team pt
          GROUP BY pt.team_id, pt.tournament_id
        )
 SELECT a.team_id,
    t.name AS team_name,
    t.short_name AS team_short_name,
    t.logo_url AS team_logo_url,
    a.tournament_id,
    tour.name AS tournament_name,
    tour.slug AS tournament_slug,
    a.matches_played,
    a.wins,
    a.losses,
    a.draws,
    a.maps_won,
    a.maps_lost,
    0 AS map_ties,
        CASE
            WHEN (a.matches_played > 0) THEN ((a.wins)::double precision / (a.matches_played)::double precision)
            ELSE NULL::double precision
        END AS winrate,
        CASE
            WHEN ((a.maps_won + a.maps_lost) > (0)::numeric) THEN ((a.maps_won)::double precision / (NULLIF((a.maps_won + a.maps_lost), (0)::numeric))::double precision)
            ELSE NULL::double precision
        END AS map_winrate,
    ((a.wins * 3) + a.draws) AS points,
    a.last_match_at
   FROM ((agg a
     LEFT JOIN public.teams t ON ((t.id = a.team_id)))
     LEFT JOIN public.tournaments tour ON ((tour.id = a.tournament_id)));

-- ---------------------------------------------------------------- CLÉS ÉTRANGÈRES
ALTER TABLE ONLY public.adherent_payments ADD CONSTRAINT adherent_payments_adherent_id_fkey FOREIGN KEY (adherent_id) REFERENCES public.adherents(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.adherents ADD CONSTRAINT adherents_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.admin_idempotency ADD CONSTRAINT admin_idempotency_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.blacklist_alerts ADD CONSTRAINT blacklist_alerts_blacklist_entry_id_fkey FOREIGN KEY (blacklist_entry_id) REFERENCES public.player_blacklist(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bot_event_outbox ADD CONSTRAINT bot_event_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.bot_idempotency ADD CONSTRAINT bot_idempotency_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.bot_locks ADD CONSTRAINT bot_locks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.bot_player_actions ADD CONSTRAINT bot_player_actions_actor_auth_user_id_fkey FOREIGN KEY (actor_auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bot_player_actions ADD CONSTRAINT bot_player_actions_target_auth_user_id_fkey FOREIGN KEY (target_auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bot_player_actions ADD CONSTRAINT bot_player_actions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.bracket_snapshots ADD CONSTRAINT bracket_snapshots_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.tournament_stages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bracket_snapshots ADD CONSTRAINT bracket_snapshots_taken_by_staff_id_fkey FOREIGN KEY (taken_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bracket_snapshots ADD CONSTRAINT bracket_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.broadcast_schedules ADD CONSTRAINT broadcast_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT cast_assignments_cast_member_id_fkey FOREIGN KEY (cast_member_id) REFERENCES public.cast_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT cast_assignments_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT cast_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.cast_assignments ADD CONSTRAINT fk_cast_assignments_scrim FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cast_members ADD CONSTRAINT cast_members_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cast_members ADD CONSTRAINT cast_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.caster_presence ADD CONSTRAINT caster_presence_cast_member_id_fkey FOREIGN KEY (cast_member_id) REFERENCES public.cast_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.caster_presence ADD CONSTRAINT caster_presence_event_run_id_fkey FOREIGN KEY (event_run_id) REFERENCES public.event_runs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.caster_presence ADD CONSTRAINT caster_presence_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.circuit_partner_applications ADD CONSTRAINT circuit_partner_applications_granted_tenant_id_fkey FOREIGN KEY (granted_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.custom_game_presets ADD CONSTRAINT custom_game_presets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_processed_by_staff_id_fkey FOREIGN KEY (processed_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.demandes ADD CONSTRAINT demandes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.discord_guild_presence ADD CONSTRAINT discord_guild_presence_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.discord_guilds ADD CONSTRAINT discord_guilds_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.discord_webhooks ADD CONSTRAINT discord_webhooks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.discord_webhooks ADD CONSTRAINT discord_webhooks_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_campaigns ADD CONSTRAINT email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.email_deliveries ADD CONSTRAINT email_deliveries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.email_deliveries ADD CONSTRAINT email_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entity_blacklist ADD CONSTRAINT entity_blacklist_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_cue_acks ADD CONSTRAINT event_cue_acks_cast_member_id_fkey FOREIGN KEY (cast_member_id) REFERENCES public.cast_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_cue_acks ADD CONSTRAINT event_cue_acks_cue_id_fkey FOREIGN KEY (cue_id) REFERENCES public.event_cues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_cue_acks ADD CONSTRAINT event_cue_acks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_cues ADD CONSTRAINT event_cues_event_run_id_fkey FOREIGN KEY (event_run_id) REFERENCES public.event_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_cues ADD CONSTRAINT event_cues_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_runs ADD CONSTRAINT event_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_event_run_id_fkey FOREIGN KEY (event_run_id) REFERENCES public.event_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.event_stations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_segments ADD CONSTRAINT event_segments_wave_id_fkey FOREIGN KEY (wave_id) REFERENCES public.event_waves(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_stations ADD CONSTRAINT event_stations_event_run_id_fkey FOREIGN KEY (event_run_id) REFERENCES public.event_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_stations ADD CONSTRAINT event_stations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_waves ADD CONSTRAINT event_waves_event_run_id_fkey FOREIGN KEY (event_run_id) REFERENCES public.event_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_waves ADD CONSTRAINT event_waves_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT fk_final_rankings_staff FOREIGN KEY (frozen_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT fk_final_rankings_team FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT fk_final_rankings_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.final_rankings ADD CONSTRAINT fk_final_rankings_tournament FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.free_players ADD CONSTRAINT free_players_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.free_players ADD CONSTRAINT free_players_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.games ADD CONSTRAINT games_match_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.games ADD CONSTRAINT games_picked_by_team_id_fkey FOREIGN KEY (picked_by_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.games ADD CONSTRAINT games_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.games ADD CONSTRAINT games_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.helloasso_donations ADD CONSTRAINT helloasso_donations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.integration_secrets ADD CONSTRAINT integration_secrets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.integration_secrets ADD CONSTRAINT integration_secrets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.league_scrims ADD CONSTRAINT league_scrims_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.league_scrims ADD CONSTRAINT league_scrims_scrim_id_fkey FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.league_scrims ADD CONSTRAINT league_scrims_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.league_standings ADD CONSTRAINT league_standings_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.league_standings ADD CONSTRAINT league_standings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.league_standings ADD CONSTRAINT league_standings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.league_tournaments ADD CONSTRAINT league_tournaments_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.league_tournaments ADD CONSTRAINT league_tournaments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.league_tournaments ADD CONSTRAINT league_tournaments_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.lobbies ADD CONSTRAINT lobbies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.lobby_placements ADD CONSTRAINT lobby_placements_lobby_id_fkey FOREIGN KEY (lobby_id) REFERENCES public.lobbies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lobby_placements ADD CONSTRAINT lobby_placements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.match_drafts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_draft_steps ADD CONSTRAINT match_draft_steps_hero_id_fkey FOREIGN KEY (hero_id) REFERENCES public.game_heroes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_drafts ADD CONSTRAINT match_drafts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_evidence ADD CONSTRAINT match_evidence_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_evidence ADD CONSTRAINT match_evidence_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT match_lineups_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT match_lineups_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT match_lineups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_lineups ADD CONSTRAINT match_lineups_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_map_vetos ADD CONSTRAINT match_map_vetos_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_map_vetos ADD CONSTRAINT match_map_vetos_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_map_vetos ADD CONSTRAINT match_map_vetos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_winner_imported_by_fkey FOREIGN KEY (winner_imported_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_mvp_polls ADD CONSTRAINT match_mvp_polls_winner_member_id_fkey FOREIGN KEY (winner_member_id) REFERENCES public.team_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_mvp_votes ADD CONSTRAINT match_mvp_votes_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_mvp_votes ADD CONSTRAINT match_mvp_votes_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_mvp_votes ADD CONSTRAINT match_mvp_votes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_participants ADD CONSTRAINT match_participants_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_participants ADD CONSTRAINT match_participants_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_participants ADD CONSTRAINT match_participants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_participants ADD CONSTRAINT match_participants_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_prediction_settings ADD CONSTRAINT match_prediction_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_predictions ADD CONSTRAINT match_predictions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_predictions ADD CONSTRAINT match_predictions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_public_mvp_polls ADD CONSTRAINT match_public_mvp_polls_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_public_mvp_polls ADD CONSTRAINT match_public_mvp_polls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_public_mvp_polls ADD CONSTRAINT match_public_mvp_polls_winner_member_id_fkey FOREIGN KEY (winner_member_id) REFERENCES public.team_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.match_public_mvp_votes ADD CONSTRAINT match_public_mvp_votes_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_public_mvp_votes ADD CONSTRAINT match_public_mvp_votes_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_public_mvp_votes ADD CONSTRAINT match_public_mvp_votes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_score_reports ADD CONSTRAINT match_score_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_forfeit_team_id_fkey FOREIGN KEY (forfeit_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_next_lose_fk FOREIGN KEY (next_match_lose_id) REFERENCES public.matches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_next_win_fk FOREIGN KEY (next_match_win_id) REFERENCES public.matches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_parent_lose_fk FOREIGN KEY (parent_match_lose_id) REFERENCES public.matches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_parent_win_fk FOREIGN KEY (parent_match_win_id) REFERENCES public.matches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_scrim_id_fkey FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_stage_fk FOREIGN KEY (stage_id) REFERENCES public.tournament_stages(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_team1_fk FOREIGN KEY (team1_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_team2_fk FOREIGN KEY (team2_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_tournament_fk FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_winner_fk FOREIGN KEY (winner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.news ADD CONSTRAINT news_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.news ADD CONSTRAINT news_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.news ADD CONSTRAINT news_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.news_comments ADD CONSTRAINT news_comments_news_id_fkey FOREIGN KEY (news_id) REFERENCES public.news(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.news_comments ADD CONSTRAINT news_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.notification_prefs ADD CONSTRAINT notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.overlay_heartbeats ADD CONSTRAINT overlay_heartbeats_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.plan_cgv_acceptances ADD CONSTRAINT plan_cgv_acceptances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_action_snoozes ADD CONSTRAINT player_action_snoozes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.player_blacklist ADD CONSTRAINT player_blacklist_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.player_discovery_profiles ADD CONSTRAINT player_discovery_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_follows ADD CONSTRAINT player_follows_followee_id_fkey FOREIGN KEY (followee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_follows ADD CONSTRAINT player_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_hero_preferences ADD CONSTRAINT player_hero_preferences_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_rating_history ADD CONSTRAINT player_rating_history_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_rating_history ADD CONSTRAINT player_rating_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.player_rating_history ADD CONSTRAINT player_rating_history_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.player_ratings ADD CONSTRAINT player_ratings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.prize_pool_checkouts ADD CONSTRAINT prize_pool_checkouts_prize_pool_id_fkey FOREIGN KEY (prize_pool_id) REFERENCES public.tournament_prize_pools(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.prize_pool_checkouts ADD CONSTRAINT prize_pool_checkouts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.prize_pool_contributions ADD CONSTRAINT prize_pool_contributions_prize_pool_id_fkey FOREIGN KEY (prize_pool_id) REFERENCES public.tournament_prize_pools(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.prize_pool_contributions ADD CONSTRAINT prize_pool_contributions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scrim_planning_availabilities ADD CONSTRAINT scrim_planning_availabilities_planning_id_fkey FOREIGN KEY (planning_id) REFERENCES public.scrim_plannings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scrim_planning_availabilities ADD CONSTRAINT scrim_planning_availabilities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_scrim_id_fkey FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_source_demande_id_fkey FOREIGN KEY (source_demande_id) REFERENCES public.demandes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_team1_id_fkey FOREIGN KEY (team1_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_team2_id_fkey FOREIGN KEY (team2_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scrim_plannings ADD CONSTRAINT scrim_plannings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.scrim_score_reports ADD CONSTRAINT scrim_score_reports_scrim_id_fkey FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scrim_score_reports ADD CONSTRAINT scrim_score_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scrim_searches ADD CONSTRAINT scrim_searches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_source_demande_id_fkey FOREIGN KEY (source_demande_id) REFERENCES public.demandes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_source_planning_id_fkey FOREIGN KEY (source_planning_id) REFERENCES public.scrim_plannings(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_team1_id_fkey FOREIGN KEY (team1_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_team2_id_fkey FOREIGN KEY (team2_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.scrims ADD CONSTRAINT scrims_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.site_settings ADD CONSTRAINT site_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.social_accounts ADD CONSTRAINT social_accounts_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.social_accounts ADD CONSTRAINT social_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.social_feed_items ADD CONSTRAINT social_feed_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.social_post_targets ADD CONSTRAINT social_post_targets_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.social_posts ADD CONSTRAINT social_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.social_posts ADD CONSTRAINT social_posts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.staff ADD CONSTRAINT staff_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.staff_logs ADD CONSTRAINT fk_staff_logs_staff FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.staff_logs ADD CONSTRAINT fk_staff_logs_tournament FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.staff_logs ADD CONSTRAINT staff_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.stage_teams ADD CONSTRAINT stage_teams_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.tournament_stages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stage_teams ADD CONSTRAINT stage_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stage_teams ADD CONSTRAINT stage_teams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT stage_tiebreaker_overrides_loser_team_id_fkey FOREIGN KEY (loser_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT stage_tiebreaker_overrides_set_by_staff_id_fkey FOREIGN KEY (set_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT stage_tiebreaker_overrides_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.tournament_stages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT stage_tiebreaker_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.stage_tiebreaker_overrides ADD CONSTRAINT stage_tiebreaker_overrides_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stream_alert_events ADD CONSTRAINT stream_alert_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stream_alert_rules ADD CONSTRAINT stream_alert_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stream_alert_settings ADD CONSTRAINT stream_alert_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_converted_entity_blacklist_id_fkey FOREIGN KEY (converted_entity_blacklist_id) REFERENCES public.entity_blacklist(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_converted_player_blacklist_id_fkey FOREIGN KEY (converted_player_blacklist_id) REFERENCES public.player_blacklist(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.task_boards ADD CONSTRAINT task_boards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.task_boards ADD CONSTRAINT task_boards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_checklist_items ADD CONSTRAINT task_checklist_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_checklist_items ADD CONSTRAINT task_checklist_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_columns ADD CONSTRAINT task_columns_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.task_boards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_columns ADD CONSTRAINT task_columns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_comments ADD CONSTRAINT task_comments_author_staff_id_fkey FOREIGN KEY (author_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.task_comments ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_comments ADD CONSTRAINT task_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_labels ADD CONSTRAINT task_labels_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.task_boards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_labels ADD CONSTRAINT task_labels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_assignee_staff_id_fkey FOREIGN KEY (assignee_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.task_boards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.task_columns(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tcg_fanart_cards ADD CONSTRAINT tcg_fanart_cards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_card_fanart_id_fkey FOREIGN KEY (card_fanart_id) REFERENCES public.tcg_fanart_cards(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_card_team_id_fkey FOREIGN KEY (card_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tcg_pack_cards ADD CONSTRAINT tcg_pack_cards_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES public.tcg_packs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_guaranteed_fanart_id_fkey FOREIGN KEY (guaranteed_fanart_id) REFERENCES public.tcg_fanart_cards(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_source_match_id_fkey FOREIGN KEY (source_match_id) REFERENCES public.matches(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_packs ADD CONSTRAINT tcg_packs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_player_cards ADD CONSTRAINT tcg_player_cards_photo_reviewed_by_fkey FOREIGN KEY (photo_reviewed_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tcg_player_cards ADD CONSTRAINT tcg_player_cards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_showcases ADD CONSTRAINT tcg_showcases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_trade_blocks ADD CONSTRAINT tcg_trade_blocks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tcg_trade_items ADD CONSTRAINT tcg_trade_items_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.tcg_trades(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tcg_trade_settings ADD CONSTRAINT tcg_trade_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_proposer_pack_id_fkey FOREIGN KEY (proposer_pack_id) REFERENCES public.tcg_packs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_recipient_pack_id_fkey FOREIGN KEY (recipient_pack_id) REFERENCES public.tcg_packs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tcg_trades ADD CONSTRAINT tcg_trades_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_wallet_entries ADD CONSTRAINT tcg_wallet_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tcg_wallets ADD CONSTRAINT tcg_wallets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_audit_logs ADD CONSTRAINT team_audit_logs_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_audit_logs ADD CONSTRAINT team_audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_availability ADD CONSTRAINT team_availability_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_availability ADD CONSTRAINT team_availability_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_constraints_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_constraints_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_constraints_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_availability_constraints ADD CONSTRAINT team_availability_constraints_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_discord_channels ADD CONSTRAINT team_discord_channels_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_discord_channels ADD CONSTRAINT team_discord_channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_invite_links ADD CONSTRAINT team_invite_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_team_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_openings ADD CONSTRAINT team_openings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.team_openings ADD CONSTRAINT team_openings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_opponent_team_id_fkey FOREIGN KEY (opponent_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_reviews ADD CONSTRAINT team_reviews_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_captain_fk FOREIGN KEY (captain_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tenant_api_tokens ADD CONSTRAINT tenant_api_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_discord_config ADD CONSTRAINT tenant_discord_config_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.discord_guilds(guild_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_invitations ADD CONSTRAINT tenant_invitations_accepted_staff_id_fkey FOREIGN KEY (accepted_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tenant_invitations ADD CONSTRAINT tenant_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tenant_invitations ADD CONSTRAINT tenant_invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_map_pool ADD CONSTRAINT tenant_map_pool_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_plan_checkouts ADD CONSTRAINT tenant_plan_checkouts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_plan_payments ADD CONSTRAINT tenant_plan_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_requests ADD CONSTRAINT tenant_requests_created_tenant_id_fkey FOREIGN KEY (created_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tenant_secrets ADD CONSTRAINT tenant_secrets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_staff ADD CONSTRAINT tenant_staff_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_staff ADD CONSTRAINT tenant_staff_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_lifecycle_changed_by_fkey FOREIGN KEY (lifecycle_changed_by) REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tournament_maps ADD CONSTRAINT tournament_maps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tournament_maps ADD CONSTRAINT tournament_maps_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_origin_team_id_fkey FOREIGN KEY (origin_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_placed_team_id_fkey FOREIGN KEY (placed_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tournament_pool_entries ADD CONSTRAINT tournament_pool_entries_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tournament_prize_pools ADD CONSTRAINT tournament_prize_pools_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tournament_stages ADD CONSTRAINT stages_tournament_fk FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tournament_stages ADD CONSTRAINT tournament_stages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tournament_teams ADD CONSTRAINT tournament_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tournament_teams ADD CONSTRAINT tournament_teams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.tournament_teams ADD CONSTRAINT tournament_teams_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tournaments ADD CONSTRAINT tournaments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.twitch_broadcaster_connections ADD CONSTRAINT twitch_broadcaster_connections_tcg_featured_fanart_id_fkey FOREIGN KEY (tcg_featured_fanart_id) REFERENCES public.tcg_fanart_cards(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.twitch_broadcaster_connections ADD CONSTRAINT twitch_broadcaster_connections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.twitch_channels ADD CONSTRAINT twitch_channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.user_battlenet_links ADD CONSTRAINT user_battlenet_links_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_discord_links ADD CONSTRAINT user_discord_links_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_twitch_links ADD CONSTRAINT user_twitch_links_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.web_push_deliveries ADD CONSTRAINT web_push_deliveries_outbox_event_id_fkey FOREIGN KEY (outbox_event_id) REFERENCES public.bot_event_outbox(event_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.web_push_deliveries ADD CONSTRAINT web_push_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.push_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_subscription_fkey FOREIGN KEY (subscription_id) REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.webhook_subscriptions ADD CONSTRAINT webhook_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------- TRIGGERS
CREATE TRIGGER adherents_generate_member_number BEFORE INSERT ON public.adherents FOR EACH ROW EXECUTE FUNCTION public.generate_member_number();
CREATE TRIGGER adherents_updated_at BEFORE UPDATE ON public.adherents FOR EACH ROW EXECUTE FUNCTION public.update_adherents_updated_at();
CREATE TRIGGER announcements_update_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER association_pole_members_updated_at BEFORE UPDATE ON public.association_pole_members FOR EACH ROW EXECUTE FUNCTION public.update_association_pole_members_updated_at();
CREATE TRIGGER trigger_blizzard_media_updated_at BEFORE UPDATE ON public.blizzard_media FOR EACH ROW EXECUTE FUNCTION public.update_blizzard_media_updated_at();
CREATE TRIGGER trigger_blizzard_news_updated_at BEFORE UPDATE ON public.blizzard_news FOR EACH ROW EXECUTE FUNCTION public.update_blizzard_news_updated_at();
CREATE TRIGGER cast_members_enforce_staff_caster BEFORE INSERT OR UPDATE OF auth_user_id ON public.cast_members FOR EACH ROW EXECUTE FUNCTION public.enforce_cast_member_is_staff_caster();
CREATE TRIGGER cast_members_updated_at BEFORE UPDATE ON public.cast_members FOR EACH ROW EXECUTE FUNCTION public.update_cast_members_updated_at();
CREATE TRIGGER trg_caster_presence_updated_at BEFORE UPDATE ON public.caster_presence FOR EACH ROW EXECUTE FUNCTION public.caster_presence_set_updated_at();
CREATE TRIGGER trg_caster_scenes_updated_at BEFORE UPDATE ON public.caster_scenes FOR EACH ROW EXECUTE FUNCTION public.handle_caster_scenes_updated_at();
CREATE TRIGGER caster_themes_updated_at BEFORE UPDATE ON public.caster_themes FOR EACH ROW EXECUTE FUNCTION public.handle_caster_themes_updated_at();
CREATE TRIGGER demandes_updated_at BEFORE UPDATE ON public.demandes FOR EACH ROW EXECUTE FUNCTION public.update_demandes_updated_at();
CREATE TRIGGER trg_entity_blacklist_updated_at BEFORE UPDATE ON public.entity_blacklist FOR EACH ROW EXECUTE FUNCTION public.entity_blacklist_set_updated_at();
CREATE TRIGGER trg_event_runs_updated_at BEFORE UPDATE ON public.event_runs FOR EACH ROW EXECUTE FUNCTION public.event_runs_set_updated_at();
CREATE TRIGGER trg_event_segments_updated_at BEFORE UPDATE ON public.event_segments FOR EACH ROW EXECUTE FUNCTION public.event_segments_set_updated_at();
CREATE TRIGGER trg_event_stations_updated_at BEFORE UPDATE ON public.event_stations FOR EACH ROW EXECUTE FUNCTION public.event_stations_set_updated_at();
CREATE TRIGGER trg_event_waves_updated_at BEFORE UPDATE ON public.event_waves FOR EACH ROW EXECUTE FUNCTION public.event_waves_set_updated_at();
CREATE TRIGGER trg_final_rankings_updated_at BEFORE UPDATE ON public.final_rankings FOR EACH ROW EXECUTE FUNCTION public.final_rankings_touch_updated_at();
CREATE TRIGGER trg_free_players_updated_at BEFORE UPDATE ON public.free_players FOR EACH ROW EXECUTE FUNCTION public.update_free_players_updated_at();
CREATE TRIGGER trg_league_standings_updated_at BEFORE UPDATE ON public.league_standings FOR EACH ROW EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();
CREATE TRIGGER trg_leagues_updated_at BEFORE UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();
CREATE TRIGGER trg_match_drafts_touch BEFORE UPDATE ON public.match_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_match_drafts_updated_at();
CREATE TRIGGER match_predictions_guard BEFORE INSERT OR UPDATE ON public.match_predictions FOR EACH ROW EXECUTE FUNCTION public.match_predictions_guard();
CREATE TRIGGER trg_match_score_reports_updated_at BEFORE UPDATE ON public.match_score_reports FOR EACH ROW EXECUTE FUNCTION public.match_score_reports_set_updated_at();
CREATE TRIGGER news_update_updated_at BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_partners_updated_at();
CREATE TRIGGER partnership_requests_updated_at BEFORE UPDATE ON public.partnership_requests FOR EACH ROW EXECUTE FUNCTION public.update_partnership_requests_updated_at();
CREATE TRIGGER trigger_patch_notes_updated_at BEFORE UPDATE ON public.patch_notes FOR EACH ROW EXECUTE FUNCTION public.update_patch_notes_updated_at();
CREATE TRIGGER trg_player_action_snoozes_updated_at BEFORE UPDATE ON public.player_action_snoozes FOR EACH ROW EXECUTE FUNCTION public.player_action_snoozes_set_updated_at();
CREATE TRIGGER trg_player_blacklist_updated_at BEFORE UPDATE ON public.player_blacklist FOR EACH ROW EXECUTE FUNCTION public.player_blacklist_set_updated_at();
CREATE TRIGGER trg_player_ratings_updated_at BEFORE UPDATE ON public.player_ratings FOR EACH ROW EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();
CREATE TRIGGER trg_scrim_planning_avail_updated_at BEFORE UPDATE ON public.scrim_planning_availabilities FOR EACH ROW EXECUTE FUNCTION public.scrim_plannings_set_updated_at();
CREATE TRIGGER trg_scrim_plannings_updated_at BEFORE UPDATE ON public.scrim_plannings FOR EACH ROW EXECUTE FUNCTION public.scrim_plannings_set_updated_at();
CREATE TRIGGER trg_scrim_score_reports_updated_at BEFORE UPDATE ON public.scrim_score_reports FOR EACH ROW EXECUTE FUNCTION public.scrim_score_reports_set_updated_at();
CREATE TRIGGER trg_scrim_searches_updated_at BEFORE UPDATE ON public.scrim_searches FOR EACH ROW EXECUTE FUNCTION public.scrim_searches_set_updated_at();
CREATE TRIGGER trg_scrims_updated_at BEFORE UPDATE ON public.scrims FOR EACH ROW EXECUTE FUNCTION public.scrims_set_updated_at();
CREATE TRIGGER site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_site_settings_updated_at();
CREATE TRIGGER staff_sync_cast_members AFTER DELETE OR UPDATE OF role ON public.staff FOR EACH ROW EXECUTE FUNCTION public.sync_cast_members_on_staff_change();
CREATE TRIGGER trg_team_availability_updated_at BEFORE UPDATE ON public.team_availability FOR EACH ROW EXECUTE FUNCTION public.team_availability_set_updated_at();
CREATE TRIGGER team_members_clear_supporter_role AFTER INSERT ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.clear_supporter_role_on_roster_join();
CREATE TRIGGER team_members_enforce_max_players BEFORE INSERT OR UPDATE OF role ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.enforce_team_max_players();
CREATE TRIGGER team_members_sync_battletag_verification BEFORE INSERT OR UPDATE OF battle_tag, user_id ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_battletag_verification();
CREATE TRIGGER trg_team_openings_updated_at BEFORE UPDATE ON public.team_openings FOR EACH ROW EXECUTE FUNCTION public.update_team_openings_updated_at();
CREATE TRIGGER trg_team_ratings_updated_at BEFORE UPDATE ON public.team_ratings FOR EACH ROW EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();
CREATE TRIGGER trg_team_reviews_updated_at BEFORE UPDATE ON public.team_reviews FOR EACH ROW EXECUTE FUNCTION public.team_reviews_set_updated_at();
CREATE TRIGGER teams_set_slug_trigger BEFORE INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.teams_set_slug();
CREATE TRIGGER trg_tenant_discord_config_updated_at BEFORE UPDATE ON public.tenant_discord_config FOR EACH ROW EXECUTE FUNCTION public.tenant_discord_config_set_updated_at();
CREATE TRIGGER trg_tenant_map_pool_updated_at BEFORE UPDATE ON public.tenant_map_pool FOR EACH ROW EXECUTE FUNCTION public.update_tenant_map_pool_updated_at();
CREATE TRIGGER trg_tenant_requests_updated_at BEFORE UPDATE ON public.tenant_requests FOR EACH ROW EXECUTE FUNCTION public.update_tenant_requests_updated_at();
CREATE TRIGGER trg_sync_tenant_lifecycle BEFORE INSERT OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_lifecycle();
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_tenants_updated_at();
CREATE TRIGGER trg_twitch_broadcaster_conn_updated_at BEFORE UPDATE ON public.twitch_broadcaster_connections FOR EACH ROW EXECUTE FUNCTION public.twitch_broadcaster_connections_set_updated_at();
CREATE TRIGGER trigger_twitch_channels_updated_at BEFORE UPDATE ON public.twitch_channels FOR EACH ROW EXECUTE FUNCTION public.update_twitch_channels_updated_at();
CREATE TRIGGER trg_web_push_deliveries_updated_at BEFORE UPDATE ON public.web_push_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_web_push_deliveries_updated_at();

-- ---------------------------------------------------------------- RLS
ALTER TABLE public.adherent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.association_pole_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blizzard_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blizzard_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_player_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_email_optouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captcha_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cast_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cast_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caster_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caster_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caster_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_partner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_game_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_event_ack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_guild_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cue_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.final_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helloasso_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_scrims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_draft_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_map_vetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_mvp_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_mvp_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_prediction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_public_mvp_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_public_mvp_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_score_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overlay_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_guild_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_cgv_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_action_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_discovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_hero_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_rating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_pool_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_pool_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrim_planning_availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrim_plannings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrim_score_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrim_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_tiebreaker_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_fanart_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_overlay_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_overlay_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_pack_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_photo_purges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_player_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_showcases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_trade_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_trade_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_trade_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_wallet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_availability_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_discord_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invite_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_discord_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_map_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_plan_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_plan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_pool_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_prize_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitch_broadcaster_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitch_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_battlenet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_discord_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_twitch_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- POLICIES
CREATE POLICY "Public can read blizzard media" ON public.blizzard_media AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Service role full access to blizzard media" ON public.blizzard_media AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public can read blizzard news" ON public.blizzard_news AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Service role full access to blizzard news" ON public.blizzard_news AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY captcha_challenges_service_role ON public.captcha_challenges AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY cast_members_anon_read_active ON public.cast_members AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((is_active = true));
CREATE POLICY caster_presence_caster_select ON public.caster_presence AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT cm.tenant_id
   FROM public.cast_members cm
  WHERE ((cm.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cm.is_active = true)))));
CREATE POLICY caster_scenes_delete ON public.caster_scenes AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.auth_user_id = ( SELECT auth.uid() AS uid)) AND (staff.is_active = true)))));
CREATE POLICY caster_scenes_insert ON public.caster_scenes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.auth_user_id = ( SELECT auth.uid() AS uid)) AND (staff.is_active = true)))));
CREATE POLICY caster_scenes_select ON public.caster_scenes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY caster_scenes_select_public ON public.caster_scenes AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY caster_scenes_update ON public.caster_scenes AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.auth_user_id = ( SELECT auth.uid() AS uid)) AND (staff.is_active = true)))));
CREATE POLICY caster_themes_delete ON public.caster_themes AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.auth_user_id = ( SELECT auth.uid() AS uid)) AND (staff.is_active = true)))));
CREATE POLICY caster_themes_insert ON public.caster_themes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.auth_user_id = ( SELECT auth.uid() AS uid)) AND (staff.is_active = true)))));
CREATE POLICY caster_themes_select_public ON public.caster_themes AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY caster_themes_update ON public.caster_themes AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.auth_user_id = ( SELECT auth.uid() AS uid)) AND (staff.is_active = true)))));
CREATE POLICY circuit_partner_applications_service_role ON public.circuit_partner_applications AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY custom_game_presets_service_role ON public.custom_game_presets AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can create demandes" ON public.demandes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own demandes" ON public.demandes AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY event_cue_acks_caster_select ON public.event_cue_acks AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT cm.tenant_id
   FROM public.cast_members cm
  WHERE ((cm.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cm.is_active = true)))));
CREATE POLICY event_cues_caster_select ON public.event_cues AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT cm.tenant_id
   FROM public.cast_members cm
  WHERE ((cm.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cm.is_active = true)))));
CREATE POLICY event_runs_anon_read_live ON public.event_runs AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((status = 'live'::text));
CREATE POLICY event_segments_caster_select ON public.event_segments AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT cm.tenant_id
   FROM public.cast_members cm
  WHERE ((cm.auth_user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active))));
CREATE POLICY event_stations_caster_select ON public.event_stations AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT cm.tenant_id
   FROM public.cast_members cm
  WHERE ((cm.auth_user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active))));
CREATE POLICY event_waves_caster_select ON public.event_waves AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT cm.tenant_id
   FROM public.cast_members cm
  WHERE ((cm.auth_user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active))));
CREATE POLICY final_rankings_read_public ON public.final_rankings AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY final_rankings_write_service_role ON public.final_rankings AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY game_heroes_select_all ON public.game_heroes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY games_select_public ON public.games AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (public.matches m
     JOIN public.tournaments t ON ((t.id = m.tournament_id)))
  WHERE ((m.id = games.match_id) AND (t.visibility = 'public'::text)))));
CREATE POLICY integration_secrets_deny_all ON public.integration_secrets AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY league_scrims_read ON public.league_scrims AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY lobbies_write_service_role ON public.lobbies AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY lobby_placements_write_service_role ON public.lobby_placements AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY match_draft_steps_select_public ON public.match_draft_steps AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY match_drafts_select_public ON public.match_drafts AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY match_prediction_settings_service_role ON public.match_prediction_settings AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY match_predictions_service_role ON public.match_predictions AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY matches_select_public ON public.matches AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = matches.tournament_id) AND (t.visibility = 'public'::text)))));
CREATE POLICY notification_prefs_delete_own ON public.notification_prefs AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_prefs_insert_own ON public.notification_prefs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_prefs_select_own ON public.notification_prefs AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_prefs_update_own ON public.notification_prefs AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY overlay_heartbeats_service_role ON public.overlay_heartbeats AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY partners_select_public ON public.partners AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY patch_notes_select_policy ON public.patch_notes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY scrims_anon_read_public ON public.scrims AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((is_public = true));
CREATE POLICY site_settings_select_public ON public.site_settings AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY social_feed_items_select_public ON public.social_feed_items AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY staff_select_own ON public.staff AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY stage_teams_select_all ON public.stage_teams AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY tcg_fanart_cards_service_role ON public.tcg_fanart_cards AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_pack_cards_service_role ON public.tcg_pack_cards AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_packs_service_role ON public.tcg_packs AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_player_cards_service_role ON public.tcg_player_cards AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_showcases_service_role ON public.tcg_showcases AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_trade_blocks_service_role ON public.tcg_trade_blocks AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_trade_items_service_role ON public.tcg_trade_items AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_trade_settings_service_role ON public.tcg_trade_settings AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_trades_service_role ON public.tcg_trades AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_wallet_entries_service_role ON public.tcg_wallet_entries AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tcg_wallets_service_role ON public.tcg_wallets AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY team_members_select_public ON public.team_members AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY teams_delete_captain ON public.teams AS PERMISSIVE FOR DELETE TO public USING ((captain_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY teams_insert_authenticated ON public.teams AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY teams_select_public ON public.teams AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY teams_update_captain ON public.teams AS PERMISSIVE FOR UPDATE TO public USING ((captain_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((captain_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY tenants_select_public ON public.tenants AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((is_active = true));
CREATE POLICY tournament_pool_entries_service_role ON public.tournament_pool_entries AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY stages_select_public ON public.tournament_stages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_stages.tournament_id) AND (t.visibility = 'public'::text)))));
CREATE POLICY "Public can view tournament teams" ON public.tournament_teams AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY tournaments_select_public ON public.tournaments AS PERMISSIVE FOR SELECT TO public USING ((visibility = 'public'::text));

-- ---------------------------------------------------------------- DROITS
REVOKE ALL ON TABLE public.adherent_payments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherent_payments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherent_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherent_payments TO service_role;
REVOKE ALL ON TABLE public.adherents FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherents TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherents TO service_role;
REVOKE ALL ON TABLE public.admin_idempotency FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_idempotency TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_idempotency TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_idempotency TO service_role;
REVOKE ALL ON SEQUENCE public.admin_idempotency_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.admin_idempotency_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.admin_idempotency_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.admin_idempotency_id_seq TO service_role;
REVOKE ALL ON TABLE public.announcements FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO service_role;
REVOKE ALL ON TABLE public.api_usage_counters FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_usage_counters TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_usage_counters TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_usage_counters TO service_role;
REVOKE ALL ON TABLE public.association_pole_members FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.association_pole_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.association_pole_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.association_pole_members TO service_role;
REVOKE ALL ON TABLE public.blacklist_alerts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blacklist_alerts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blacklist_alerts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blacklist_alerts TO service_role;
REVOKE ALL ON TABLE public.blizzard_media FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blizzard_media TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blizzard_media TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blizzard_media TO service_role;
REVOKE ALL ON TABLE public.blizzard_news FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blizzard_news TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blizzard_news TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.blizzard_news TO service_role;
REVOKE ALL ON TABLE public.bot_event_outbox FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_event_outbox TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_event_outbox TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_event_outbox TO service_role;
REVOKE ALL ON SEQUENCE public.bot_event_outbox_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_event_outbox_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_event_outbox_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_event_outbox_id_seq TO service_role;
REVOKE ALL ON TABLE public.bot_idempotency FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_idempotency TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_idempotency TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_idempotency TO service_role;
REVOKE ALL ON SEQUENCE public.bot_idempotency_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_idempotency_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_idempotency_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_idempotency_id_seq TO service_role;
REVOKE ALL ON TABLE public.bot_locks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_locks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_locks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_locks TO service_role;
REVOKE ALL ON TABLE public.bot_player_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_player_actions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_player_actions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bot_player_actions TO service_role;
REVOKE ALL ON SEQUENCE public.bot_player_actions_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_player_actions_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_player_actions_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bot_player_actions_id_seq TO service_role;
REVOKE ALL ON TABLE public.bracket_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bracket_snapshots TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bracket_snapshots TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bracket_snapshots TO service_role;
REVOKE ALL ON SEQUENCE public.bracket_snapshots_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bracket_snapshots_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bracket_snapshots_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.bracket_snapshots_id_seq TO service_role;
REVOKE ALL ON TABLE public.broadcast_email_optouts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_email_optouts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_email_optouts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_email_optouts TO service_role;
REVOKE ALL ON TABLE public.broadcast_recipients FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_recipients TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_recipients TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_recipients TO service_role;
REVOKE ALL ON TABLE public.broadcast_schedules FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_schedules TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_schedules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.broadcast_schedules TO service_role;
REVOKE ALL ON TABLE public.captcha_challenges FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.captcha_challenges TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.captcha_challenges TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.captcha_challenges TO service_role;
REVOKE ALL ON TABLE public.cast_assignments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cast_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cast_assignments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cast_assignments TO service_role;
REVOKE ALL ON TABLE public.cast_members FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cast_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cast_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cast_members TO service_role;
REVOKE ALL ON TABLE public.caster_presence FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_presence TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_presence TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_presence TO service_role;
REVOKE ALL ON TABLE public.caster_scenes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_scenes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_scenes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_scenes TO service_role;
REVOKE ALL ON TABLE public.caster_themes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_themes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_themes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.caster_themes TO service_role;
REVOKE ALL ON TABLE public.circuit_partner_applications FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.circuit_partner_applications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.circuit_partner_applications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.circuit_partner_applications TO service_role;
REVOKE ALL ON TABLE public.custom_game_presets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_game_presets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_game_presets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_game_presets TO service_role;
REVOKE ALL ON TABLE public.demandes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.demandes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.demandes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.demandes TO service_role;
REVOKE ALL ON TABLE public.discord_event_ack FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_event_ack TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_event_ack TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_event_ack TO service_role;
REVOKE ALL ON TABLE public.discord_guild_presence FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_guild_presence TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_guild_presence TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_guild_presence TO service_role;
REVOKE ALL ON TABLE public.discord_guilds FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_guilds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_guilds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_guilds TO service_role;
REVOKE ALL ON TABLE public.discord_webhooks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_webhooks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_webhooks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discord_webhooks TO service_role;
REVOKE ALL ON TABLE public.email_campaigns FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_campaigns TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_campaigns TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_campaigns TO service_role;
REVOKE ALL ON TABLE public.email_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_deliveries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_deliveries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_deliveries TO service_role;
REVOKE ALL ON SEQUENCE public.email_deliveries_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.email_deliveries_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.email_deliveries_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.email_deliveries_id_seq TO service_role;
REVOKE ALL ON TABLE public.entity_blacklist FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entity_blacklist TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entity_blacklist TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entity_blacklist TO service_role;
REVOKE ALL ON TABLE public.event_cue_acks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_cue_acks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_cue_acks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_cue_acks TO service_role;
REVOKE ALL ON TABLE public.event_cues FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_cues TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_cues TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_cues TO service_role;
REVOKE ALL ON TABLE public.event_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_runs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_runs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_runs TO service_role;
REVOKE ALL ON TABLE public.event_segments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_segments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_segments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_segments TO service_role;
REVOKE ALL ON TABLE public.event_stations FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_stations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_stations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_stations TO service_role;
REVOKE ALL ON TABLE public.event_waves FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_waves TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_waves TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_waves TO service_role;
REVOKE ALL ON TABLE public.final_rankings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.final_rankings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.final_rankings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.final_rankings TO service_role;
REVOKE ALL ON TABLE public.free_players FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.free_players TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.free_players TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.free_players TO service_role;
REVOKE ALL ON TABLE public.game_heroes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_heroes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_heroes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_heroes TO service_role;
REVOKE ALL ON TABLE public.games FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.games TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.games TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.games TO service_role;
REVOKE ALL ON TABLE public.helloasso_donations FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.helloasso_donations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.helloasso_donations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.helloasso_donations TO service_role;
REVOKE ALL ON TABLE public.integration_secrets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_secrets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_secrets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_secrets TO service_role;
REVOKE ALL ON TABLE public.league_scrims FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_scrims TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_scrims TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_scrims TO service_role;
REVOKE ALL ON TABLE public.league_standings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_standings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_standings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_standings TO service_role;
REVOKE ALL ON TABLE public.league_tournaments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_tournaments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_tournaments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.league_tournaments TO service_role;
REVOKE ALL ON TABLE public.leagues FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leagues TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leagues TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leagues TO service_role;
REVOKE ALL ON TABLE public.lobbies FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lobbies TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lobbies TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lobbies TO service_role;
REVOKE ALL ON TABLE public.lobby_placements FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lobby_placements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lobby_placements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lobby_placements TO service_role;
REVOKE ALL ON TABLE public.map_stats_view FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.map_stats_view TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.map_stats_view TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.map_stats_view TO service_role;
REVOKE ALL ON TABLE public.match_draft_steps FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_draft_steps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_draft_steps TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_draft_steps TO service_role;
REVOKE ALL ON TABLE public.match_drafts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_drafts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_drafts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_drafts TO service_role;
REVOKE ALL ON TABLE public.match_evidence FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_evidence TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_evidence TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_evidence TO service_role;
REVOKE ALL ON TABLE public.match_lineups FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_lineups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_lineups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_lineups TO service_role;
REVOKE ALL ON TABLE public.match_map_vetos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_map_vetos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_map_vetos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_map_vetos TO service_role;
REVOKE ALL ON TABLE public.match_mvp_polls FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_mvp_polls TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_mvp_polls TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_mvp_polls TO service_role;
REVOKE ALL ON TABLE public.match_mvp_votes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_mvp_votes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_mvp_votes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_mvp_votes TO service_role;
REVOKE ALL ON TABLE public.match_participants FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_participants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_participants TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_participants TO service_role;
REVOKE ALL ON TABLE public.match_prediction_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_prediction_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_prediction_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_prediction_settings TO service_role;
REVOKE ALL ON TABLE public.match_predictions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_predictions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_predictions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_predictions TO service_role;
REVOKE ALL ON TABLE public.match_public_mvp_polls FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_public_mvp_polls TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_public_mvp_polls TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_public_mvp_polls TO service_role;
REVOKE ALL ON TABLE public.match_public_mvp_votes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_public_mvp_votes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_public_mvp_votes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_public_mvp_votes TO service_role;
REVOKE ALL ON TABLE public.match_score_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_score_reports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_score_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_score_reports TO service_role;
REVOKE ALL ON TABLE public.matches FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.matches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.matches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.matches TO service_role;
REVOKE ALL ON TABLE public.news FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.news TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.news TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.news TO service_role;
REVOKE ALL ON TABLE public.news_comments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.news_comments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.news_comments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.news_comments TO service_role;
REVOKE ALL ON TABLE public.newsletter_subscribers FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.newsletter_subscribers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.newsletter_subscribers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.newsletter_subscribers TO service_role;
REVOKE ALL ON TABLE public.notification_prefs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_prefs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_prefs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_prefs TO service_role;
REVOKE ALL ON TABLE public.overlay_heartbeats FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.overlay_heartbeats TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.overlay_heartbeats TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.overlay_heartbeats TO service_role;
REVOKE ALL ON TABLE public.partners FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partners TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partners TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partners TO service_role;
REVOKE ALL ON TABLE public.partnership_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partnership_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partnership_requests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partnership_requests TO service_role;
REVOKE ALL ON TABLE public.patch_notes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patch_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patch_notes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patch_notes TO service_role;
REVOKE ALL ON TABLE public.pending_guild_links FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pending_guild_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pending_guild_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pending_guild_links TO service_role;
REVOKE ALL ON TABLE public.plan_cgv_acceptances FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_cgv_acceptances TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_cgv_acceptances TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_cgv_acceptances TO service_role;
REVOKE ALL ON TABLE public.player_action_snoozes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_action_snoozes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_action_snoozes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_action_snoozes TO service_role;
REVOKE ALL ON TABLE public.player_blacklist FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_blacklist TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_blacklist TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_blacklist TO service_role;
REVOKE ALL ON TABLE public.player_calendar_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_calendar_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_calendar_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_calendar_tokens TO service_role;
REVOKE ALL ON TABLE public.player_discovery_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_discovery_profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_discovery_profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_discovery_profiles TO service_role;
REVOKE ALL ON TABLE public.player_follows FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_follows TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_follows TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_follows TO service_role;
REVOKE ALL ON TABLE public.player_hero_preferences FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_hero_preferences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_hero_preferences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_hero_preferences TO service_role;
REVOKE ALL ON TABLE public.player_rating_history FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_rating_history TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_rating_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_rating_history TO service_role;
REVOKE ALL ON TABLE public.player_ratings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_ratings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_ratings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_ratings TO service_role;
REVOKE ALL ON TABLE public.prize_pool_checkouts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.prize_pool_checkouts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.prize_pool_checkouts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.prize_pool_checkouts TO service_role;
REVOKE ALL ON TABLE public.prize_pool_contributions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.prize_pool_contributions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.prize_pool_contributions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.prize_pool_contributions TO service_role;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO service_role;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rate_limit_buckets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rate_limit_buckets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rate_limit_buckets TO service_role;
REVOKE ALL ON TABLE public.scrim_planning_availabilities FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_planning_availabilities TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_planning_availabilities TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_planning_availabilities TO service_role;
REVOKE ALL ON TABLE public.scrim_plannings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_plannings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_plannings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_plannings TO service_role;
REVOKE ALL ON TABLE public.scrim_score_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_score_reports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_score_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_score_reports TO service_role;
REVOKE ALL ON TABLE public.scrim_searches FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_searches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_searches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrim_searches TO service_role;
REVOKE ALL ON TABLE public.scrims FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrims TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrims TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scrims TO service_role;
REVOKE ALL ON TABLE public.site_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.site_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.site_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.site_settings TO service_role;
REVOKE ALL ON TABLE public.social_accounts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_accounts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_accounts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_accounts TO service_role;
REVOKE ALL ON TABLE public.social_feed_items FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_feed_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_feed_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_feed_items TO service_role;
REVOKE ALL ON TABLE public.social_post_targets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_post_targets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_post_targets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_post_targets TO service_role;
REVOKE ALL ON TABLE public.social_posts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_posts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_posts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_posts TO service_role;
REVOKE ALL ON TABLE public.staff FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.staff TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.staff TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.staff TO service_role;
REVOKE ALL ON TABLE public.staff_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.staff_logs TO service_role;
REVOKE ALL ON TABLE public.stage_teams FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stage_teams TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stage_teams TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stage_teams TO service_role;
REVOKE ALL ON TABLE public.stage_tiebreaker_overrides FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stage_tiebreaker_overrides TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stage_tiebreaker_overrides TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stage_tiebreaker_overrides TO service_role;
REVOKE ALL ON SEQUENCE public.stage_tiebreaker_overrides_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.stage_tiebreaker_overrides_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.stage_tiebreaker_overrides_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.stage_tiebreaker_overrides_id_seq TO service_role;
REVOKE ALL ON TABLE public.stream_alert_events FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_events TO service_role;
REVOKE ALL ON TABLE public.stream_alert_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_rules TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_rules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_rules TO service_role;
REVOKE ALL ON TABLE public.stream_alert_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stream_alert_settings TO service_role;
REVOKE ALL ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO service_role;
REVOKE ALL ON TABLE public.task_boards FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_boards TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_boards TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_boards TO service_role;
REVOKE ALL ON TABLE public.task_checklist_items FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_checklist_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_checklist_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_checklist_items TO service_role;
REVOKE ALL ON TABLE public.task_columns FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_columns TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_columns TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_columns TO service_role;
REVOKE ALL ON TABLE public.task_comments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_comments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_comments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_comments TO service_role;
REVOKE ALL ON TABLE public.task_labels FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_labels TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_labels TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.task_labels TO service_role;
REVOKE ALL ON TABLE public.tasks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tasks TO service_role;
REVOKE ALL ON TABLE public.tcg_fanart_cards FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_fanart_cards TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_fanart_cards TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_fanart_cards TO service_role;
REVOKE ALL ON TABLE public.tcg_overlay_themes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_overlay_themes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_overlay_themes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_overlay_themes TO service_role;
REVOKE ALL ON TABLE public.tcg_overlay_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_overlay_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_overlay_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_overlay_tokens TO service_role;
REVOKE ALL ON TABLE public.tcg_pack_cards FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_pack_cards TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_pack_cards TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_pack_cards TO service_role;
REVOKE ALL ON TABLE public.tcg_packs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_packs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_packs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_packs TO service_role;
REVOKE ALL ON TABLE public.tcg_photo_purges FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_photo_purges TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_photo_purges TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_photo_purges TO service_role;
REVOKE ALL ON TABLE public.tcg_player_cards FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_player_cards TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_player_cards TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_player_cards TO service_role;
REVOKE ALL ON TABLE public.tcg_showcases FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_showcases TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_showcases TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_showcases TO service_role;
REVOKE ALL ON TABLE public.tcg_trade_blocks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_blocks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_blocks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_blocks TO service_role;
REVOKE ALL ON TABLE public.tcg_trade_items FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_items TO service_role;
REVOKE ALL ON TABLE public.tcg_trade_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trade_settings TO service_role;
REVOKE ALL ON TABLE public.tcg_trades FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trades TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trades TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_trades TO service_role;
REVOKE ALL ON TABLE public.tcg_wallet_entries FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_wallet_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_wallet_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_wallet_entries TO service_role;
REVOKE ALL ON TABLE public.tcg_wallets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_wallets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_wallets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tcg_wallets TO service_role;
REVOKE ALL ON TABLE public.team_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_audit_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_audit_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_audit_logs TO service_role;
REVOKE ALL ON TABLE public.team_availability FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_availability TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_availability TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_availability TO service_role;
REVOKE ALL ON TABLE public.team_availability_constraints FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_availability_constraints TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_availability_constraints TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_availability_constraints TO service_role;
REVOKE ALL ON TABLE public.team_discord_channels FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_discord_channels TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_discord_channels TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_discord_channels TO service_role;
REVOKE ALL ON TABLE public.team_invite_links FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_invite_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_invite_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_invite_links TO service_role;
REVOKE ALL ON TABLE public.team_map_stats FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_map_stats TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_map_stats TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_map_stats TO service_role;
REVOKE ALL ON TABLE public.team_member_permissions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_member_permissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_member_permissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_member_permissions TO service_role;
REVOKE ALL ON TABLE public.team_members FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO service_role;
REVOKE ALL ON TABLE public.team_openings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_openings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_openings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_openings TO service_role;
REVOKE ALL ON TABLE public.team_ratings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_ratings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_ratings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_ratings TO service_role;
REVOKE ALL ON TABLE public.team_reviews FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_reviews TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_reviews TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_reviews TO service_role;
REVOKE ALL ON TABLE public.team_stats_view FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_stats_view TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_stats_view TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_stats_view TO service_role;
REVOKE ALL ON TABLE public.teams FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO service_role;
REVOKE ALL ON TABLE public.tenant_api_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_api_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_api_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_api_tokens TO service_role;
REVOKE ALL ON TABLE public.tenant_discord_config FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_discord_config TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_discord_config TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_discord_config TO service_role;
REVOKE ALL ON TABLE public.tenant_invitations FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_invitations TO service_role;
REVOKE ALL ON TABLE public.tenant_map_pool FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_map_pool TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_map_pool TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_map_pool TO service_role;
REVOKE ALL ON TABLE public.tenant_plan_checkouts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_plan_checkouts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_plan_checkouts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_plan_checkouts TO service_role;
REVOKE ALL ON SEQUENCE public.tenant_plan_checkouts_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.tenant_plan_checkouts_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.tenant_plan_checkouts_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.tenant_plan_checkouts_id_seq TO service_role;
REVOKE ALL ON TABLE public.tenant_plan_payments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_plan_payments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_plan_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_plan_payments TO service_role;
REVOKE ALL ON SEQUENCE public.tenant_plan_payments_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.tenant_plan_payments_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.tenant_plan_payments_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.tenant_plan_payments_id_seq TO service_role;
REVOKE ALL ON TABLE public.tenant_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_requests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_requests TO service_role;
REVOKE ALL ON TABLE public.tenant_secrets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_secrets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_secrets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_secrets TO service_role;
REVOKE ALL ON TABLE public.tenant_staff FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_staff TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_staff TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_staff TO service_role;
REVOKE ALL ON TABLE public.tenants FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO service_role;
REVOKE ALL ON TABLE public.tournament_maps FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_maps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_maps TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_maps TO service_role;
REVOKE ALL ON TABLE public.tournament_pool_entries FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_pool_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_pool_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_pool_entries TO service_role;
REVOKE ALL ON TABLE public.tournament_prize_pools FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_prize_pools TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_prize_pools TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_prize_pools TO service_role;
REVOKE ALL ON TABLE public.tournament_stages FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_stages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_stages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_stages TO service_role;
REVOKE ALL ON TABLE public.tournament_teams FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_teams TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_teams TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournament_teams TO service_role;
REVOKE ALL ON TABLE public.tournaments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournaments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournaments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tournaments TO service_role;
REVOKE ALL ON TABLE public.twitch_broadcaster_connections FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.twitch_broadcaster_connections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.twitch_broadcaster_connections TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.twitch_broadcaster_connections TO service_role;
REVOKE ALL ON TABLE public.twitch_channels FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.twitch_channels TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.twitch_channels TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.twitch_channels TO service_role;
REVOKE ALL ON TABLE public.user_battlenet_links FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_battlenet_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_battlenet_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_battlenet_links TO service_role;
REVOKE ALL ON TABLE public.user_discord_links FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_discord_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_discord_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_discord_links TO service_role;
REVOKE ALL ON TABLE public.user_twitch_links FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_twitch_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_twitch_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_twitch_links TO service_role;
REVOKE ALL ON TABLE public.web_push_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.web_push_deliveries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.web_push_deliveries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.web_push_deliveries TO service_role;
REVOKE ALL ON TABLE public.webhook_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.webhook_deliveries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.webhook_deliveries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.webhook_deliveries TO service_role;
REVOKE ALL ON TABLE public.webhook_subscriptions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.webhook_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.webhook_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.webhook_subscriptions TO service_role;

REVOKE ALL ON FUNCTION public.accept_invitation(p_demande_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(p_demande_id uuid, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_get_user_profiles(p_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(p_ids uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.admin_list_users(p_query text, p_role text, p_limit integer, p_offset integer, p_sort text, p_dir text, p_filters text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users(p_query text, p_role text, p_limit integer, p_offset integer, p_sort text, p_dir text, p_filters text[]) TO service_role;
REVOKE ALL ON FUNCTION public.admin_search_tcg_players(p_tenant_id uuid, p_query text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_tcg_players(p_tenant_id uuid, p_query text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_search_users(p_query text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_users(p_query text) TO service_role;
REVOKE ALL ON FUNCTION public.approve_join_request(p_demande_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_join_request(p_demande_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.approve_transfer_request(p_demande_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_transfer_request(p_demande_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.caster_presence_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caster_presence_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.caster_presence_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.caster_presence_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caster_presence_set_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.clear_supporter_role_on_roster_join() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_supporter_role_on_roster_join() TO service_role;
REVOKE ALL ON FUNCTION public.consume_api_usage(p_tenant_id uuid, p_minute_key text, p_month_key text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_api_usage(p_tenant_id uuid, p_minute_key text, p_month_key text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_usage(p_tenant_id uuid, p_minute_key text, p_month_key text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_api_usage(p_tenant_id uuid, p_minute_key text, p_month_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_usage(p_tenant_id uuid, p_minute_key text, p_month_key text) TO anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) TO service_role;
REVOKE ALL ON FUNCTION public.count_confirmed_auth_users() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_confirmed_auth_users() TO service_role;
REVOKE ALL ON FUNCTION public.designate_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.designate_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_cast_member_is_staff_caster() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_cast_member_is_staff_caster() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_cast_member_is_staff_caster() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_cast_member_is_staff_caster() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_cast_member_is_staff_caster() TO PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_team_max_players() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_team_max_players() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_team_max_players() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_team_max_players() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_team_max_players() TO anon;
REVOKE ALL ON FUNCTION public.entity_blacklist_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_blacklist_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_blacklist_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_blacklist_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.entity_blacklist_set_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.event_runs_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_runs_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_runs_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.event_runs_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_runs_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.event_segments_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_segments_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.event_segments_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.event_segments_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_segments_set_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.event_stations_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_stations_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.event_stations_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_stations_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.event_stations_set_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.event_waves_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_waves_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.event_waves_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_waves_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_waves_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.final_rankings_touch_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.final_rankings_touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.final_rankings_touch_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.final_rankings_touch_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.final_rankings_touch_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.generate_member_number() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_member_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_member_number() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_member_number() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_member_number() TO service_role;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(p_email text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(p_email text) TO service_role;
REVOKE ALL ON FUNCTION public.handle_caster_scenes_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_caster_scenes_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_caster_scenes_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_caster_scenes_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_caster_scenes_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.handle_caster_themes_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_caster_themes_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.introspect_foreign_keys() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.introspect_foreign_keys() TO service_role;
REVOKE ALL ON FUNCTION public.match_predictions_guard() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_predictions_guard() TO anon;
GRANT EXECUTE ON FUNCTION public.match_predictions_guard() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_predictions_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_predictions_guard() TO service_role;
REVOKE ALL ON FUNCTION public.match_score_reports_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_score_reports_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_score_reports_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.match_score_reports_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_score_reports_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.player_action_snoozes_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_action_snoozes_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_action_snoozes_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.player_action_snoozes_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_action_snoozes_set_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.player_blacklist_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_blacklist_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.player_blacklist_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_blacklist_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.player_blacklist_set_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.player_ratings_leagues_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_ratings_leagues_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.player_ratings_leagues_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_ratings_leagues_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.player_ratings_leagues_set_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.pool_place(p_tenant_id uuid, p_tournament_id uuid, p_entry_ids uuid[], p_team_id uuid, p_team_size integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pool_place(p_tenant_id uuid, p_tournament_id uuid, p_entry_ids uuid[], p_team_id uuid, p_team_size integer) TO service_role;
REVOKE ALL ON FUNCTION public.pool_register(p_tenant_id uuid, p_tournament_id uuid, p_user_id uuid, p_display_name text, p_battle_tag text, p_origin_team_id uuid, p_team_size integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pool_register(p_tenant_id uuid, p_tournament_id uuid, p_user_id uuid, p_display_name text, p_battle_tag text, p_origin_team_id uuid, p_team_size integer) TO service_role;
REVOKE ALL ON FUNCTION public.pool_unplace(p_tenant_id uuid, p_tournament_id uuid, p_entry_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pool_unplace(p_tenant_id uuid, p_tournament_id uuid, p_entry_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reassign_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid) TO service_role;
REVOKE ALL ON FUNCTION public.scrim_plannings_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrim_plannings_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scrim_plannings_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.scrim_plannings_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.scrim_plannings_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.scrim_score_reports_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrim_score_reports_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.scrim_score_reports_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.scrim_score_reports_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scrim_score_reports_set_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.scrim_searches_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrim_searches_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scrim_searches_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.scrim_searches_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.scrim_searches_set_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.scrims_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrims_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scrims_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.scrims_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.scrims_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.slugify_text(input text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.slugify_text(input text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slugify_text(input text) TO service_role;
GRANT EXECUTE ON FUNCTION public.slugify_text(input text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.slugify_text(input text) TO anon;
REVOKE ALL ON FUNCTION public.sync_cast_members_on_staff_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_cast_members_on_staff_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cast_members_on_staff_change() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_cast_members_on_staff_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_cast_members_on_staff_change() TO service_role;
REVOKE ALL ON FUNCTION public.sync_team_member_battletag_verification() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_team_member_battletag_verification() TO service_role;
REVOKE ALL ON FUNCTION public.sync_tenant_lifecycle() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_tenant_lifecycle() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_tenant_lifecycle() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_tenant_lifecycle() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_tenant_lifecycle() TO authenticated;
REVOKE ALL ON FUNCTION public.tcg_accept_trade(p_tenant_id uuid, p_trade_id uuid, p_user_id uuid, p_max_accepted_per_day integer, p_min_account_age_days integer, p_min_collection_age_days integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_accept_trade(p_tenant_id uuid, p_trade_id uuid, p_user_id uuid, p_max_accepted_per_day integer, p_min_account_age_days integer, p_min_collection_age_days integer) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_admin_debit(p_tenant_id uuid, p_user_id uuid, p_cost integer, p_source_ref text, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_admin_debit(p_tenant_id uuid, p_user_id uuid, p_cost integer, p_source_ref text, p_note text) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_buy_cosmetic(p_tenant_id uuid, p_user_id uuid, p_key text, p_price integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_buy_cosmetic(p_tenant_id uuid, p_user_id uuid, p_key text, p_price integer) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_forge_card(p_tenant_id uuid, p_user_id uuid, p_cards jsonb, p_fee integer, p_rarity text, p_subject_kind text, p_card_user_id uuid, p_card_team_id uuid, p_card_map_slug text, p_card_mascot_slug text, p_card_fanart_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_forge_card(p_tenant_id uuid, p_user_id uuid, p_cards jsonb, p_fee integer, p_rarity text, p_subject_kind text, p_card_user_id uuid, p_card_team_id uuid, p_card_map_slug text, p_card_mascot_slug text, p_card_fanart_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_pack_source_tradeable(p_source_kind text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_pack_source_tradeable(p_source_kind text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tcg_pack_source_tradeable(p_source_kind text) TO anon;
GRANT EXECUTE ON FUNCTION public.tcg_pack_source_tradeable(p_source_kind text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tcg_pack_source_tradeable(p_source_kind text) TO authenticated;
REVOKE ALL ON FUNCTION public.tcg_propose_trade(p_tenant_id uuid, p_proposer_id uuid, p_recipient_id uuid, p_offered jsonb, p_requested jsonb, p_ttl_hours integer, p_max_cards integer, p_max_pending_sent integer, p_max_pending_received integer, p_decline_cooldown_hours integer, p_min_account_age_days integer, p_min_collection_age_days integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_propose_trade(p_tenant_id uuid, p_proposer_id uuid, p_recipient_id uuid, p_offered jsonb, p_requested jsonb, p_ttl_hours integer, p_max_cards integer, p_max_pending_sent integer, p_max_pending_received integer, p_decline_cooldown_hours integer, p_min_account_age_days integer, p_min_collection_age_days integer) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_purchase_booster(p_tenant_id uuid, p_user_id uuid, p_price integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_purchase_booster(p_tenant_id uuid, p_user_id uuid, p_price integer) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_rarity_rank(p_rarity text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_rarity_rank(p_rarity text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tcg_rarity_rank(p_rarity text) TO anon;
GRANT EXECUTE ON FUNCTION public.tcg_rarity_rank(p_rarity text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcg_rarity_rank(p_rarity text) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_refresh_wallet_balance(p_tenant_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_refresh_wallet_balance(p_tenant_id uuid, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_trade_eligibility(p_tenant_id uuid, p_user_id uuid, p_min_account_age_days integer, p_min_collection_age_days integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_trade_eligibility(p_tenant_id uuid, p_user_id uuid, p_min_account_age_days integer, p_min_collection_age_days integer) TO service_role;
REVOKE ALL ON FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.team_availability_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_availability_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.team_availability_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_availability_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_availability_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.team_reviews_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_reviews_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.team_reviews_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_reviews_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.team_reviews_set_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.teams_set_slug() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teams_set_slug() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teams_set_slug() TO service_role;
GRANT EXECUTE ON FUNCTION public.teams_set_slug() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.teams_set_slug() TO anon;
REVOKE ALL ON FUNCTION public.tenant_discord_config_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_discord_config_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.tenant_discord_config_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_discord_config_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_discord_config_set_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.touch_match_drafts_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_match_drafts_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.touch_match_drafts_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_match_drafts_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_match_drafts_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.transfer_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid, p_actor uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_captain(p_team_id uuid, p_new_captain uuid, p_tenant uuid, p_actor uuid) TO service_role;
REVOKE ALL ON FUNCTION public.twitch_broadcaster_connections_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.twitch_broadcaster_connections_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.twitch_broadcaster_connections_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.twitch_broadcaster_connections_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.twitch_broadcaster_connections_set_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_adherents_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_adherents_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_adherents_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_adherents_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_adherents_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.update_association_pole_members_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_association_pole_members_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_association_pole_members_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_association_pole_members_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_association_pole_members_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.update_blizzard_media_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_blizzard_media_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_blizzard_media_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_blizzard_media_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_blizzard_media_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_blizzard_news_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_blizzard_news_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_blizzard_news_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_blizzard_news_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_blizzard_news_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.update_cast_members_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_cast_members_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_cast_members_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_cast_members_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_cast_members_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_contact_submissions_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_contact_submissions_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_contact_submissions_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_contact_submissions_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_contact_submissions_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.update_demandes_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_demandes_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_demandes_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_demandes_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_demandes_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_free_players_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_free_players_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_free_players_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_free_players_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_free_players_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_partners_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_partners_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_partners_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_partners_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_partners_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.update_partnership_requests_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_partnership_requests_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_partnership_requests_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_partnership_requests_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_partnership_requests_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_patch_notes_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_patch_notes_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_patch_notes_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_patch_notes_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patch_notes_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_site_settings_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_site_settings_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_site_settings_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_site_settings_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_site_settings_updated_at() TO anon;
REVOKE ALL ON FUNCTION public.update_team_openings_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_team_openings_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_team_openings_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_team_openings_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_openings_updated_at() TO PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_map_pool_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_map_pool_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_map_pool_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_map_pool_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_map_pool_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.update_tenant_requests_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_requests_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_requests_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_requests_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_requests_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.update_tenants_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenants_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenants_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenants_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_tenants_updated_at() TO authenticated;
REVOKE ALL ON FUNCTION public.update_twitch_channels_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_twitch_channels_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_twitch_channels_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_twitch_channels_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_twitch_channels_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
REVOKE ALL ON FUNCTION public.update_web_push_deliveries_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_web_push_deliveries_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_web_push_deliveries_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_web_push_deliveries_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.update_web_push_deliveries_updated_at() TO PUBLIC;

-- ---------------------------------------------------------------- REALTIME
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.caster_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.caster_scenes;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.caster_themes;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.demandes;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.event_cue_acks;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.event_cues;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.event_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.event_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.event_stations;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.event_waves;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.match_draft_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.match_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.matches;

-- ---------------------------------------------------------------- STOCKAGE
-- Buckets déduits du code (pas de la base) : `teams-images` (public :
-- getPublicUrl dans les uploads logo / TCG / overlay) et `match-evidence`
-- (privé : preuves de résultat, URL signées — utils/matches/evidence.ts).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES
      ('teams-images', 'teams-images', true),
      ('match-evidence', 'match-evidence', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
