-- database/migrations/add_caster_themes.sql
--
-- Themes des overlays du cockpit caster web (/admin/caster, lot 5).
--
-- Cote app desktop, les themes vivent en FICHIERS dans userData/themes et sont
-- pousses a l'overlay dans le payload SSE (`_theme`). Le web n'a ni disque
-- local ni serveur persistant : le theme actif vit donc en base, et les
-- overlays hebergees (/overlay/caster/*) le lisent comme ils lisent les scenes
-- — avec la cle anon + Realtime.
--
-- `data` porte la meme shape que les fichiers de theme du desktop, celle que
-- consomme applyTheme() des overlays :
--   { template, colors: { bg, bgCard, accent1, accent2, accent3, text,
--     textMuted, winner }, font, headingFont?, fontWeight?, fontScale?,
--     positions: { scoreboard, mapInfo, branding, owTeam1?, owTeam2? } }
--
-- Un seul theme actif a la fois : garanti par un index unique partiel plutot
-- que par du code applicatif (deux onglets du cockpit ne peuvent pas en
-- activer deux).
--
-- Applique le 2026-07-30.

create table if not exists public.caster_themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  data        jsonb not null default '{}'::jsonb,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Un seul actif (index partiel : les inactifs ne sont pas contraints).
create unique index if not exists caster_themes_single_active
  on public.caster_themes ((is_active))
  where is_active;

-- updated_at automatique — meme posture que caster_scenes.
create or replace function public.handle_caster_themes_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists caster_themes_updated_at on public.caster_themes;
create trigger caster_themes_updated_at
  before update on public.caster_themes
  for each row execute function public.handle_caster_themes_updated_at();

-- RLS : meme posture que caster_scenes — lecture publique (les overlays
-- hebergees lisent avec la cle anon ; un theme est de l'habillage d'antenne,
-- aucune donnee sensible), ecriture reservee au staff actif.
alter table public.caster_themes enable row level security;

drop policy if exists caster_themes_select_public on public.caster_themes;
create policy caster_themes_select_public
  on public.caster_themes for select
  to anon, authenticated
  using (true);

drop policy if exists caster_themes_insert on public.caster_themes;
create policy caster_themes_insert
  on public.caster_themes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.staff
      where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
    )
  );

drop policy if exists caster_themes_update on public.caster_themes;
create policy caster_themes_update
  on public.caster_themes for update
  to authenticated
  using (
    exists (
      select 1 from public.staff
      where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
    )
  );

drop policy if exists caster_themes_delete on public.caster_themes;
create policy caster_themes_delete
  on public.caster_themes for delete
  to authenticated
  using (
    exists (
      select 1 from public.staff
      where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
    )
  );

-- Realtime : les overlays suivent le theme actif sans polling agressif.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'caster_themes'
  ) then
    alter publication supabase_realtime add table public.caster_themes;
  end if;
end
$$;

-- Seed : le theme Women's Cup par defaut (valeurs identiques au DEFAULT_THEME
-- de womenscup-caster/src/main/themes.js et aux tokens de src/overlays/shared.css).
insert into public.caster_themes (name, data, is_active)
select
  'Women''s Cup',
  jsonb_build_object(
    'template', 'default',
    'colors', jsonb_build_object(
      'bg', '#0f0820',
      'bgCard', '#1b1130',
      'accent1', '#00f0ff',
      'accent2', '#ff2ec8',
      'accent3', '#bb00ff',
      'text', '#ffffff',
      'textMuted', '#8888aa',
      'winner', '#10b981'
    ),
    'font', 'Segoe UI',
    'positions', jsonb_build_object(
      'scoreboard', jsonb_build_object('x', 960, 'y', 0),
      'mapInfo', jsonb_build_object('x', 960, 'y', 72),
      'branding', jsonb_build_object('x', 1896, 'y', 1040)
    )
  ),
  true
where not exists (select 1 from public.caster_themes);
