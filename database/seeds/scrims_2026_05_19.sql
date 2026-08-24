-- database/seeds/scrims_2026_05_19.sql
--
-- Le scrim diffusé le 19 mai 2026 par la WOMEN'S CUP, à l'occasion de
-- la Journée mondiale contre l'homophobie, la transphobie et la biphobie.
-- VOD : https://www.youtube.com/watch?v=DGN4olmhb2Q
--
--   Scrim 1 — Chocomates 4–0 Eclypse
--
-- Le scrim 2 de la diffusion (Hinode Sparkles 3–2 Les NoName) n'est PAS repris :
-- Les NoName n'est pas une équipe féminine, elle n'a donc pas sa place dans le
-- système d'une compétition féminine — ni fiche d'équipe, ni ladder, ni rating.
--
-- POURQUOI CE SEED
-- La table `scrims` était vide : ni la liste publique `/scrims` ni le ladder
-- (`utils/scrims/ladder.ts`, calculé à la volée sur `status='completed'` ET
-- `ranked=true`) n'avaient la moindre ligne à afficher. C'est le premier
-- résultat du système.
--
-- ÉQUIPE MANQUANTE
-- Chocomates existait déjà. Eclypse est une équipe invitée qui n'a jamais eu de
-- compte ici : on la crée sans roster (même situation que les équipes de
-- l'édition 2025), avec `is_joinable = false` — une équipe sans membres ne doit
-- pas apparaître comme recrutant dans « Rejoindre une équipe ».
--
-- HORAIRES
-- Repris des métadonnées de la VOD (`liveBroadcastDetails` : diffusion du
-- 2026-05-19 09:11 → 13:44 UTC). À corriger si la partie a en réalité été jouée
-- un autre jour que la diffusion.
--
-- RATTACHEMENTS
-- Décision produit (2026-08-24) : chaque résultat de scrim compte pour le
-- classement des joueuses ET pour la saison en cours.
--   - Classement : `syncScrimRatedMatch` (utils/scrims/ratedMatch.ts) miroite
--     le scrim dans une ligne `matches`, que le moteur Glicko-2 note comme
--     n'importe quelle partie. Il faut les rosters des DEUX équipes : Eclypse
--     n'en a pas, donc ce scrim-ci reste en attente (visible sur
--     Admin → Classement → couverture, motif `one_side_only`).
--   - Saison : liaison explicite dans `league_scrims`, puis recalcul des
--     standings (barème scrim 3/1/0, cf. computeLeagueStandings).
--
-- Idempotent (uuid fixes + ON CONFLICT).

begin;

-- 1) L'équipe invitée.
insert into teams (id, tenant_id, name, slug, country, is_joinable, open_for_scrim)
values
  ('3c1a7b90-5d2e-4f61-9a83-0b7c6e5d4a10', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'Eclypse', 'eclypse', 'France', false, false)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  is_joinable = excluded.is_joinable,
  updated_at = now();

-- 2) Le scrim. `ranked = true` : c'est un résultat officiel de la diffusion, il
--    compte pour le ladder d'entraînement.
insert into scrims (
  id, tenant_id, name, slug, game, status, is_public, ranked,
  team1_id, team2_id, team1_score, team2_score, winner_team_id,
  scheduled_date, timezone, completed_at, stream_url, description
)
values
  (
    'b1d0c5a2-9e34-4f78-8a16-3d5c7e9f0b21',
    'ce69a726-773e-4d12-b5eb-d2503aa752b4',
    'Scrim 1 — 19 mai 2026',
    'scrim-1-19-mai-2026',
    'Overwatch',
    'completed',
    true,
    true,
    'f51e782f-c95b-4b8c-95b3-b62660504212', -- Chocomates
    '3c1a7b90-5d2e-4f61-9a83-0b7c6e5d4a10', -- Eclypse
    4,
    0,
    'f51e782f-c95b-4b8c-95b3-b62660504212',
    '2026-05-19T09:11:50Z',
    'Europe/Paris',
    '2026-05-19T13:44:43Z',
    'https://www.youtube.com/watch?v=DGN4olmhb2Q',
    'Scrims diffusés par la WOMEN''S CUP pour la Journée mondiale contre l''homophobie, la transphobie et la biphobie.

Cast : DragonLove et Kikifred
Régie : F4ya et Fisheye Productions
Organisation scrim : FlipFlop
Modération : Eskull et Arukdo'
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  is_public = excluded.is_public,
  ranked = excluded.ranked,
  team1_id = excluded.team1_id,
  team2_id = excluded.team2_id,
  team1_score = excluded.team1_score,
  team2_score = excluded.team2_score,
  winner_team_id = excluded.winner_team_id,
  scheduled_date = excluded.scheduled_date,
  completed_at = excluded.completed_at,
  stream_url = excluded.stream_url,
  description = excluded.description,
  updated_at = now();

-- 3) Rattachement à la saison en cours.
insert into league_scrims (tenant_id, league_id, scrim_id, weight)
select
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  l.id,
  'b1d0c5a2-9e34-4f78-8a16-3d5c7e9f0b21',
  1
from leagues l
where l.tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
  and l.slug = 'saison-2026-2027'
on conflict (league_id, scrim_id) do update set weight = excluded.weight;

commit;
