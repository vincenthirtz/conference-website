-- Migration: scrim plannings (grille de disponibilités partagée « When2Meet »)
-- Date: 2026-07-09
--
-- WHY:
--   Nouveau mode de planification de scrim, PARALLÈLE à la négociation
--   « ping-pong » existante (demandes.payload.scrim_nego, intacte). Un admin
--   ouvre une SESSION de planning entre deux équipes ; les 2 équipes ET le
--   staff (casters/arbitres) « peignent » leurs créneaux disponibles sur une
--   grille de dates concrètes (~3 semaines glissantes). L'overlap s'affiche en
--   heatmap ; l'admin clique un créneau commun → un `scrims` scheduled est créé.
--
--   Deux tables :
--     1. scrim_plannings              — la session (config de grille + statut)
--     2. scrim_planning_availabilities — 1 ligne par participant (JSONB d'ISO)
--
--   Un slot = chaîne ISO datetime EXACTE (même logique que scrim_nego.slots).
--   Les dispos sont un tableau JSONB d'ISO par participant (pas 1 ligne/slot).
--   L'overlap est calculé côté client à partir des lignes brutes.
--
-- RLS — default deny STRICT (aligné sur player_ratings / event_segments) :
--   - ENABLE ROW LEVEL SECURITY + AUCUNE policy → anon + authenticated bloqués.
--   - Seul service_role (supabaseAdmin) passe. Toutes les lectures/écritures
--     transitent par des routes API authentifiées (admin staff-gated + joueur
--     Bearer avec résolution de « partie »). La grille n'est JAMAIS lue par un
--     client Supabase anon/auth direct.
--
-- SCHEMA / CHOIX :
--   - PK uuid gen_random_uuid() (aligné tables sœurs).
--   - tenant_id -> tenants(id) ON DELETE RESTRICT.
--   - team1_id/team2_id -> teams(id) ON DELETE CASCADE (session sans équipe
--     n'a pas de sens) + CHECK team1 <> team2.
--   - source_demande_id -> demandes(id) ON DELETE SET NULL (session éventuellement
--     issue d'une négociation ; unique partiel = 1 planning par négociation).
--   - scrim_id -> scrims(id) ON DELETE SET NULL (back-ref posé à la validation).
--     La FK inverse scrims.source_planning_id est ajoutée en migration B (FK
--     circulaire ⇒ 2 migrations).
--   - Config de grille figée sur la session : horizon_start/days, slot_minutes,
--     day_start_min/day_end_min, timezone. Défaut 21 jours, 30 min, 16h→24h.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, DROP TRIGGER IF EXISTS avant CREATE.
--   - Dépendances : APRÈS l'existence de `tenants`, `teams`, `demandes`, `scrims`.
--   - PostgREST schema cache reload REQUIS (nouvelles tables + FK). Le NOTIFY
--     final le déclenche ; sinon « Reload schema cache » dans le Dashboard.

BEGIN;

-- ===========================================================================
-- 0) Fonction utilitaire updated_at partagée par les tables de cette migration
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.scrim_plannings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 1) scrim_plannings — la session de planning (config de grille + statut)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.scrim_plannings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  created_by        uuid,
  team1_id          uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  team2_id          uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  source_demande_id uuid
    REFERENCES public.demandes(id) ON DELETE SET NULL,
  -- back-ref posé à la validation ; FK inverse en migration B.
  scrim_id          uuid
    REFERENCES public.scrims(id) ON DELETE SET NULL,
  title             text,
  game              text,
  status            text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'validated', 'cancelled', 'closed')),
  -- Géométrie de la grille (les slots peints sont des instants absolus ISO).
  horizon_start     date NOT NULL,
  horizon_days      integer NOT NULL DEFAULT 21
    CHECK (horizon_days BETWEEN 1 AND 42),
  slot_minutes      integer NOT NULL DEFAULT 30
    CHECK (slot_minutes IN (30, 60)),
  day_start_min     integer NOT NULL DEFAULT 960
    CHECK (day_start_min BETWEEN 0 AND 1440),
  day_end_min       integer NOT NULL DEFAULT 1440
    CHECK (day_end_min > day_start_min AND day_end_min <= 1440),
  timezone          text NOT NULL DEFAULT 'Europe/Paris',
  validated_slot    timestamptz,
  is_public         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  CONSTRAINT scrim_plannings_distinct_teams
    CHECK (team1_id <> team2_id)
);

