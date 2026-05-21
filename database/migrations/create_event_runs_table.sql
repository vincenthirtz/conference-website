-- Migration: création de la table `event_runs` (feature run-of-show)
-- Date: 2026-05-21
--
-- WHY:
--   Première brique de la feature "Run-of-show" (Caster Cockpit + Live
--   Director). Un `event_run` représente une instance d'événement diffusé :
--   un soir de tournoi, un show, une finale, etc. Il porte une timeline
--   ordonnée de `event_segments` (créés par la migration sœur) que le staff
--   pilote en live et que les casters consomment via leur cockpit PWA.
--
--   Pourquoi une table dédiée plutôt que de coller ça sur `tournaments` :
--     - Un même tournament peut générer plusieurs runs (soirée 1, soirée 2,
--       grande finale rediff). Le run capture l'instance temporelle.
--     - Tournament = container compétitif ; event_run = container diffusion.
--       Les deux ont des durées de vie distinctes (un tournoi vit des
--       semaines, un run vit quelques heures).
--     - Permet aussi de modéliser un event "show" sans tournament associé
--       (ex. présentation patch notes, AMA staff) → pas de FK obligatoire
--       vers tournaments.
--
--   Le `slug` sert d'URL publique stable (`/live/[slug]` côté fan, ou
--   `/caster/cockpit?event=<slug>` côté caster). Unique par tenant pour
--   permettre à 2 tenants d'avoir le même slug (`finale-2026`) sans
--   collision cross-tenant.
--
-- PATTERN tenant-scoped (cf. `add_tenant_id_to_tier1_tables.sql` +
--   `enforce_tenant_id_not_null_and_fk.sql`) :
--     - tenant_id uuid NOT NULL dès la création (pas de phase nullable :
--       la table naît en multi-tenant, aucune row legacy à backfill).
--     - FK vers tenants(id) ON DELETE RESTRICT (aligné sur le pattern
--       dominant des 30+ tables tenant-scoped existantes : suppression
--       d'un tenant est bloquée tant qu'il a des event_runs).
--     - Index sur tenant_id implicite via l'index composite plus loin.
--
-- RLS DECISION (alignée sur le pattern hybride existant) :
--   - RLS enabled (obligatoire pour les tables scoped).
--   - Policy SELECT anon/authenticated : status = 'live' uniquement.
--     Justification : la page fan publique `/live/[slug]` doit pouvoir lire
--     l'event en SSR ou côté client (Supabase Realtime) sans authentification.
--     Limiter à `status='live'` évite de leaker les drafts staff.
--   - PAS de policy ALL/INSERT/UPDATE/DELETE pour anon/auth : les mutations
--     passent obligatoirement par les routes admin/director (S2) via
--     supabaseAdmin (service_role bypass RLS). Cohérent avec
--     `enable_rls_baseline_tables.sql` (default deny, service_role only).
--   - Le scoping tenant_id à la lecture/écriture est assuré côté
--     applicatif (filter `.eq('tenant_id', tenantId)` dans tous les
--     handlers admin), comme pour les 30 autres tables scoped — cf. la
--     décision "option A" documentée dans `enforce_tenant_id_not_null_and_fk.sql`.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout.
--   - PostgREST schema cache reload requis (nouvelle table + FK vers tenants).
--   - UNIQUE (tenant_id, slug) — un même tenant ne peut pas avoir 2 runs
--     avec le même slug, mais 2 tenants peuvent partager un slug.
--   - status CHECK volontairement restreint à 3 valeurs (draft/live/done).
--     Pas de 'cancelled' / 'paused' en V1 — à ajouter via migration ALTER
--     CONSTRAINT si le besoin émerge.
--   - started_at / ended_at sont remplis par le handler quand le staff
--     déclenche Start / End run (l'event devient 'live' puis 'done').

BEGIN;

-- ===========================================================================
-- 1) Table `event_runs`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id    uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  name         text NOT NULL,
  slug         text NOT NULL,
  description  text,

  scheduled_at timestamptz NOT NULL,

  status       text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'done')),

  started_at   timestamptz,
  ended_at     timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Un slug unique par tenant. PostgREST exposera la contrainte sous le nom
  -- `event_runs_tenant_id_slug_key`.
  CONSTRAINT event_runs_tenant_slug_unique UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE public.event_runs IS
  'Instance d''événement diffusé (run-of-show). Porte la timeline event_segments + l''état live/draft/done. Tenant-scoped.';
