-- supabase/migrations/20260930130000_staff_planning_slots.sql
--
-- ⚠️  NON APPLIQUÉE EN PRODUCTION. Rejouée par `supabase start` en CI (e2e),
--     donc testée ; à relire puis à appliquer À LA MAIN sur le projet
--     `owwomenscup`. Additive et idempotente.
--
-- POURQUOI. Les disponibilités du staff (cast, modération, prod OBS, gestion
--   du live) vivaient dans un tableur partagé (« Calendrier disponibilité »).
--   Admin › Staff & Asso › Planning du staff les affiche désormais en agenda,
--   et importe ce tableur (export CSV) tel quel.
--
-- UNE LIGNE = UN CRÉNEAU d'une personne, un jour. `person_name` est le pseudo
--   du tableur (le staff n'a pas toujours de compte : pas de clé vers `staff`).
--   `end_time` ≤ `start_time` = le créneau se termine le lendemain (« 22h-00 »).
--   `source = 'csv'` : ligne posée par un import, remplacée au suivant pour les
--   mois que couvre le fichier ; `manual` : saisie à la main, jamais écrasée.
--
-- CAVEATS:
--   - RLS activée, service role uniquement (lue et écrite par /api/admin/*).
--   - Rollback : DROP TABLE public.staff_planning_slots.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  person_name text NOT NULL CHECK (char_length(btrim(person_name)) BETWEEN 1 AND 80),
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  role text CHECK (role IN ('cast', 'moderation', 'prod_obs', 'live_prod')),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_planning_slots_unique_slot
    UNIQUE (tenant_id, person_name, slot_date, start_time)
);

CREATE INDEX IF NOT EXISTS staff_planning_slots_tenant_date_idx
  ON public.staff_planning_slots (tenant_id, slot_date);

COMMENT ON TABLE public.staff_planning_slots IS
  'Disponibilités du staff (cast, modération, prod OBS, live) par personne et par jour — Admin › Staff & Asso › Planning du staff.';

ALTER TABLE public.staff_planning_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_planning_slots_service_role ON public.staff_planning_slots;
CREATE POLICY staff_planning_slots_service_role ON public.staff_planning_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