COMMENT ON TABLE public.scrim_plannings IS
  'Session de planning de scrim (grille de dispos partagée). Les 2 équipes + le staff peignent des créneaux ; l''admin valide → crée un scrims scheduled.';
COMMENT ON COLUMN public.scrim_plannings.day_start_min IS
  'Début de la bande horaire peinte, en minutes depuis minuit (défaut 960 = 16h).';
COMMENT ON COLUMN public.scrim_plannings.day_end_min IS
  'Fin de la bande horaire peinte, en minutes depuis minuit (défaut 1440 = 24h).';
COMMENT ON COLUMN public.scrim_plannings.scrim_id IS
  'scrims créé lors de la validation (back-ref). NULL tant que non validé.';

-- 1 seul planning par négociation source.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_scrim_plannings_source_demande
  ON public.scrim_plannings (source_demande_id)
  WHERE source_demande_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scrim_plannings_tenant_status
  ON public.scrim_plannings (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_scrim_plannings_tenant_team1
  ON public.scrim_plannings (tenant_id, team1_id);
CREATE INDEX IF NOT EXISTS idx_scrim_plannings_tenant_team2
  ON public.scrim_plannings (tenant_id, team2_id);
CREATE INDEX IF NOT EXISTS idx_scrim_plannings_deleted_at
  ON public.scrim_plannings (deleted_at)
  WHERE deleted_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_scrim_plannings_updated_at ON public.scrim_plannings;
CREATE TRIGGER trg_scrim_plannings_updated_at
  BEFORE UPDATE ON public.scrim_plannings
  FOR EACH ROW
  EXECUTE FUNCTION public.scrim_plannings_set_updated_at();

ALTER TABLE public.scrim_plannings ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 2) scrim_planning_availabilities — 1 ligne par participant (JSONB d'ISO)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.scrim_planning_availabilities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  planning_id   uuid NOT NULL
    REFERENCES public.scrim_plannings(id) ON DELETE CASCADE,
  party         text NOT NULL
    CHECK (party IN ('team1', 'team2', 'staff')),
  user_id       uuid NOT NULL,
  -- Dénormalisé pour l'attribution au survol (« qui est dispo »).
  display_name  text,
  slots         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- 1 ligne de peinture par utilisateur et par session (cible d'upsert).
  CONSTRAINT scrim_planning_avail_unique
    UNIQUE (planning_id, user_id)
);

COMMENT ON TABLE public.scrim_planning_availabilities IS
  'Dispos peintes par un participant sur une session de planning. slots = tableau JSONB d''ISO datetime. Une partie « staff » peut avoir plusieurs lignes (fusionnées côté calcul overlap).';

CREATE INDEX IF NOT EXISTS idx_scrim_planning_avail_planning
  ON public.scrim_planning_availabilities (planning_id);
CREATE INDEX IF NOT EXISTS idx_scrim_planning_avail_tenant_planning
  ON public.scrim_planning_availabilities (tenant_id, planning_id);

DROP TRIGGER IF EXISTS trg_scrim_planning_avail_updated_at
  ON public.scrim_planning_availabilities;
CREATE TRIGGER trg_scrim_planning_avail_updated_at
  BEFORE UPDATE ON public.scrim_planning_availabilities
  FOR EACH ROW
  EXECUTE FUNCTION public.scrim_plannings_set_updated_at();

ALTER TABLE public.scrim_planning_availabilities ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

COMMIT;

-- ===========================================================================
-- 3) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
