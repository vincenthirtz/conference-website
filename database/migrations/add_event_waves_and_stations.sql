-- Migration: création des tables `event_waves`, `event_stations` + binding sur `event_segments`
-- Date: 2026-07-02
--
-- WHY:
--   Feature "waves + stations" de l'Event Director. Deux nouveaux concepts qui
--   se greffent sur la timeline run-of-show existante (event_runs +
--   event_segments) :
--
--     1. event_waves : une "vague" est un regroupement ordonné et minuté de
--        segments dans un event_run (ex. "Wave 1 – Poules", "Wave 2 – Bracket
--        haut"). Le Director démarre / termine / skip une wave ; le statut
--        upcoming | live | done | skipped suit le même vocabulaire que les
--        segments pour ne pas multiplier les enums côté UI/API.
--        planned_start_at + duration_min = planification indicative (pas un
--        timer dur ; la wave dure jusqu'à ce que le Director l'arrête).
--
--     2. event_stations : une "station" est un point de diffusion / poste
--        physique ou logique d'un event_run (ex. "Stream Main", "Stream FR
--        secondaire", "Poste caster 2"). status idle | in_use | offline.
--        Un segment peut être rattaché à une station pour indiquer où il est
--        diffusé.
--
--   Binding sur event_segments :
--     On ajoute deux FK nullables `wave_id` et `station_id` sur event_segments.
--     Un segment peut appartenir à une wave et/ou être diffusé sur une station,
--     ou ni l'un ni l'autre (rétro-compat : les segments existants restent à
--     NULL). ON DELETE SET NULL des deux côtés : supprimer une wave ou une
--     station ne détruit pas les segments — ils perdent juste leur binding et
--     le staff peut les requalifier.
--
--   Dénormalisation tenant_id (aligné sur event_segments / event_cues) :
--     tenant_id est strictement déductible via event_run_id → event_runs, mais
--     on le duplique sur event_waves + event_stations pour :
--       1. Filtre realtime direct sans JOIN (channels Supabase = filter SQL sur
--          une colonne de la table émettrice).
--       2. Queries admin "toutes les waves/stations du tenant X" sans JOIN.
--     Invariant "row.tenant_id == row.event_run.tenant_id" garanti côté API
--     (handlers admin set les deux à l'insert). Pas de trigger DB en V1
--     (cf. event_segments).
--
-- WHAT:
--   - CREATE TABLE event_waves (id uuid, tenant_id, event_run_id, ord, title,
--     planned_start_at, duration_min, status, started_at, ended_at, timestamps,
--     UNIQUE(event_run_id, ord) DEFERRABLE INITIALLY DEFERRED).
--   - CREATE TABLE event_stations (id uuid, tenant_id, event_run_id, ord, name,
--     stream_url, notes, status, timestamps).
--   - ALTER event_segments ADD COLUMN wave_id, station_id (FK ON DELETE SET NULL).
--   - Index sur les FK / hot paths + index partiels sur wave_id / station_id.
--   - Trigger updated_at sur les deux nouvelles tables (pattern event_segments).
--   - RLS default deny strict (ENABLE, aucune policy) sur les deux tables.
--
-- RLS — default deny strict (aligné sur event_segments / event_cues) :
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY SANS AUCUNE POLICY. Ces tables
--   sont accédées exclusivement via supabaseAdmin (service_role bypass RLS)
--   depuis les routes API authentifiées de l'Event Director. Pas de SELECT
--   anon/auth : l'exposition publique (vitrine fan) se fait via une route API
--   qui projette les colonnes safe, pas via accès Supabase client direct.
--   stream_url + notes peuvent contenir des URLs/consignes ops internes.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, ADD COLUMN IF NOT EXISTS, DROP
--     TRIGGER IF EXISTS avant CREATE.
--   - UNIQUE(event_run_id, ord) sur event_waves = DEFERRABLE INITIALLY DEFERRED
--     pour permettre à l'API de swapper deux ord en transaction sans violer
--     l'unique sur l'UPDATE intermédiaire.
--   - event_stations.ord = DEFAULT 0, PAS d'unique (plusieurs stations peuvent
--     partager un ord ; l'ordre d'affichage est indicatif, pas une position
--     stricte comme la timeline).
--   - PostgREST schema cache reload requis (2 nouvelles tables + 2 nouvelles FK
--     sur event_segments). Après apply, cliquer "Reload schema cache" dans
--     Dashboard Supabase → Settings → API si les embeds
--     (?select=*,event_waves(*)) renvoient "could not find relationship".
--   - Doit être appliquée APRÈS create_event_runs_table.sql ET
--     create_event_segments_table.sql (FK vers event_runs + ALTER event_segments).

BEGIN;

-- ===========================================================================
-- 1) Table `event_waves`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_waves (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dénormalisation volontaire (cf. WHY ci-dessus).
  tenant_id         uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  event_run_id      uuid NOT NULL
    REFERENCES public.event_runs(id) ON DELETE CASCADE,

  ord               integer NOT NULL,

  title             text NOT NULL,

  planned_start_at  timestamptz,

  duration_min      integer
    CHECK (duration_min IS NULL OR duration_min > 0),

  status            text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'live', 'done', 'skipped')),

  started_at        timestamptz,
  ended_at          timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Une seule position par run. DEFERRABLE INITIALLY DEFERRED pour permettre
  -- les swaps d'ord en transaction côté API (drag-drop).
  CONSTRAINT event_waves_run_ord_unique
    UNIQUE (event_run_id, ord) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE public.event_waves IS
  'Vagues ordonnées et minutées d''un event_run (regroupement de segments). Driven par l''Event Director.';
