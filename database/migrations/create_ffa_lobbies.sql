-- Migration: create FFA / N-competitor lobbies + placements (ISOLATED engine)
--
-- WHY:
--   The existing `matches` domain is strictly team-vs-team (team1_id vs
--   team2_id, a single winner_team_id). That model can't express an FFA /
--   battle-royale / points-race stage where N participants share one "lobby"
--   (aka heat / manche / round) and each gets a *placement* + points. Rather
--   than overload `matches` with nullable team3..teamN columns and break every
--   consumer of the 2-team engine, we introduce a SEPARATE, self-contained
--   pair of tables. Nothing here references `matches`; the FFA scoring path is
--   fully isolated.
--
-- SHAPE:
--   lobbies           : one row per group/heat of N participants in an FFA
--                       stage. Holds ordering (round_number), status lifecycle
--                       and optional best_of aggregation.
--   lobby_placements  : one row per participating team per lobby, carrying its
--                       finishing placement (1 = winner, ties allowed, NULL
--                       until entered), computed points, and optional raw score
--                       (kills/points). A team appears at most once per lobby.
--
--   Loose refs (plain uuid, NO FK) for tournament_id / stage_id / team_id —
--   matching the `tournament_teams` convention in this repo (tournament_teams
--   carries tournament_id/team_id as plain uuid, only tenant_id is FK-enforced).
--   tenant_id and lobby_id ARE FK-enforced (tenant scoping + cascade cleanup).
--
-- RLS BASELINE:
--   RLS enabled on BOTH tables. Writes are service_role only (no anon/auth
--   write policy). Reads also go through supabaseAdmin from server-side public
--   readers (same pattern as the `matches` / `final_rankings` read path), so we
--   deliberately add NO public SELECT policy here => default-deny for anon.
--   A get_advisors "RLS enabled, no policy" finding on these tables is EXPECTED
--   and intended.
--
-- DEPLOY NOTES:
--   - Idempotent (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
--     DROP POLICY IF EXISTS before CREATE POLICY).
--   - New FK to tenants + self-FK lobby_placements->lobbies : reload the
--     PostgREST schema cache after applying (NOTIFY pgrst, 'reload schema';
--     or Dashboard -> Settings -> API -> "Reload schema cache") so any
--     ?select=*,lobby_placements(*) embeds resolve.

-- ===========================================================================
-- 1) lobbies — a heat/group of N participants in an FFA/points stage
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.lobbies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  tournament_id uuid NOT NULL,
  stage_id      uuid,
  name          text,
  round_number  integer,
  best_of       integer,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lobbies IS
  'FFA/points engine (isole du domaine matches team-vs-team) : un groupe/heat de N participants (lobby / manche / round) dans un stage FFA/battle-royale. tournament_id/stage_id = refs souples (plain uuid).';
COMMENT ON COLUMN public.lobbies.round_number IS
  'Ordre du lobby dans le stage (ex manche 1, 2, 3).';
COMMENT ON COLUMN public.lobbies.best_of IS
  'Optionnel : nombre de games agregees pour ce lobby.';
COMMENT ON COLUMN public.lobbies.status IS
  'Cycle de vie : pending -> in_progress -> completed.';

CREATE INDEX IF NOT EXISTS idx_lobbies_tenant       ON public.lobbies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lobbies_tournament   ON public.lobbies (tournament_id);
CREATE INDEX IF NOT EXISTS idx_lobbies_stage        ON public.lobbies (stage_id);

-- ===========================================================================
-- 2) lobby_placements — one participant's finish + points inside a lobby
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.lobby_placements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  lobby_id   uuid NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  team_id    uuid NOT NULL,
  placement  integer CHECK (placement IS NULL OR placement >= 1),
  points     numeric,
  score      numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lobby_placements_lobby_team UNIQUE (lobby_id, team_id)
);

COMMENT ON TABLE public.lobby_placements IS
  'FFA/points engine : une ligne par equipe participante et par lobby. placement 1 = vainqueur, egalites autorisees (pas de contrainte unique sur placement), NULL tant que non saisi. points calcules par le code applicatif depuis le points_table du stage.';
COMMENT ON COLUMN public.lobby_placements.placement IS
  'Rang de fin (1 = vainqueur). Egalites autorisees. NULL tant que non saisi.';
COMMENT ON COLUMN public.lobby_placements.points IS
  'Points attribues, calcules par le code depuis le points_table du stage.';
COMMENT ON COLUMN public.lobby_placements.score IS
  'Optionnel : score brut / frags.';

CREATE INDEX IF NOT EXISTS idx_lobby_placements_tenant ON public.lobby_placements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lobby_placements_lobby  ON public.lobby_placements (lobby_id);

-- ===========================================================================
-- 3) RLS baseline : default-deny for anon/auth, service_role writes only.
--    Reads happen server-side via supabaseAdmin (like matches/final_rankings),
--    so NO public SELECT policy is added on purpose.
-- ===========================================================================
ALTER TABLE public.lobbies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lobbies_write_service_role ON public.lobbies;
CREATE POLICY lobbies_write_service_role
  ON public.lobbies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS lobby_placements_write_service_role ON public.lobby_placements;
CREATE POLICY lobby_placements_write_service_role
  ON public.lobby_placements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Reminder for the operator applying this migration :
--   NOTIFY pgrst, 'reload schema';
