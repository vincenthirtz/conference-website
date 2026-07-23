-- Migration: création de la table `entity_blacklist` (feature Blacklist entités — équipes / structures)
-- Date: 2026-07-23
-- Ref: docs/BLACKLIST_DESIGN.md
--
-- WHY:
--   Pendant « entités » de la blacklist joueurs (`player_blacklist`) :
--   enregistrer les noms d'équipes ('team') et de structures/associations
--   ('org') bannis. Quand une équipe est créée avec un nom qui matche une
--   entrée active, les admins sont ALERTÉS via l'event outbox
--   `registration.entity_blacklisted` — la création n'est PAS bloquée (même
--   décision produit que la blacklist joueurs : décision humaine ensuite).
--
--   Critère de match unique : `name`.
--     - Égalité exacte insensible casse         : match FORT.
--     - Inclusion dans un sens ou dans l'autre  : match FAIBLE (soft).
--   Le matching se fait en JS côté helper (la liste est petite) ; l'index GIN
--   trigram ci-dessous sert la recherche admin, pas le check de création.
--
--   `active` permet un soft-disable (lever un ban sans perdre l'historique) ;
--   `banned_by` trace le staff auteur (FK auth.users, SET NULL si le compte
--   disparaît pour ne pas casser l'historique des bans).
--
-- RLS — default deny strict (même pattern que player_blacklist / staff_logs) :
--   - RLS activé SANS aucune policy : ni anon ni authenticated n'y accèdent.
--   - Accès exclusivement via supabaseAdmin (service_role bypass RLS) :
--       * helper site de check à la création d'équipe,
--       * endpoints admin de gestion de la blacklist.
--     Aucune lecture client directe — la table contient des données de
--     modération internes (reason, notes, banned_by).
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, CREATE EXTENSION IF NOT EXISTS,
--     DROP/RECREATE pour le trigger.
--   - Dépend de l'extension pg_trgm (créée ci-dessous si absente) pour l'index
--     trigram sur name (recherche fuzzy / insensible casse côté admin).
--   - `tenant_id` : scope multi-tenant, renseigné par l'API à l'écriture.
--   - PostgREST schema cache reload requis (nouvelle table + nouvelle FK vers
--     auth.users). Voir NOTIFY en fin de fichier.

BEGIN;

-- ===========================================================================
-- 0) Extension trigram (pour l'index fuzzy sur name)
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================================================
-- 1) Table `entity_blacklist`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.entity_blacklist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,

  -- Type d'entité bannie : 'team' = équipe, 'org' = structure/association.
  entity_type text NOT NULL CHECK (entity_type IN ('team', 'org')),

  -- Nom banni. Comparé insensible casse + inclusion côté app (helper JS) :
  -- exact insensible casse = match FORT, inclusion = match FAIBLE.
  name        text NOT NULL,

  reason      text,        -- motif du ban (affiché côté admin / alerte)
  notes       text,        -- contexte interne staff

  -- Staff auteur du ban. SET NULL si le compte auth disparaît : on garde
  -- l'entrée de blacklist, on perd juste l'attribution.
  banned_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Soft-disable : un ban levé reste en base (active=false) pour l'historique.
  active      boolean NOT NULL DEFAULT true,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.entity_blacklist IS
  'Liste de modération (multi-tenant) : équipes / structures bannies matchées sur name (insensible casse + inclusion, côté app). Alerte (ne bloque pas) à la création d''équipe. Service-role only.';
COMMENT ON COLUMN public.entity_blacklist.tenant_id IS
  'Scope multi-tenant. Renseigné par l''API à l''écriture.';
COMMENT ON COLUMN public.entity_blacklist.entity_type IS
  'Type d''entité bannie : ''team'' = équipe, ''org'' = structure/association.';
COMMENT ON COLUMN public.entity_blacklist.name IS
  'Nom banni. Comparé côté app : exact insensible casse = match FORT, inclusion dans un sens ou l''autre = match FAIBLE.';
COMMENT ON COLUMN public.entity_blacklist.reason IS
  'Motif du ban (affiché côté admin et dans l''alerte).';
COMMENT ON COLUMN public.entity_blacklist.notes IS
  'Contexte interne staff (non destiné à être exposé publiquement).';
COMMENT ON COLUMN public.entity_blacklist.banned_by IS
  'Staff auteur du ban (FK auth.users). SET NULL si le compte disparaît.';
COMMENT ON COLUMN public.entity_blacklist.active IS
  'Soft-disable : false = ban levé, conservé pour historique. Seules les entrées active sont matchées.';

-- ===========================================================================
-- 2) Indexes
-- ===========================================================================

-- Filtre "entrées actives du tenant" (check création équipe + listing admin).
CREATE INDEX IF NOT EXISTS idx_entity_blacklist_tenant_active
  ON public.entity_blacklist (tenant_id, active);

-- Filtre par type d'entité scopé tenant.
CREATE INDEX IF NOT EXISTS idx_entity_blacklist_tenant_entity_type
  ON public.entity_blacklist (tenant_id, entity_type);

-- Recherche admin sur name : fuzzy / insensible casse via trigram.
CREATE INDEX IF NOT EXISTS idx_entity_blacklist_name_trgm
  ON public.entity_blacklist USING gin (name gin_trgm_ops);

-- ===========================================================================
-- 3) Trigger updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.entity_blacklist_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entity_blacklist_updated_at ON public.entity_blacklist;
CREATE TRIGGER trg_entity_blacklist_updated_at
  BEFORE UPDATE ON public.entity_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.entity_blacklist_set_updated_at();

-- ===========================================================================
-- 4) RLS — default deny strict (service_role only, comme player_blacklist)
-- ===========================================================================
--
-- Activation RLS SANS aucune policy : ni anon ni authenticated ne lisent ou
-- n'écrivent. Tous les accès passent par supabaseAdmin (service_role bypass).

ALTER TABLE public.entity_blacklist ENABLE ROW LEVEL SECURITY;

-- Pas de policy : service_role uniquement.

COMMIT;

-- ===========================================================================
-- 5) PostgREST schema cache reload
-- ===========================================================================
--
-- REQUIS : nouvelle table + nouvelle FK (banned_by -> auth.users). Sans reload,
-- les embeds PostgREST et la résolution du schéma peuvent échouer côté API.

NOTIFY pgrst, 'reload schema';
