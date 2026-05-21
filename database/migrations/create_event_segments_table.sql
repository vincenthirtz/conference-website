-- Migration: création de la table `event_segments` (feature run-of-show)
-- Date: 2026-05-21
--
-- WHY:
--   Deuxième brique de la feature "Run-of-show". Un `event_segment` est une
--   tranche de la timeline d'un `event_run` : intro, match, pause, outro,
--   ou bloc custom. Le Director (staff) drag-drop, Start/Skip/End chaque
--   segment ; le Cockpit caster lit l'état en temps réel pour afficher
--   briefing + checklist + scénario.
--
--   Le segment porte aussi :
--     - `broadcast_message` (jsonb) : payload optionnel pour fan-out
--       Discord/push/email au moment où le segment passe live (consommé par
--       les handlers admin qui pondent dans `bot_event_outbox` +
--       `push_subscriptions`).
--     - `caster_checklist` (jsonb array) : items que le caster coche depuis
--       son cockpit (ex. "scène OBS prête", "micro testé"). Chaque item
--       garde `checked_by_user_id` + `checked_at` pour audit.
--
--   Dénormalisation de `tenant_id` :
--     - Strictement déductible via event_run_id → event_runs.tenant_id,
--       mais on duplique pour deux raisons concrètes :
--       1. RLS / filtre realtime : Supabase Realtime channels sont scopés
--          par filter SQL, et filtrer sur `tenant_id` directement sur la
--          table émettrice est moins coûteux que de joindre via event_runs.
--       2. Queries admin "tous les segments du tenant X" sans avoir besoin
--          d'un JOIN systématique.
--     - L'invariant "segment.tenant_id == segment.event_run.tenant_id" est
--       garanti côté API (handlers admin set les deux à l'insert). Pas de
--       trigger DB en V1 pour éviter de pénaliser l'INSERT ; à ajouter si on
--       constate des dérives.
--
-- CONTRAINTES MÉTIER (CHECK) :
--   - type='match' implique match_id NOT NULL.
--   - type != 'match' n'impose rien sur match_id (en pratique NULL mais
--     on ne contraint pas pour éviter un cas d'usage exotique futur).
--   - UNIQUE (event_run_id, ord) : un seul segment par position dans la
--     timeline. DEFERRABLE INITIALLY IMMEDIATE pour permettre à l'API de
--     swapper deux ord en transaction (SET CONSTRAINTS ALL DEFERRED ; UPDATE
--     a SET ord=temp ; UPDATE b SET ord=a.ord ; UPDATE a SET ord=b.ord ;
--     COMMIT). Sans DEFERRABLE, l'UPDATE intermédiaire violerait l'unique.
--
-- RLS — pattern aligné sur event_runs MAIS plus strict :
--   - PAS de SELECT anon/auth. La table porte des colonnes potentiellement
--     sensibles (broadcast_message = brouillons de messages internes,
--     caster_checklist = items ops avec checked_by_user_id audit).
--     L'exposition publique de la timeline pour les fans se fait via une
--     route API qui projette uniquement les colonnes safe (ord, type, title,
--     duration_min, status) — pas via accès Supabase client direct.
--   - Mutations : supabaseAdmin uniquement (service_role bypass).
--   - Le Cockpit caster PWA passe lui aussi par une route API authentifiée
--     (avec auth check caster) qui lit la table via supabaseAdmin.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout.
--   - Réordonnancement : si la lib UI ne fait pas de transaction explicite
--     pour les swaps, l'API doit envelopper les UPDATE consécutifs dans une
--     transaction + SET CONSTRAINTS ALL DEFERRED (cf. note ci-dessus).
--   - broadcast_message jsonb : shape attendue `{ discord?: string,
--     push_title?: string, push_body?: string, email_subject?: string }`.
--     Pas de validation DB-side — le handler admin doit valider (Zod côté
--     API). Une row sans broadcast_message = pas de broadcast au passage live.
--   - caster_checklist jsonb : array d'objets `{ key, label,
--     checked_by_user_id?, checked_at? }`. Default '[]' évite les NULL côté
--     consommateur.
--   - PostgREST schema cache reload requis (nouvelle table + FK vers
--     event_runs et matches).
--   - Match dépendance : doit être appliquée APRÈS create_event_runs_table.sql.

BEGIN;

-- ===========================================================================
-- 1) Table `event_segments`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_segments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_run_id      uuid NOT NULL
    REFERENCES public.event_runs(id) ON DELETE CASCADE,

  -- Dénormalisation volontaire (cf. WHY ci-dessus).
  tenant_id         uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  ord               integer NOT NULL,

  type              text NOT NULL
    CHECK (type IN ('match', 'break', 'intro', 'outro', 'custom')),

  -- Nullable : seul un segment de type 'match' référence un match.
  -- ON DELETE SET NULL : si le match est supprimé (rare), le segment reste
  -- dans la timeline mais perd son binding ; le staff peut alors le
  -- requalifier ou le supprimer.
  match_id          uuid
    REFERENCES public.matches(id) ON DELETE SET NULL,

  title             text NOT NULL,
  duration_min      integer,

  status            text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'live', 'done', 'skipped')),

  started_at        timestamptz,
  ended_at          timestamptz,

  -- Payload broadcast déclenché à l'entrée en 'live'. Voir doc above pour shape.
  broadcast_message jsonb,

  -- Checklist caster. Voir doc above pour shape.
  caster_checklist  jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Invariant : un segment 'match' doit pointer vers un match concret.
  CONSTRAINT event_segments_match_requires_id_chk
    CHECK (
      (type = 'match' AND match_id IS NOT NULL)
      OR (type <> 'match')
    ),

  -- duration_min positive si fournie (pas de check sur NULL).
  CONSTRAINT event_segments_duration_positive_chk
    CHECK (duration_min IS NULL OR duration_min > 0),

  -- Une seule position par run. DEFERRABLE pour permettre les swaps en
  -- transaction côté API drag-drop.
  CONSTRAINT event_segments_run_ord_unique
    UNIQUE (event_run_id, ord) DEFERRABLE INITIALLY IMMEDIATE
);

COMMENT ON TABLE public.event_segments IS
  'Segments ordonnés d''un event_run (timeline run-of-show). Driven par le Director, consommé par le Cockpit caster.';
COMMENT ON COLUMN public.event_segments.event_run_id IS
  'Run auquel le segment appartient. FK ON DELETE CASCADE (suppression du run = suppression de la timeline).';
COMMENT ON COLUMN public.event_segments.tenant_id IS
  'Dénormalisé depuis event_runs.tenant_id pour RLS realtime + filtres directs sans JOIN. Maintenu cohérent par l''API.';
COMMENT ON COLUMN public.event_segments.ord IS
  'Position dans la timeline (0-indexed ou 1-indexed selon convention API). Unique par event_run_id.';
COMMENT ON COLUMN public.event_segments.type IS
  'Type de segment : match | break | intro | outro | custom.';
COMMENT ON COLUMN public.event_segments.match_id IS
  'Match associé si type=match. NULL pour les autres types. SET NULL si le match est supprimé.';
COMMENT ON COLUMN public.event_segments.duration_min IS
  'Durée indicative en minutes (planification). Pas un timer dur : le segment dure jusqu''à ce que le Director l''arrête.';
COMMENT ON COLUMN public.event_segments.status IS
  'État du segment : upcoming (à venir) | live (en cours) | done (terminé) | skipped (sauté par le Director).';
COMMENT ON COLUMN public.event_segments.broadcast_message IS
  'Payload optionnel pour fan-out Discord/push/email à l''entrée en live. Shape : { discord?, push_title?, push_body?, email_subject? }.';
COMMENT ON COLUMN public.event_segments.caster_checklist IS
  'Array d''items checklist : [{ key, label, checked_by_user_id?, checked_at? }]. Default [].';

-- ===========================================================================
-- 2) Indexes
-- ===========================================================================

-- Hot path realtime : "tous les segments live du tenant X" (Supabase Realtime
-- channel filter par tenant_id, puis client filtre par event_run_id côté JS).
CREATE INDEX IF NOT EXISTS idx_event_segments_tenant_status
  ON public.event_segments (tenant_id, status);

-- Hot path timeline load : "tous les segments d'un run, ordonnés".
-- DÉJÀ COUVERT par l'index unique implicite créé par le CONSTRAINT
-- event_segments_run_ord_unique sur (event_run_id, ord). Pas de
-- CREATE INDEX redondant ici (cf. drop_duplicate_indexes.sql qui nettoie
-- précisément ce genre de doublon).

-- Index sur la FK match_id (advisor performance "unindexed_foreign_keys").
-- Partial pour ne pas indexer les rows non-match (~80% des segments).
CREATE INDEX IF NOT EXISTS idx_event_segments_match_id
  ON public.event_segments (match_id)
  WHERE match_id IS NOT NULL;

-- ===========================================================================
-- 3) Trigger updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.event_segments_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_segments_updated_at ON public.event_segments;
CREATE TRIGGER trg_event_segments_updated_at
  BEFORE UPDATE ON public.event_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.event_segments_set_updated_at();

-- ===========================================================================
-- 4) RLS — default deny strict
-- ===========================================================================
--
-- Activation RLS sans AUCUNE policy. Justification (cf. note above) :
-- caster_checklist + broadcast_message peuvent contenir des données
-- staff/caster internes (audit, brouillons). On ne les expose pas en lecture
-- anon — l'API publique projettera proprement les colonnes safe pour la
-- vitrine fan.

ALTER TABLE public.event_segments ENABLE ROW LEVEL SECURITY;

-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

COMMIT;

-- ===========================================================================
-- 5) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
