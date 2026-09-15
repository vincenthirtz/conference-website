-- Migration : l'appartenance à une équipe porte l'ACCORD de la personne.
-- Date: 2026-09-15
--
-- WHY:
--   Un owner peut ajouter un compte existant au roster d'une équipe de son
--   espace sans le consentement de la personne (ajout staff, ajout capitaine,
--   import). Ce roster valait « rattachement à l'espace » pour le TCG : correction
--   de solde, rattrapage Battle.net (récompense UNIQUE tous espaces confondus)
--   et recherche de joueuses. `accepted_at` distingue désormais :
--     - NULL      : ajout par un tiers — l'appartenance existe, sans prise TCG ;
--     - horodaté  : elle a créé l'équipe, demandé à la rejoindre, demandé un
--                   transfert ou accepté une invitation.
--
--   Le rattachement TCG (`utils/tcg/tenantAttachment.ts` et, ici,
--   `admin_search_tcg_players`) ne compte plus que les appartenances acceptées,
--   et, côté registre, les seuls gains nés d'un geste de la personne
--   (twitch_drop, supporter_welcome, battlenet_verified, collection_set) : les
--   victoires, check-ins, palmarès et cadeaux d'accueil sont pilotés par
--   l'organisation et pouvaient servir à fabriquer un rattachement.
--
-- CAVEATS:
--   - DEFAULT NULL, volontairement : un chemin d'insertion oublié ne rattache
--     personne (échec fermé) au lieu de rattacher tout le monde.
--   - REPRISE DE L'EXISTANT : les appartenances antérieures reçoivent
--     `accepted_at = created_at`. On ne sait pas distinguer rétroactivement un
--     ajout forcé d'une adhésion ; ne rien reprendre aurait détaché toutes les
--     joueuses actuelles. Au 2026-09-15 : 2 espaces, aucun espace développeur.
--   - Les trois fonctions d'adhésion sont RECRÉÉES à l'identique de la prod
--     (relue par pg_get_functiondef) avec la seule colonne `accepted_at` en plus.
--   - Idempotente.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.team_members.accepted_at IS
  'Accord de la personne (création de l''équipe, demande approuvée, invitation acceptée). NULL = ajoutée par un tiers (staff, capitaine, import) : aucune prise TCG sur son compte.';

UPDATE public.team_members
   SET accepted_at = COALESCE(created_at, now())
 WHERE accepted_at IS NULL;

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
END; $function$;

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
END; $function$;

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
END; $function$;

-- La recherche de joueuses du TCG suit la même définition du rattachement.
CREATE OR REPLACE FUNCTION public.admin_search_tcg_players(
  p_tenant_id uuid,
  p_query text
)
RETURNS TABLE (
  id           uuid,
  display_name text,
  battle_tag   text,
  team_name    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH norm AS (
    SELECT
      lower(trim(p_query)) AS q,
      -- `%` et `_` saisis sont des caractères, pas des jokers.
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
  -- Une appartenance d'équipe DE CET ESPACE par joueuse (DISTINCT ON déterministe).
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
$$;

NOTIFY pgrst, 'reload schema';
