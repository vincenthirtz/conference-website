-- database/migrations/add_caster_scenes.sql
-- Scenes partagees pour l'app WomensCup Caster.
-- Chaque scene (starting, match, pause, results, end) est stockee en DB
-- avec ses donnees dynamiques (equipes, scores, maps, messages).
-- Le Realtime Supabase synchronise les modifications entre tous les casters.

create table if not exists public.caster_scenes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  name         text not null,
  type         text not null check (type in ('starting', 'match', 'pause', 'results', 'end', 'custom')),
  overlay      text not null default '',
  data         jsonb not null default '{}',
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_caster_scenes_tenant
  on public.caster_scenes(tenant_id);

-- RLS
alter table public.caster_scenes enable row level security;

-- Staff can read scenes for their tenant
create policy "staff_read_caster_scenes"
  on public.caster_scenes for select
  using (
    exists (
      select 1 from public.tenant_staff ts
      join public.staff s on s.id = ts.staff_id
      where ts.tenant_id = caster_scenes.tenant_id
        and s.auth_user_id = auth.uid()
        and s.is_active = true
    )
  );

-- Admins+ can insert/update/delete scenes
create policy "admin_write_caster_scenes"
  on public.caster_scenes for all
  using (
    exists (
      select 1 from public.tenant_staff ts
      join public.staff s on s.id = ts.staff_id
      where ts.tenant_id = caster_scenes.tenant_id
        and s.auth_user_id = auth.uid()
        and s.is_active = true
        and s.role in ('owner', 'admin', 'manager')
    )
  );

-- Casters can update scene data (scores, teams) but not structure
create policy "caster_update_scene_data"
  on public.caster_scenes for update
  using (
    exists (
      select 1 from public.tenant_staff ts
      join public.staff s on s.id = ts.staff_id
      where ts.tenant_id = caster_scenes.tenant_id
        and s.auth_user_id = auth.uid()
        and s.is_active = true
        and s.role = 'caster'
    )
  )
  with check (
    exists (
      select 1 from public.tenant_staff ts
      join public.staff s on s.id = ts.staff_id
      where ts.tenant_id = caster_scenes.tenant_id
        and s.auth_user_id = auth.uid()
        and s.is_active = true
        and s.role = 'caster'
    )
  );

-- updated_at trigger
create or replace function public.set_caster_scenes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_caster_scenes_updated_at
  before update on public.caster_scenes
  for each row execute function public.set_caster_scenes_updated_at();

-- Enable Realtime for live sync between casters
alter publication supabase_realtime add table public.caster_scenes;

-- Seed default scenes for existing tenants
insert into public.caster_scenes (tenant_id, name, type, overlay, data, sort_order)
select t.id, s.name, s.type, s.overlay, s.data::jsonb, s.sort_order
from public.tenants t
cross join (values
  ('Starting Soon',    'starting', 'starting.html', '{"countdown":300,"title":"Le stream commence bientôt"}', 0),
  ('Match en cours',   'match',    'match.html',    '{"team1":"Équipe 1","team2":"Équipe 2","score1":0,"score2":0,"map":"Ilios","bestOf":5}', 1),
  ('Pause',            'pause',    'pause.html',    '{"message":"Nous revenons dans un instant"}', 2),
  ('Résultats',        'results',  'results.html',  '{"team1":"Équipe 1","team2":"Équipe 2","score1":0,"score2":0}', 3),
  ('Fin de stream',    'end',      'end.html',      '{"message":"Merci d''avoir regardé !"}', 4)
) as s(name, type, overlay, data, sort_order)
where t.is_active = true;
