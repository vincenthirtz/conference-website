-- Migration: scrim_searches — recherches de scrim DATÉES et PÉRISSABLES
-- Date: 2026-07-31
--
-- WHY (R5 du backlog réseau, cf. docs/BACKLOG-reseau-esport.md) :
--   La seule façon pour une équipe de dire « on cherche un scrim » était le
--   booléen `teams.open_for_scrim`. Un booléen ne porte NI date NI péremption :
--     - une équipe qui l'active et l'oublie devient un faux positif permanent
--       (au 2026-07-31 : 1 équipe sur 9 « ouverte », 0 scrim jamais joué) ;
--     - une équipe qui cherche ponctuellement ne peut pas exprimer
--       « jeudi 21 h, BO3 » — l'info la plus utile de tout le système.
--
--   Une RECHERCHE porte donc des créneaux concrets et expire toute seule. Le
--   booléen `teams.open_for_scrim` devient un DÉRIVÉ (« a au moins une
--   recherche active »), maintenu par l'API : on ne casse aucune des surfaces
--   qui le lisent déjà (page publique /scrim, annuaire, dashboard).
--
-- MODÈLE :
--   - `slots` : tableau JSONB d'ISO datetimes — MÊME convention que
--     `demandes.payload.scrim_nego.slots` et `scrim_planning_availabilities`.
--     On ne réinvente pas un type créneau : un slot est une chaîne ISO exacte.
--   - `expires_at` : borne de validité. Par défaut le dernier créneau + 2 h
--     (posé par l'API, pas par la DB : la règle est métier). Une recherche
--     expirée n'est plus listée ni notifiée — sans suppression (historique).
--   - `status` : 'active' | 'fulfilled' | 'cancelled'. `fulfilled` quand un
--     scrim a été conclu depuis cette recherche.
--   - Une seule recherche ACTIVE par équipe (index unique partiel) : deux
--     annonces concurrentes de la même équipe brouilleraient l'annuaire et le
--     matching. Relancer = mettre à jour la recherche existante.
--
-- RLS — default deny STRICT (aligné scrim_plannings / player_ratings) :
--   ENABLE ROW LEVEL SECURITY + AUCUNE policy → anon et authenticated bloqués.
--   Tout passe par les routes API (service_role), qui appliquent la permission
--   d'équipe `manage_scrims` (cf. utils/teams/managementAccess.ts).
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout, DROP TRIGGER avant CREATE).
--   - Nouvelle table + FK ⇒ reload du schema-cache PostgREST REQUIS (NOTIFY
--     final ; sinon « Reload schema cache » dans le Dashboard).

BEGIN;

CREATE TABLE IF NOT EXISTS public.scrim_searches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  team_id     uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by  uuid,
  -- Créneaux souhaités : tableau JSONB d'ISO datetimes (1..10).
  slots       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Format souhaité, libre et court (BO1, BO3, 2 maps…). NULL = indifférent.
  format      text,
  -- Message public court affiché dans l'annuaire.
  note        text,
  status      text NOT NULL DEFAULT 'active',
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrim_searches_status_check
    CHECK (status IN ('active', 'fulfilled', 'cancelled')),
  CONSTRAINT scrim_searches_slots_is_array
    CHECK (jsonb_typeof(slots) = 'array'),
  CONSTRAINT scrim_searches_note_len CHECK (note IS NULL OR length(note) <= 280),
  CONSTRAINT scrim_searches_format_len
    CHECK (format IS NULL OR length(format) <= 40)
);

COMMENT ON TABLE public.scrim_searches IS
  'Recherche de scrim DATÉE et périssable d''une équipe (créneaux ISO + expiration). Remplace fonctionnellement le booléen teams.open_for_scrim, qui en devient le dérivé.';
COMMENT ON COLUMN public.scrim_searches.slots IS
  'Tableau JSONB d''ISO datetimes — même convention que demandes.payload.scrim_nego.slots.';
COMMENT ON COLUMN public.scrim_searches.expires_at IS
  'Fin de validité. Par défaut dernier créneau + 2 h (posé par l''API). Une recherche expirée n''est ni listée ni notifiée.';

-- Une seule recherche ACTIVE par équipe : sinon l'annuaire et le matching
-- afficheraient deux annonces concurrentes de la même équipe.
CREATE UNIQUE INDEX IF NOT EXISTS scrim_searches_one_active_per_team
  ON public.scrim_searches (team_id)
  WHERE status = 'active';

-- Listing de l'annuaire : recherches actives non expirées du tenant.
CREATE INDEX IF NOT EXISTS scrim_searches_tenant_active_idx
  ON public.scrim_searches (tenant_id, expires_at)
  WHERE status = 'active';

-- FK covering index (cohérent avec add_missing_fk_indexes.sql).
CREATE INDEX IF NOT EXISTS scrim_searches_team_id_idx
  ON public.scrim_searches (team_id);

CREATE OR REPLACE FUNCTION public.scrim_searches_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scrim_searches_updated_at ON public.scrim_searches;
CREATE TRIGGER trg_scrim_searches_updated_at
  BEFORE UPDATE ON public.scrim_searches
  FOR EACH ROW EXECUTE FUNCTION public.scrim_searches_set_updated_at();

-- RLS : default deny strict, aucune policy (service_role uniquement).
ALTER TABLE public.scrim_searches ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
