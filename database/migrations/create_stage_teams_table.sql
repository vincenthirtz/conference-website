-- Migration: create stage_teams table
-- Links teams to tournament stages with seeding information.

CREATE TABLE IF NOT EXISTS public.stage_teams (
  stage_id UUID NOT NULL REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  team_id  UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  seed     INTEGER,
  is_substitute BOOLEAN NOT NULL DEFAULT FALSE,
  notes    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stage_id, team_id)
);

-- Index for lookups by stage
CREATE INDEX IF NOT EXISTS idx_stage_teams_stage_id ON public.stage_teams(stage_id);

-- Index for lookups by team
CREATE INDEX IF NOT EXISTS idx_stage_teams_team_id ON public.stage_teams(team_id);

-- RLS: allow public read, admin write via service role
ALTER TABLE public.stage_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_teams_select_all" ON public.stage_teams
  FOR SELECT USING (true);

CREATE POLICY "stage_teams_service_role_all" ON public.stage_teams
  FOR ALL USING (auth.role() = 'service_role');
