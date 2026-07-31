-- Migration: team_availability — disponibilité RÉCURRENTE d'un membre d'équipe
-- Date: 2026-07-31
--
-- WHY (N1 du backlog réseau intelligent, cf. docs/BACKLOG-reseau-intelligent.md) :
--   Deux notions de créneau existaient déjà, et aucune ne capte l'habitude :
--     - `scrim_plannings` (When2Meet) est une grille PAR SCRIM — elle suppose
--       qu'un scrim existe déjà (0 grille remplie en prod au 2026-07-31) ;
--     - `scrim_searches` porte des créneaux PONCTUELS (« ce jeudi 21 h »).
--   Or une équipe amateur joue à heure fixe. Tant que « on joue mardi et jeudi
--   à 21 h » n'est pas déclaré, chaque scrim repart de zéro sur les dispos et le
--   système ne sait rien du rythme de l'équipe — donc n'en déduit rien.
--
--   Deuxième raison, au moins aussi importante : c'est le PREMIER objet auquel
--   un membre NON capitaine peut contribuer. Roster, scrims, demandes et
--   inscriptions sont tous réservés à la gestion (à raison, cf. R2) — une équipe
--   se résumait donc à une personne qui vient et quatre qui ne viennent jamais.
--
-- MODÈLE :
--   - une ligne par (équipe, membre) — la déclaration est personnelle ;
--   - `slots` : tableau JSONB de clés `"<jour ISO>-<minutes depuis minuit>"`
--     (1 = lundi … 7 = dimanche), granularité HORAIRE. Une habitude se dit
--     « 21 h », pas « 21 h 30 » : une grille deux fois plus fine serait deux
--     fois plus pénible à peindre pour zéro information utile.
--   - `timezone` : fuseau IANA du MEMBRE, pas de l'équipe. Une joueuse au Québec
--     ne déclare pas dans le fuseau de sa capitaine ; l'agrégation reprojette
--     (cf. utils/teams/teamRhythm.ts, DST-safe via Intl).
--   - Pas de FK sur `user_id` : cohérent avec `scrim_planning_availabilities`,
--     qui référence aussi `auth.users` sans contrainte (schéma auth séparé).
--
-- RLS — default deny STRICT (aligné scrim_searches / scrim_plannings) :
--   ENABLE ROW LEVEL SECURITY + AUCUNE policy → anon et authenticated bloqués.
--   Tout passe par /api/player/team-rhythm (service_role), qui vérifie
--   l'appartenance à l'équipe.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout, DROP TRIGGER avant CREATE).
--   - Nouvelle table + FK ⇒ reload du schema-cache PostgREST REQUIS (NOTIFY
--     final ; sinon « Reload schema cache » dans le Dashboard).

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  team_id     uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  -- Fuseau IANA du membre. 64 caractères couvre largement la base tzdata.
  timezone    text NOT NULL DEFAULT 'Europe/Paris',
  -- Clés `"<weekday>-<minutes>"` — cf. utils/teams/teamRhythm.ts.
  slots       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_availability_slots_is_array
    CHECK (jsonb_typeof(slots) = 'array'),
  CONSTRAINT team_availability_slots_len
    CHECK (jsonb_array_length(slots) <= 70),
  CONSTRAINT team_availability_timezone_len
    CHECK (length(timezone) BETWEEN 1 AND 64)
);

COMMENT ON TABLE public.team_availability IS
  'Disponibilité RÉCURRENTE (hebdomadaire) d''un membre dans son équipe. Une ligne par (équipe, membre). Alimente le noyau de créneaux, l''annonce de scrim pré-remplie et le score de compatibilité d''adversaire.';
COMMENT ON COLUMN public.team_availability.slots IS
  'Tableau JSONB de clés "<jour ISO 1-7>-<minutes depuis minuit>", granularité horaire, exprimées dans la colonne timezone.';
COMMENT ON COLUMN public.team_availability.timezone IS
  'Fuseau IANA du MEMBRE (pas de l''équipe) : l''agrégation reprojette les créneaux dans un fuseau de référence.';

-- Une seule déclaration par membre et par équipe : l'upsert de l'API s'appuie
-- dessus (ON CONFLICT), et deux lignes concurrentes fausseraient le noyau.
CREATE UNIQUE INDEX IF NOT EXISTS team_availability_team_user_uniq
  ON public.team_availability (team_id, user_id);

-- Lecture principale : la grille d'une équipe.
CREATE INDEX IF NOT EXISTS team_availability_tenant_team_idx
  ON public.team_availability (tenant_id, team_id);

-- Lecture du matching : tous les rythmes du tenant en une passe (annuaire).
CREATE INDEX IF NOT EXISTS team_availability_user_idx
  ON public.team_availability (user_id);

CREATE OR REPLACE FUNCTION public.team_availability_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_availability_updated_at ON public.team_availability;
CREATE TRIGGER trg_team_availability_updated_at
  BEFORE UPDATE ON public.team_availability
  FOR EACH ROW EXECUTE FUNCTION public.team_availability_set_updated_at();

-- RLS : default deny strict, aucune policy (service_role uniquement).
ALTER TABLE public.team_availability ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