COMMENT ON COLUMN public.event_runs.tenant_id IS
  'Tenant propriétaire. FK vers tenants(id) ON DELETE RESTRICT.';
COMMENT ON COLUMN public.event_runs.slug IS
  'Identifiant URL public stable (ex. `finale-printemps-2026`). Unique par tenant.';
COMMENT ON COLUMN public.event_runs.status IS
  'État du run : draft (en prépa, invisible public) | live (en diffusion) | done (archivé).';
COMMENT ON COLUMN public.event_runs.scheduled_at IS
  'Date/heure prévue de début. Sert au tri du listing admin et à la query "live now / upcoming".';
COMMENT ON COLUMN public.event_runs.started_at IS
  'Timestamp réel du passage à status=live (déclenché par le Director). NULL tant que draft.';
COMMENT ON COLUMN public.event_runs.ended_at IS
  'Timestamp réel du passage à status=done. NULL tant que pas terminé.';

-- ===========================================================================
-- 2) Indexes
-- ===========================================================================
--
-- (tenant_id, status, scheduled_at) sert deux hot paths :
--   - "live now" : WHERE tenant_id = $1 AND status = 'live'
--   - listing admin trié : WHERE tenant_id = $1 ORDER BY scheduled_at DESC
-- L'index composite couvre les deux (le planner peut faire un index-only scan
-- pour le filtrage par tenant_id seul aussi).

CREATE INDEX IF NOT EXISTS idx_event_runs_tenant_status_scheduled
  ON public.event_runs (tenant_id, status, scheduled_at DESC);

-- ===========================================================================
-- 3) Trigger updated_at
-- ===========================================================================
--
-- Pattern par-table (cf. scrims_set_updated_at, match_score_reports_set_updated_at) :
-- chaque table a sa propre fonction trigger avec search_path verrouillé
-- (cf. fix_function_search_path.sql — règle linter 0011).

CREATE OR REPLACE FUNCTION public.event_runs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_runs_updated_at ON public.event_runs;
CREATE TRIGGER trg_event_runs_updated_at
  BEFORE UPDATE ON public.event_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.event_runs_set_updated_at();

-- ===========================================================================
-- 4) RLS — default deny + policy SELECT publique pour les runs 'live'
-- ===========================================================================
--
-- Activation RLS sans policy = anon/auth bloqués sauf via SELECT 'live'.
-- Toutes les mutations passent par les routes admin (S2) via supabaseAdmin
-- (service_role bypass RLS), avec scoping applicatif sur tenant_id.

ALTER TABLE public.event_runs ENABLE ROW LEVEL SECURITY;

-- SELECT public : uniquement les runs actuellement en live.
-- Les drafts (en prépa interne) et les done (archive) restent invisibles
-- au public — pour les afficher en page archive, ça passera par une route
-- API publique qui filtre proprement côté serveur.
DROP POLICY IF EXISTS event_runs_anon_read_live ON public.event_runs;
CREATE POLICY event_runs_anon_read_live
  ON public.event_runs
  FOR SELECT
  TO anon, authenticated
  USING (status = 'live');

-- Pas de policy INSERT/UPDATE/DELETE : ces ops passent par supabaseAdmin
-- qui bypass RLS. Toute tentative depuis anon/auth est refusée.

COMMIT;

-- ===========================================================================
-- 5) PostgREST schema cache reload
-- ===========================================================================
--
-- Nouvelle table + nouvelle FK vers tenants. PostgREST doit recharger son
-- cache pour exposer la table et permettre les embeds éventuels
-- (`?select=*,event_segments(*)` après migration sœur).
--
-- Si l'API renvoie "could not find relationship" après l'apply, cliquer
-- aussi "Reload schema cache" dans Dashboard Supabase → Settings → API.

NOTIFY pgrst, 'reload schema';
