-- database/seeds/edition_2025_match_participants.sql
--
-- Feuilles de match RÉTROACTIVES de la 1re édition (OW Women's Cup 2025,
-- tournoi 734b6fdb-dfe8-4565-a6b3-38c6423d0929, 7 matchs, 4 équipes).
--
-- POURQUOI CE SEED
-- Les équipes de 2025 ont été semées SANS membres (database/legacy/
-- teams_734b6fdb_seed.sql). Or le rating attribue les matchs depuis
-- `team_members` : faute de roster d'époque, le classement public créditait
-- les matchs de 2025 aux rosters d'AUJOURD'HUI — Venom Valkyries (ex-Phénix)
-- se voyait attribuer ses 3 matchs de 2025 à cinq joueuses dont aucune n'y a
-- joué. 6 joueuses classées, 1 match noté sur 7, et les six mauvaises.
--
-- Le roster réel de l'édition 1 n'existe qu'ici : config/teams.json (affiché
-- par pages/tournoi.tsx) et les descriptions de config/replays.ts, qui
-- confirment la correspondance des équipes renommées depuis :
--     Phénix   → Venom Valkyries (5ae23cdf…)
--     Sparkles → Hinode Sparkles (2292d8f1…)
-- Chaque équipe alignait 5 joueuses, sans remplaçante déclarée : on fige donc
-- ce même cinq sur tous ses matchs. C'est la meilleure vérité disponible.
--
-- JOUEUSES SANS COMPTE
-- 8 des 20 joueuses ont un compte sur le site ; les 12 autres n'en ont jamais
-- eu. Plutôt que de leur fabriquer un compte auth (adresse inventée, connexion
-- possible, collision le jour où la vraie personne s'inscrit), on leur donne
-- un identifiant SYNTHÉTIQUE reconnaissable :
--
--     00000001-2025-4000-8000-0000000000XX
--
-- `match_participants.user_id` et `player_ratings.user_id` n'ont pas de clé
-- étrangère vers `auth.users` : ces fiches vivent donc dans le classement et
-- sur /player/[userId] sans compte associé. Le jour où l'une d'elles s'inscrit,
-- la fusion consiste à remplacer son uuid synthétique ici puis à relancer la
-- reconstruction du classement.
--
-- APRÈS EXÉCUTION : relancer la reconstruction (Admin → Classement →
-- « Reconstruire », ou POST /api/admin/ratings/rebuild). Sans ça,
-- `player_ratings` reste sur l'ancien calcul.
--
-- Idempotent : purge puis réinsère les feuilles des 7 matchs du tournoi.

begin;

-- 1) Purge des attributions héritées du roster courant sur ce tournoi.
--    On ne touche à AUCUN autre tournoi.
delete from match_participants
where tournament_id = '734b6fdb-dfe8-4565-a6b3-38c6423d0929';

delete from match_lineups
where match_id in (
  select id from matches
  where tournament_id = '734b6fdb-dfe8-4565-a6b3-38c6423d0929'
);

