-- Migration: S6b.1 multi-tenant — table `tenant_discord_config` (config Discord par guild)
-- Date: 2026-05-21
--
-- WHY:
--   Le bot Discord lit aujourd'hui ~12 variables d'environnement hardcodées
--   pour resoudre les channel IDs, role IDs et tags de forum specifiques à la
--   guild conference (STAFF_LOG_CHANNEL_ID, MATCHES_LIVE_CHANNEL_ID,
--   DISPUTES_FORUM_CHANNEL_ID, CAPTAIN_ROLE_ID, etc.). En multi-tenant chaque
--   guild a sa propre config — impossible de continuer avec des env vars
--   globales.
--
--   Cette migration cree la table `tenant_discord_config` qui stocke ces IDs
--   par guild. La PK est `guild_id` (pas `tenant_id`) car un tenant peut
--   avoir plusieurs guilds (cf. `discord_guilds`), et chaque guild a sa
--   propre topologie de channels/roles.
--
-- MIGRATION STRATEGY (pas de downtime) :
--   Toutes les colonnes de config sont NULLable par defaut. Le bot loader
--   fait fallback sur les env vars existantes quand la valeur DB est NULL.
--   Ca permet une migration progressive guild-par-guild via l'UI admin
--   (S7) sans redeployer le bot. Une fois toutes les guilds migrees, on
--   pourra retirer les env vars du compose.
--
-- PAS DE SEED pour la guild conference en V1 : les env vars de prod restent
-- authoritatives. Le user pourra saisir la config via le formulaire admin
-- livre en S7.
--
-- CAVEATS:
--   - Idempotente : peut etre re-appliquee sans erreur (IF NOT EXISTS).
--   - ON DELETE CASCADE sur la FK vers `discord_guilds` : si on retire un
--     guild du mapping tenant, sa config est purgee automatiquement.
--   - RLS enabled sans policy = service_role only (la config contient des
--     IDs techniques sensibles : role IDs de moderation, channels prives,
--     etc. ; aucun acces anon/auth).
--   - `staff_role_ids` est un text[] pour supporter plusieurs roles staff
--     par guild (la guild conference en a typiquement 2-3 : admin, modo, etc).
--   - `extras jsonb` reserve aux configs ad-hoc futures (ex. `mvp_emoji_id`,
--     `welcome_channel_id`) sans necessiter une nouvelle migration a chaque
--     fois. Eviter d'en abuser : si une cle devient critique, la promouvoir
--     en colonne typee.
--   - PostgREST schema cache reload requis apres application (nouvelle table
--     + nouvelle FK). `NOTIFY pgrst, 'reload schema'` envoye en fin de
--     migration, mais cliquer aussi "Reload schema cache" dans Dashboard
--     Supabase (Settings → API) pour garantir la prise en compte immediate.

BEGIN;

