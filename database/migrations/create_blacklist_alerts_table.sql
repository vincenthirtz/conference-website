-- Migration: création de la table `blacklist_alerts` (feature Blacklist joueurs — audit)
-- Date: 2026-06-29
-- Ref: docs/BLACKLIST_DESIGN.md (section "Modèle de données")
--
-- WHY:
--   Journal append-only des DÉTECTIONS de blacklist. Chaque fois qu'un joueur
--   banni est matché (scan du serveur Discord par le bot, ajout d'un membre,
--   inscription site), on enregistre ici une ligne d'audit. La table
--   `player_blacklist` porte les entrées bannies ; `blacklist_alerts` porte
--   l'historique de QUAND/COMMENT chaque entrée a déclenché une alerte.
--
--   Append-only : on n'UPDATE jamais une alerte (pas de trigger updated_at).
--   Chaque détection est un fait historique immuable. Si l'entrée de blacklist
--   sous-jacente est désactivée/supprimée plus tard, l'alerte reste (FK
--   `blacklist_entry_id` en SET NULL) — on garde la trace de la détection.
--
--   Sources de détection (`source`) :
--     - `bot_scan`        : scan périodique des membres du serveur Discord.
--     - `bot_member_add`  : arrivée d'un membre sur le serveur Discord.
--     - `registration`    : inscription côté site (compte, équipe, ajout membre).
--   `context` précise le sous-cas (guild_scan, guild_member_add, register,
--   team_create, add_member…).
--
--   `matched_on` / `strength` figent le critère qui a déclenché CETTE alerte ;
--   `criteria` (jsonb) garde la liste complète des critères touchés pour le cas
--   où plusieurs identifiants matchent en même temps.
--
-- RLS — default deny strict (même pattern que player_blacklist / staff_logs) :
--   - RLS activé SANS aucune policy : ni anon ni authenticated n'y accèdent.
--   - Accès exclusivement via supabaseAdmin (service_role bypass RLS) :
--       * écriture par le bot et les endpoints d'inscription (détection),
--       * lecture par les endpoints admin de modération (consultation paginée).
--     Aucune lecture client directe — la table contient des données de
--     modération internes.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout (table + indexes), RLS idempotente.
--   - `tenant_id` : scope multi-tenant, renseigné par l'API à l'écriture
--     (même convention que player_blacklist : uuid NOT NULL, sans default ni FK).
--   - PostgREST schema cache reload requis (nouvelle table + nouvelle FK vers
--     player_blacklist). Voir NOTIFY en fin de fichier.

BEGIN;

-- ===========================================================================
-- 1) Table `blacklist_alerts`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.blacklist_alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,

  -- Entrée de blacklist à l'origine de l'alerte. SET NULL si l'entrée est
  -- supprimée plus tard : on conserve l'historique de la détection.
  blacklist_entry_id  uuid REFERENCES public.player_blacklist(id) ON DELETE SET NULL,

  -- Identité détectée (snapshot au moment de l'alerte).
  discord_user_id     text,        -- snowflake Discord numérique
  battle_tag          text,        -- battletag détecté
  display_name        text,        -- pseudo détecté

  -- Critère qui a déclenché CETTE alerte.
  matched_on          text NOT NULL
    CHECK (matched_on IN ('battle_tag', 'display_name', 'discord_user_id')),
  strength            text NOT NULL
    CHECK (strength IN ('strong', 'soft')),

  -- Liste complète des critères touchés [{matchedOn,strength}] (cas multi-match).
  criteria            jsonb,

  reason              text,        -- motif (repris de l'entrée blacklist au moment de l'alerte)

  -- Source de la détection + sous-contexte applicatif.
  source              text NOT NULL
    CHECK (source IN ('bot_scan', 'bot_member_add', 'registration')),
  context             text,        -- ex: guild_scan|guild_member_add|register|team_create|add_member

  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.blacklist_alerts IS
  'Audit append-only (multi-tenant) des détections de blacklist : qui a été matché, sur quel critère, par quelle source. Pas d''UPDATE. Service-role only.';
COMMENT ON COLUMN public.blacklist_alerts.tenant_id IS
  'Scope multi-tenant. Renseigné par l''API à l''écriture.';
COMMENT ON COLUMN public.blacklist_alerts.blacklist_entry_id IS
  'Entrée player_blacklist à l''origine de l''alerte (FK). SET NULL si l''entrée est supprimée — l''historique de détection est conservé.';
COMMENT ON COLUMN public.blacklist_alerts.discord_user_id IS
  'Snowflake Discord numérique détecté (snapshot au moment de l''alerte).';
COMMENT ON COLUMN public.blacklist_alerts.battle_tag IS
  'Battletag détecté (snapshot au moment de l''alerte).';
COMMENT ON COLUMN public.blacklist_alerts.display_name IS
  'Pseudo détecté (snapshot au moment de l''alerte).';
COMMENT ON COLUMN public.blacklist_alerts.matched_on IS
  'Critère qui a déclenché cette alerte : battle_tag | display_name | discord_user_id.';
COMMENT ON COLUMN public.blacklist_alerts.strength IS
  'Force du match : strong (battle_tag / discord_user_id) ou soft (display_name).';
COMMENT ON COLUMN public.blacklist_alerts.criteria IS
  'Liste complète des critères touchés [{matchedOn,strength}] (cas où plusieurs identifiants matchent).';
COMMENT ON COLUMN public.blacklist_alerts.reason IS
  'Motif repris de l''entrée blacklist au moment de l''alerte.';
COMMENT ON COLUMN public.blacklist_alerts.source IS
  'Source de la détection : bot_scan | bot_member_add | registration.';
COMMENT ON COLUMN public.blacklist_alerts.context IS
  'Sous-contexte applicatif (ex: guild_scan, guild_member_add, register, team_create, add_member).';

-- ===========================================================================
-- 2) Indexes
-- ===========================================================================

-- Consultation admin paginée des alertes récentes du tenant.
CREATE INDEX IF NOT EXISTS idx_blacklist_alerts_tenant_created_at
  ON public.blacklist_alerts (tenant_id, created_at DESC);

-- Filtre par membre détecté (scopé tenant).
CREATE INDEX IF NOT EXISTS idx_blacklist_alerts_tenant_discord_user_id
  ON public.blacklist_alerts (tenant_id, discord_user_id);

-- Support de la FK vers player_blacklist (jointures / suppression en cascade SET NULL).
CREATE INDEX IF NOT EXISTS idx_blacklist_alerts_blacklist_entry_id
  ON public.blacklist_alerts (blacklist_entry_id);

-- ===========================================================================
-- 3) RLS — default deny strict (service_role only, comme player_blacklist)
-- ===========================================================================
--
-- Activation RLS SANS aucune policy : ni anon ni authenticated ne lisent ou
-- n'écrivent. Tous les accès passent par supabaseAdmin (service_role bypass).
-- Pas de trigger updated_at : table append-only, aucun UPDATE attendu.

ALTER TABLE public.blacklist_alerts ENABLE ROW LEVEL SECURITY;

-- Pas de policy : service_role uniquement.

COMMIT;

-- ===========================================================================
-- 4) PostgREST schema cache reload
-- ===========================================================================
--
-- REQUIS : nouvelle table + nouvelle FK (blacklist_entry_id -> player_blacklist).
-- Sans reload, les embeds PostgREST et la résolution du schéma peuvent échouer
-- côté API.

NOTIFY pgrst, 'reload schema';