-- 2) Roster d'époque, équipe par équipe.
--    `battle_tag` sert de nom d'affichage de repli dans le classement quand le
--    compte n'a pas de display_name — pour les fiches synthétiques, c'est le
--    pseudo sous lequel la joueuse a compéti.
with roster (team_id, user_id, battle_tag) as (
  values
    -- Phénix (aujourd'hui Venom Valkyries) — 5ae23cdf…
    ('5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7'::uuid, '2390dfad-a6b3-478a-9bdc-3900dd3a686b'::uuid, 'LiliOtpMercy'),
    ('5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7'::uuid, '00000001-2025-4000-8000-000000000001'::uuid, 'ImBanshee'),
    ('5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7'::uuid, '00000001-2025-4000-8000-000000000002'::uuid, 'PandaPop'),
    ('5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7'::uuid, '6d901dd3-4d2e-4f11-8ad8-6f02af6c5d4d'::uuid, 'MissDibule#2903'),
    ('5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7'::uuid, '00000001-2025-4000-8000-000000000003'::uuid, 'LaKiiroi'),

    -- Avoidgers — 36af2f6b…
    ('36af2f6b-f98b-42c3-9595-f1c38ea9e2d1'::uuid, 'bec14515-cb24-4878-91ac-fcfab94a357f'::uuid, 'Shaki'),
    ('36af2f6b-f98b-42c3-9595-f1c38ea9e2d1'::uuid, 'c8fbc0d6-8e9f-4819-937f-763be13de899'::uuid, 'Tanouille18#2346'),
    ('36af2f6b-f98b-42c3-9595-f1c38ea9e2d1'::uuid, '00000001-2025-4000-8000-000000000004'::uuid, 'Yamatorochii'),
    ('36af2f6b-f98b-42c3-9595-f1c38ea9e2d1'::uuid, 'abd6cc34-a9af-4a8c-802a-80f3fd4548d6'::uuid, 'Eiko#2202'),
    ('36af2f6b-f98b-42c3-9595-f1c38ea9e2d1'::uuid, '00000001-2025-4000-8000-000000000005'::uuid, 'Claro'),

    -- Onna Bugeisha — 355a4578…
    ('355a4578-8572-4eab-808f-cf318e6d0620'::uuid, '00000001-2025-4000-8000-000000000006'::uuid, 'ZezzDeCitron'),
    ('355a4578-8572-4eab-808f-cf318e6d0620'::uuid, '00000001-2025-4000-8000-000000000007'::uuid, 'Sayhun'),
    ('355a4578-8572-4eab-808f-cf318e6d0620'::uuid, '00000001-2025-4000-8000-000000000008'::uuid, 'Miks38'),
    ('355a4578-8572-4eab-808f-cf318e6d0620'::uuid, '00000001-2025-4000-8000-000000000009'::uuid, 'Jaz'),
    ('355a4578-8572-4eab-808f-cf318e6d0620'::uuid, '00000001-2025-4000-8000-000000000010'::uuid, 'Hyuuka'),

    -- Sparkles (aujourd'hui Hinode Sparkles) — 2292d8f1…
    ('2292d8f1-c266-4116-ad52-9f3c6f469489'::uuid, '00000001-2025-4000-8000-000000000011'::uuid, 'Asa'),
    ('2292d8f1-c266-4116-ad52-9f3c6f469489'::uuid, '1784a267-e54e-47ed-86e6-f25a7fe7fb2a'::uuid, 'saro#21821'),
    ('2292d8f1-c266-4116-ad52-9f3c6f469489'::uuid, '00000001-2025-4000-8000-000000000012'::uuid, 'Mawell'),
    ('2292d8f1-c266-4116-ad52-9f3c6f469489'::uuid, '6774b2bc-a169-4186-8529-119444eb4cfc'::uuid, 'Lux#22650'),
    ('2292d8f1-c266-4116-ad52-9f3c6f469489'::uuid, 'ebead30a-6a29-44c7-917d-48da6463eddd'::uuid, 'MissKiwiii#21551')
),
tournament_matches as (
  select id, tenant_id, tournament_id, team1_id, team2_id
  from matches
  where tournament_id = '734b6fdb-dfe8-4565-a6b3-38c6423d0929'
    and deleted_at is null
),
participants as (
  insert into match_participants
    (tenant_id, match_id, tournament_id, team_id, user_id, battle_tag, role, is_substitute)
  select m.tenant_id, m.id, m.tournament_id, r.team_id, r.user_id, r.battle_tag, 'player', false
  from tournament_matches m
  join roster r on r.team_id in (m.team1_id, m.team2_id)
  returning 1
),
-- 3) Feuille marquée validée par l'organisation : c'est bien le staff qui
--    déclare ces compositions, pas les équipes (elles n'existaient pas encore
--    sur le site en 2025). Ça les FIGE aussi — `snapshotMatchParticipants`
--    ne réécrit jamais un camp dont la feuille est validée.
lineups as (
  insert into match_lineups
    (tenant_id, match_id, team_id, status, validated_by_kind, validated_at)
  select m.tenant_id, m.id, t.team_id, 'validated', 'admin', now()
  from tournament_matches m
  cross join lateral (values (m.team1_id), (m.team2_id)) as t(team_id)
  where t.team_id is not null
  returning 1
)
select
  (select count(*) from participants) as participants_inserted,
  (select count(*) from lineups) as lineups_inserted;

commit;