-- ===========================================================================
-- 1) Table `tenant_discord_config` — config Discord par guild
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.tenant_discord_config (
  guild_id text PRIMARY KEY
    REFERENCES public.discord_guilds(guild_id) ON DELETE CASCADE,

  -- Channels (text = Discord snowflake, peut depasser 2^53 donc pas bigint)
  staff_log_channel_id        text,
  matches_live_channel_id     text,
  disputes_forum_channel_id   text,
  lives_board_channel_id      text,
  news_ingest_channel_id      text,
  scrims_announce_channel_id  text,

  -- Roles
  captain_role_id    text,
  substitute_role_id text,
  staff_role_ids     text[] NOT NULL DEFAULT '{}',

  -- Voice / categories
  teams_voice_category_id text,

  -- Forum tags (disputes) — IDs de tags de forum Discord pour categoriser
  -- les threads de dispute (open / pending / resolved).
  disputes_forum_tag_open_id     text,
  disputes_forum_tag_pending_id  text,
  disputes_forum_tag_resolved_id text,

  -- Extras : configs ad-hoc / futures sans necessiter de migration.
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_discord_config IS
  'Configuration Discord par guild (channel IDs, role IDs, forum tags). Une row par guild_id, lookup direct par PK depuis le bot. Toutes les colonnes config NULLables : le bot fallback sur env si NULL (migration progressive).';

COMMENT ON COLUMN public.tenant_discord_config.guild_id IS
  'Discord snowflake (FK vers discord_guilds.guild_id, CASCADE).';
COMMENT ON COLUMN public.tenant_discord_config.staff_log_channel_id IS
  'Channel ou le bot poste les staff_logs (audit trail moderation). Fallback env STAFF_LOG_CHANNEL_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.matches_live_channel_id IS
  'Channel ou le bot poste les annonces de matches live. Fallback env MATCHES_LIVE_CHANNEL_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.disputes_forum_channel_id IS
  'Forum channel ou le bot ouvre les threads de dispute. Fallback env DISPUTES_FORUM_CHANNEL_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.lives_board_channel_id IS
  'Channel du tableau "lives en cours" (twitch_channels). Fallback env LIVES_BOARD_CHANNEL_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.news_ingest_channel_id IS
  'Channel d''ingestion des news Blizzard. Fallback env NEWS_INGEST_CHANNEL_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.scrims_announce_channel_id IS
  'Channel d''annonce des scrims. Fallback env SCRIMS_ANNOUNCE_CHANNEL_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.captain_role_id IS
  'Role Discord "capitaine". Fallback env CAPTAIN_ROLE_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.substitute_role_id IS
  'Role Discord "remplacant". Fallback env SUBSTITUTE_ROLE_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.staff_role_ids IS
  'Roles Discord consideres comme "staff" pour les checks de permission bot. Plusieurs roles possibles (admin, modo, etc.). Fallback env STAFF_ROLE_IDS (comma-separated) si tableau vide.';
COMMENT ON COLUMN public.tenant_discord_config.teams_voice_category_id IS
  'Categorie voice ou le bot cree les salons d''equipe. Fallback env TEAMS_VOICE_CATEGORY_ID si NULL.';
COMMENT ON COLUMN public.tenant_discord_config.disputes_forum_tag_open_id IS
  'Tag de forum applique aux threads de dispute ouverts.';
COMMENT ON COLUMN public.tenant_discord_config.disputes_forum_tag_pending_id IS
  'Tag de forum applique aux threads de dispute en attente d''arbitrage.';
COMMENT ON COLUMN public.tenant_discord_config.disputes_forum_tag_resolved_id IS
  'Tag de forum applique aux threads de dispute resolus.';
COMMENT ON COLUMN public.tenant_discord_config.extras IS
  'Bag de configs Discord ad-hoc (sans migration). Si une cle devient critique, la promouvoir en colonne typee.';

-- ===========================================================================
-- 2) Trigger updated_at
-- ===========================================================================
--
-- Fonction dediee (pattern du repo : pas de helper global). search_path
-- verrouille pour eviter le linter `function_search_path_mutable`.

CREATE OR REPLACE FUNCTION public.tenant_discord_config_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_discord_config_updated_at
  ON public.tenant_discord_config;
CREATE TRIGGER trg_tenant_discord_config_updated_at
  BEFORE UPDATE ON public.tenant_discord_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_discord_config_set_updated_at();

-- ===========================================================================
-- 3) RLS — service_role only
-- ===========================================================================
--
-- Aucune policy = aucun acces anon/auth. Le service_role bypass RLS donc
-- les routes /api/bot/v1/* (via supabaseAdmin) y accedent normalement.
-- Quand l'UI admin (S7) lira/ecrira cette table, elle passera par les
-- routes API protegees par withStaffRoute, jamais par le client Supabase
-- direct.

ALTER TABLE public.tenant_discord_config ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- 4) PostgREST schema cache reload
-- ===========================================================================
--
-- Nouvelle table + nouvelle FK vers discord_guilds : PostgREST doit recharger
-- son cache de schema. Le NOTIFY declenche un reload immediat cote PostgREST
-- embarque. En cas d'erreur "could not find relationship" depuis l'API,
-- forcer un reload manuel via Dashboard Supabase → Settings → API.

NOTIFY pgrst, 'reload schema';
