-- Table: public.match_map_vetos
-- Tracks the step-by-step pick/ban veto flow for a match.
-- Each row = one step (ban or pick) by one team or a decider step.

create table if not exists public.match_map_vetos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  step_number integer not null,           -- 1-based order in the veto sequence
  action text not null check (action in ('ban', 'pick', 'decider')),
  team_id uuid references teams(id) on delete set null, -- null for decider (random/leftover)
  map_name text not null,
  map_type text null,                     -- cached from tournament_maps for convenience
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_match_map_vetos_match on public.match_map_vetos (match_id);
create index if not exists idx_match_map_vetos_match_step on public.match_map_vetos (match_id, step_number);
