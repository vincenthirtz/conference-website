-- Migration : recherche de joueuses du TCG CANTONNÉE À L'ESPACE du staff.
-- Date: 2026-09-15
-- Statut : NON APPLIQUÉE à la rédaction.
--
-- WHY — fuite de données personnelles confirmée par l'audit du 2026-09-15.
--   `GET /api/admin/tcg/players` appelait `admin_search_users`, une RPC
--   GLOBALE (aucun filtre tenant, cf. add_admin_search_users_function.sql) qui
--   rend email, pseudo, BattleTag et équipe de TOUS les comptes. La route est
--   gardée par `manage_tcg`, que tout `owner` d'espace possède par rôle — y
--   compris l'owner d'un espace DÉVELOPPEUR créé en libre-service
--   (`pages/api/developers/register.ts`). N'importe qui pouvait donc, en
--   quelques minutes, énumérer les emails et BattleTags de la plateforme.
--
-- LE PRINCIPE. Le filtre est fait PAR LA BASE, avant que la moindre ligne ne
-- sorte : filtrer en JavaScript le résultat de la RPC globale aurait laissé la
-- limite de 30 candidats s'appliquer AVANT le filtre (des résultats de l'espace
-- masqués par ceux d'autres espaces), et fait transiter les données d'autrui
-- par le serveur d'application.
--
-- « RATTACHÉE À L'ESPACE » — la même définition que `utils/tcg/tenantAttachment.ts`
-- (les deux listes sont vérifiées identiques par un test unitaire) :
--   - une ligne de roster du tenant (`team_members.tenant_id`), OU
--   - une écriture de GAIN RÉEL au registre du tenant. Sont exclus
--     `admin_grant` (un staff tiers créerait sinon le rattachement qu'il
--     cherche à obtenir, cf. l'attaque du rattrapage Battle.net),
--     `booster_purchase` et `card_recycled` (dérivés de pièces qui peuvent
--     venir d'un `admin_grant`), et toute source future tant qu'elle n'est pas
--     ajoutée ici EXPRÈS (liste blanche : une source oubliée rend une joueuse
--     introuvable, jamais une étrangère visible).
--
-- CE QUI EST RENDU : id, pseudo, BattleTag, équipe (de CET espace). PAS
-- l'email : un pseudo, un BattleTag et une équipe suffisent à distinguer deux
-- homonymes avant de créditer ; l'email n'est plus non plus un critère de
-- recherche (il servirait d'oracle « cet email appartient-il à quelqu'un ? »).
--
-- ORDRE DE DÉPLOIEMENT : appliquer AVANT le site. Site sans migration : la
-- route répond 503 `SEARCH_UNAVAILABLE` (jamais de repli sur la RPC globale) ;
-- la carte « Ajuster un solde » affiche « recherche indisponible ».
--
-- IDEMPOTENTE : CREATE OR REPLACE, REVOKE/GRANT rejouables. Aucune table
-- modifiée. `admin_search_users` reste en place pour `/api/admin/users/search`
-- (gardée par `manage_staff`) — hors du périmètre de ce correctif.

BEGIN;

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
    UNION
    SELECT e.user_id
    FROM public.tcg_wallet_entries e
    WHERE p_tenant_id IS NOT NULL
      AND e.tenant_id = p_tenant_id
      AND e.source_kind IN (
        'match_win',
        'scrim_win',
        'twitch_drop',
        'welcome_gift',
        'supporter_welcome',
        'checkin_streak',
        'tournament_placement',
        'battlenet_verified'
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

COMMENT ON FUNCTION public.admin_search_tcg_players(uuid, text) IS
  'Recherche de joueuses pour la correction de solde TCG, CANTONNÉE au tenant : roster du tenant ou gain réel au registre du tenant (liste blanche, admin_grant exclu). Ne rend pas l''email et ne cherche pas dessus. SECURITY DEFINER pour lire auth.users ; EXECUTE réservé à service_role.';

REVOKE ALL ON FUNCTION public.admin_search_tcg_players(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_tcg_players(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_search_tcg_players(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_tcg_players(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
