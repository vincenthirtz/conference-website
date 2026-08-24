-- database/seeds/edition_2025_final_rankings_and_season.sql
--
-- Classement final de la 1re édition + la saison qui l'expose sur /leagues.
--
-- POURQUOI
-- `/leagues` était vide : la seule league existante (« Saison 2026_2027 ») est
-- en `draft`, et `readPublicLeagues` filtre `status <> 'draft'`. L'édition 2025
-- n'était rattachée à aucune saison, et `final_rankings` était vide pour elle —
-- donc même rattachée, elle n'aurait produit aucun standing (le recompute part
-- de `final_rankings`).
--
-- LE CLASSEMENT FINAL, ET D'OÙ IL SORT
-- Format de l'édition 1 : round-robin 4 équipes en BO3 (6 matchs) puis une
-- finale en BO5. Les départages sont ceux publiés sur la page de l'édition
-- (lib/i18n/locales/fr/tournoiPage.ts) : « Victoires > Différence de maps >
-- Maps gagnées ». Rien n'est arbitré ici, tout se déduit des scores en base.
--
--   Round-robin          V    maps     diff
--   Sparkles             3    6–0      +6
--   Onna Bugeisha        1    3–4      −1
--   Avoidgers            1    3–5      −2
--   Phénix               1    2–5      −3
--
--   Finale : Sparkles 3–0 Onna Bugeisha.
--
-- → 1. Sparkles (Hinode Sparkles)  2. Onna Bugeisha
--   3. Avoidgers                   4. Phénix (Venom Valkyries)
--
-- Les deux renommages depuis 2025 sont documentés dans
-- database/seeds/edition_2025_match_participants.sql.
--
-- EFFET DE BORD VOULU : `final_rankings` alimente aussi le palmarès des fiches
-- joueuses (utils/rating/readPlayerProfile.ts → readAchievements). Les 20
-- joueuses de l'édition 1 gagnent donc leur badge de podium au passage.
--
-- Idempotent : purge puis réinsère les 4 rangs, la saison et ses standings.

begin;

-- 1) Classement final du tournoi.
delete from final_rankings
where tournament_id = '734b6fdb-dfe8-4565-a6b3-38c6423d0929';

insert into final_rankings (tenant_id, tournament_id, team_id, rank, notes)
values
  ('ce69a726-773e-4d12-b5eb-d2503aa752b4', '734b6fdb-dfe8-4565-a6b3-38c6423d0929', '2292d8f1-c266-4116-ad52-9f3c6f469489', 1, 'Championne — finale gagnée 3–0'),
  ('ce69a726-773e-4d12-b5eb-d2503aa752b4', '734b6fdb-dfe8-4565-a6b3-38c6423d0929', '355a4578-8572-4eab-808f-cf318e6d0620', 2, 'Finaliste'),
  ('ce69a726-773e-4d12-b5eb-d2503aa752b4', '734b6fdb-dfe8-4565-a6b3-38c6423d0929', '36af2f6b-f98b-42c3-9595-f1c38ea9e2d1', 3, 'Poules : 1 V, différence de maps −2'),
  ('ce69a726-773e-4d12-b5eb-d2503aa752b4', '734b6fdb-dfe8-4565-a6b3-38c6423d0929', '5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7', 4, 'Poules : 1 V, différence de maps −3');

-- 2) La saison 2025. `finished` et non `active` : elle est close, et seul
--    `draft` la rendrait invisible côté public.
insert into leagues
  (tenant_id, name, slug, description, game, status, start_date, end_date, points_table, is_public)
values (
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  'Saison 2025',
  'saison-2025',
  'La première OW Women''s Cup : 4 équipes, 6 matchs de poules en BO3, une finale en BO5.',
  'Overwatch',
  'finished',
  '2025-11-17',
  '2025-12-10',
  '{"1": 100, "2": 75, "3": 50, "4": 25}'::jsonb,
  true
)
on conflict (tenant_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  points_table = excluded.points_table,
  is_public = excluded.is_public,
  updated_at = now();

-- 3) Rattachement du tournoi (poids 1).
insert into league_tournaments (tenant_id, league_id, tournament_id, weight)
select
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  l.id,
  '734b6fdb-dfe8-4565-a6b3-38c6423d0929',
  1
from leagues l
where l.tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
  and l.slug = 'saison-2025'
on conflict (league_id, tournament_id) do update set weight = excluded.weight;

-- 4) Standings — même résultat que POST /api/admin/leagues/[id]/recompute
--    (points = points_table[rang] × poids, un seul tournoi compté).
delete from league_standings
where league_id in (
  select id from leagues
  where tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' and slug = 'saison-2025'
);

insert into league_standings
  (tenant_id, league_id, team_id, points, tournaments_counted, best_rank, rank)
select
  fr.tenant_id,
  l.id,
  fr.team_id,
  coalesce((l.points_table ->> fr.rank::text)::numeric, 0) * lt.weight,
  1,
  fr.rank,
  fr.rank
from final_rankings fr
join leagues l
  on l.tenant_id = fr.tenant_id and l.slug = 'saison-2025'
join league_tournaments lt
  on lt.league_id = l.id and lt.tournament_id = fr.tournament_id
where fr.tournament_id = '734b6fdb-dfe8-4565-a6b3-38c6423d0929';

commit;
