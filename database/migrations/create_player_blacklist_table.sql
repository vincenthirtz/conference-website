-- Migration: création de la table `player_blacklist` (feature Blacklist joueurs — Lot 1)
-- Date: 2026-06-25
-- Ref: docs/BLACKLIST_DESIGN.md (section "Modèle de données")
--
-- WHY:
--   Enregistrer les pseudos / battletags / comptes Discord bannis. Quand un
--   joueur banni s'inscrit (compte, équipe, ajout par capitaine), les admins
--   sont ALERTÉS — l'inscription n'est PAS bloquée (décision humaine ensuite).
--   Le bot Discord lit la liste (`active` du tenant) et scanne les membres du
--   serveur pour alerter si un pseudo banni y figure.
--
--   Trois critères de match :
--     - `battle_tag`      : match FORT (normalisé lowercase à l'écriture côté app).
--     - `discord_user_id` : match FORT (snowflake numérique).
--     - `display_name`    : match FAIBLE/soft (comparaison insensible casse via
--                           trigram — d'où l'index GIN pg_trgm).
--   Au moins un des trois doit être renseigné (CHECK), sinon l'entrée ne peut
--   matcher personne.
--
--   `active` permet un soft-disable (lever un ban sans perdre l'historique) ;
--   `banned_by` trace le staff auteur (FK auth.users, SET NULL si le compte
--   disparaît pour ne pas casser l'historique des bans).
--
-- RLS — default deny strict (même pattern que staff_logs / bot_player_actions) :
--   - RLS activé SANS aucune policy : ni anon ni authenticated n'y accèdent.
--   - Accès exclusivement via supabaseAdmin (service_role bypass RLS) :
--       * helper site `utils/moderation/blacklist.ts` (checkBlacklist),
--       * endpoints admin `pages/api/admin/moderation/blacklist/*`,
--       * endpoint bot `GET /api/bot/v1/moderation/blacklist`.
--     Aucune lecture client directe — la table contient des données de
--     modération internes (reason, notes, banned_by).
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, CREATE EXTENSION IF NOT EXISTS,
--     DROP/RECREATE pour contrainte + FK + trigger.
--   - Dépend de l'extension pg_trgm (créée ci-dessous si absente) pour l'index
--     trigram sur display_name (recherche fuzzy / insensible casse).
--   - `tenant_id` : scope multi-tenant, renseigné par l'API à l'écriture.
--   - PostgREST schema cache reload requis (nouvelle table + nouvelle FK vers
--     auth.users). Voir NOTIFY en fin de fichier.

BEGIN;

-- ===========================================================================
-- 0) Extension trigram (pour l'index fuzzy sur display_name)
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================================================
-- 1) Table `player_blacklist`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.player_blacklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,

  -- Critères de match. NULL autorisé individuellement mais le CHECK plus bas
  -- impose qu'au moins un des trois soit renseigné.
  battle_tag      text,        -- normalisé lowercase à l'écriture côté app
  display_name    text,        -- pseudo, comparé insensible casse / trigram
  discord_user_id text,        -- snowflake Discord numérique

  reason          text,        -- motif du ban (affiché côté admin / alerte)
  notes           text,        -- contexte interne staff

  -- Staff auteur du ban. SET NULL si le compte auth disparaît : on garde
  -- l'entrée de blacklist, on perd juste l'attribution.
  banned_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Soft-disable : un ban levé reste en base (active=false) pour l'historique.
  active          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Une entrée doit pouvoir matcher au moins un critère.
  CONSTRAINT player_blacklist_at_least_one_identifier_chk
    CHECK (
      battle_tag IS NOT NULL
      OR display_name IS NOT NULL
      OR discord_user_id IS NOT NULL
    )
);

COMMENT ON TABLE public.player_blacklist IS
  'Liste de modération (multi-tenant) : joueurs bannis matchés sur battle_tag / display_name / discord_user_id. Alerte (ne bloque pas) à l''inscription. Service-role only.';
COMMENT ON COLUMN public.player_blacklist.tenant_id IS
  'Scope multi-tenant. Renseigné par l''API à l''écriture.';
COMMENT ON COLUMN public.player_blacklist.battle_tag IS
  'Battletag banni, normalisé lowercase à l''écriture côté app. Match FORT.';
COMMENT ON COLUMN public.player_blacklist.display_name IS
  'Pseudo banni. Comparé en insensible casse / trigram. Match FAIBLE (soft).';
COMMENT ON COLUMN public.player_blacklist.discord_user_id IS
  'Snowflake Discord numérique banni. Match FORT.';
COMMENT ON COLUMN public.player_blacklist.reason IS
  'Motif du ban (affiché côté admin et dans l''alerte).';
COMMENT ON COLUMN public.player_blacklist.notes IS
  'Contexte interne staff (non destiné à être exposé publiquement).';
COMMENT ON COLUMN public.player_blacklist.banned_by IS
  'Staff auteur du ban (FK auth.users). SET NULL si le compte disparaît.';
COMMENT ON COLUMN public.player_blacklist.active IS
  'Soft-disable : false = ban levé, conservé pour historique. Seules les entrées active sont matchées.';

-- ===========================================================================
-- 2) Indexes
-- ===========================================================================

-- Lookup par battletag (match fort) scopé tenant.
CREATE INDEX IF NOT EXISTS idx_player_blacklist_tenant_battle_tag
  ON public.player_blacklist (tenant_id, battle_tag);

-- Lookup par discord_user_id (match fort) scopé tenant.
CREATE INDEX IF NOT EXISTS idx_player_blacklist_tenant_discord_user_id
  ON public.player_blacklist (tenant_id, discord_user_id);

-- Filtre "entrées actives du tenant" (lecture bot + listing admin).
CREATE INDEX IF NOT EXISTS idx_player_blacklist_tenant_active
  ON public.player_blacklist (tenant_id, active);

-- Match faible sur display_name : recherche fuzzy / insensible casse via trigram.
CREATE INDEX IF NOT EXISTS idx_player_blacklist_display_name_trgm
  ON public.player_blacklist USING gin (display_name gin_trgm_ops);

-- ===========================================================================
-- 3) Trigger updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.player_blacklist_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_blacklist_updated_at ON public.player_blacklist;
CREATE TRIGGER trg_player_blacklist_updated_at
  BEFORE UPDATE ON public.player_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.player_blacklist_set_updated_at();

-- ===========================================================================
-- 4) RLS — default deny strict (service_role only, comme staff_logs)
-- ===========================================================================
--
-- Activation RLS SANS aucune policy : ni anon ni authenticated ne lisent ou
-- n'écrivent. Tous les accès passent par supabaseAdmin (service_role bypass).

ALTER TABLE public.player_blacklist ENABLE ROW LEVEL SECURITY;

-- Pas de policy : service_role uniquement.

COMMIT;

-- ===========================================================================
-- 5) PostgREST schema cache reload
-- ===========================================================================
--
-- REQUIS : nouvelle table + nouvelle FK (banned_by -> auth.users). Sans reload,
-- les embeds PostgREST et la résolution du schéma peuvent échouer côté API.

NOTIFY pgrst, 'reload schema';