COMMENT ON COLUMN public.event_waves.tenant_id IS
  'Dénormalisé depuis event_runs.tenant_id (filtre realtime + queries admin sans JOIN). Maintenu cohérent par l''API.';
COMMENT ON COLUMN public.event_waves.event_run_id IS
  'Run auquel la wave appartient. FK ON DELETE CASCADE (suppression du run = suppression des waves).';
COMMENT ON COLUMN public.event_waves.ord IS
  'Position de la wave dans le run. Unique par event_run_id (contrainte DEFERRABLE pour les swaps).';
COMMENT ON COLUMN public.event_waves.planned_start_at IS
  'Heure de départ planifiée (indicative). NULL = non planifié. Pas un déclencheur automatique.';
COMMENT ON COLUMN public.event_waves.status IS
  'État de la wave : upcoming (à venir) | live (en cours) | done (terminée) | skipped (sautée par le Director).';

-- Hot path : "toutes les waves d'un run du tenant X, ordonnées".
CREATE INDEX IF NOT EXISTS idx_event_waves_tenant_run_ord
  ON public.event_waves (tenant_id, event_run_id, ord);

-- ===========================================================================
-- 2) Table `event_stations`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_stations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dénormalisation volontaire (cf. WHY ci-dessus).
  tenant_id         uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  event_run_id      uuid NOT NULL
    REFERENCES public.event_runs(id) ON DELETE CASCADE,

  ord               integer NOT NULL DEFAULT 0,

  name              text NOT NULL,

  stream_url        text,
  notes             text,

  status            text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'in_use', 'offline')),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_stations IS
  'Stations (points de diffusion / postes) d''un event_run. Un segment peut être rattaché à une station.';
COMMENT ON COLUMN public.event_stations.tenant_id IS
  'Dénormalisé depuis event_runs.tenant_id (filtre realtime + queries admin sans JOIN). Maintenu cohérent par l''API.';
COMMENT ON COLUMN public.event_stations.event_run_id IS
  'Run auquel la station appartient. FK ON DELETE CASCADE (suppression du run = suppression des stations).';
COMMENT ON COLUMN public.event_stations.ord IS
  'Ordre d''affichage indicatif (DEFAULT 0). Pas d''unique : plusieurs stations peuvent partager un ord.';
COMMENT ON COLUMN public.event_stations.status IS
  'État de la station : idle (libre) | in_use (occupée) | offline (hors ligne).';

-- Hot path : "toutes les stations d'un run du tenant X".
CREATE INDEX IF NOT EXISTS idx_event_stations_tenant_run
  ON public.event_stations (tenant_id, event_run_id);

-- ===========================================================================
-- 3) Binding sur `event_segments` : wave_id + station_id
-- ===========================================================================
--
-- FK nullables : un segment peut appartenir à une wave et/ou être diffusé sur
-- une station, ou ni l'un ni l'autre (rétro-compat des segments existants).
-- ON DELETE SET NULL : supprimer une wave/station ne détruit pas les segments.

ALTER TABLE public.event_segments
  ADD COLUMN IF NOT EXISTS wave_id uuid
    REFERENCES public.event_waves(id) ON DELETE SET NULL;

ALTER TABLE public.event_segments
  ADD COLUMN IF NOT EXISTS station_id uuid
    REFERENCES public.event_stations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_segments.wave_id IS
  'Wave à laquelle le segment est rattaché (NULL = aucune). SET NULL si la wave est supprimée.';
COMMENT ON COLUMN public.event_segments.station_id IS
  'Station sur laquelle le segment est diffusé (NULL = aucune). SET NULL si la station est supprimée.';

-- Index partiels sur les FK (advisor performance "unindexed_foreign_keys").
-- Partial pour ne pas indexer les segments non-bindés (majoritaires).
CREATE INDEX IF NOT EXISTS idx_event_segments_wave_id
  ON public.event_segments (wave_id)
  WHERE wave_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_segments_station_id
  ON public.event_segments (station_id)
  WHERE station_id IS NOT NULL;

-- ===========================================================================
-- 4) Triggers updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.event_waves_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_waves_updated_at ON public.event_waves;
CREATE TRIGGER trg_event_waves_updated_at
  BEFORE UPDATE ON public.event_waves
  FOR EACH ROW
  EXECUTE FUNCTION public.event_waves_set_updated_at();

CREATE OR REPLACE FUNCTION public.event_stations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_stations_updated_at ON public.event_stations;
CREATE TRIGGER trg_event_stations_updated_at
  BEFORE UPDATE ON public.event_stations
  FOR EACH ROW
  EXECUTE FUNCTION public.event_stations_set_updated_at();

-- ===========================================================================
-- 5) RLS — default deny strict (2 tables)
-- ===========================================================================
--
-- Activation RLS sans AUCUNE policy. Toutes les opérations passent par
-- supabaseAdmin (service_role bypass RLS) via les routes API authentifiées de
-- l'Event Director. Pas de SELECT anon/auth : stream_url + notes peuvent
-- contenir des URLs/consignes ops internes.

ALTER TABLE public.event_waves    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_stations ENABLE ROW LEVEL SECURITY;

-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

COMMIT;

-- ===========================================================================
-- 6) PostgREST schema cache reload
-- ===========================================================================
--
-- 2 nouvelles tables + 2 nouvelles FK sur event_segments (wave_id, station_id).
-- PostgREST doit recharger son cache pour exposer les tables et les embeds
-- (`?select=*,event_waves(*)` / `?select=*,event_stations(*)`).
--
-- Si l'API renvoie "could not find relationship" après l'apply, cliquer aussi
-- "Reload schema cache" dans Dashboard Supabase → Settings → API.

NOTIFY pgrst, 'reload schema';
