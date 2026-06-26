-- ARCHIVÉ le 2026-06-26 : le CREATE TABLE tournament_maps a été versionné dans
--   migrations/create_tournament_maps_table.sql (DDL + index repris à l'identique).
--   Le SEED de map-pool VOD du tournoi 734b6fdb… contenu ici est de la DONNÉE one-shot
--   et n'est PAS repris en migration. Conservé pour historique uniquement.
-- =====================================================================

-- Table: public.tournament_maps
-- Schema inferred from pages/api/tournament/[id]/maps.ts

create table if not exists public.tournament_maps (
  id uuid primary key default extensions.uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  map_name text not null,
  map_slug text null,
  map_type text null, -- ex: control, hybrid, escort, push...
  image_url text null, -- URL de l'image représentant la map
  enabled boolean not null default true,
  order_index integer null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_tournament_maps_tournament on public.tournament_maps (tournament_id);
create index if not exists idx_tournament_maps_order on public.tournament_maps (tournament_id, order_index);
create index if not exists idx_tournament_maps_enabled on public.tournament_maps (tournament_id, enabled);

-- Seed VOD-based map pool derived from the 3 videos on /tournoi
-- Tournament: 734b6fdb-dfe8-4565-a6b3-38c6423d0929
insert into public.tournament_maps (
  id,
  tournament_id,
  map_name,
  map_slug,
  map_type,
  enabled,
  order_index
)
values
  (gen_random_uuid(), '734b6fdb-dfe8-4565-a6b3-38c6423d0929', 'DAY 1 – OW Women''s Cup', 'MPa_TWJZQ60', 'vod', true, 0),
  (gen_random_uuid(), '734b6fdb-dfe8-4565-a6b3-38c6423d0929', 'DAY 2 – OW Women''s Cup', 'nhj6gCiSYrk', 'vod', true, 1),
  (gen_random_uuid(), '734b6fdb-dfe8-4565-a6b3-38c6423d0929', 'Finale – OW Women''s Cup', 'XZQjy5bylP0', 'vod', true, 2)
on conflict do nothing;
