-- database/migrations/extend_caster_scene_types.sql
--
-- Étend le CHECK de `caster_scenes.type` aux 4 types de scènes ajoutés
-- récemment à l'app desktop womenscup-caster : `bracket`, `player`
-- (Player Spotlight), `leaderboard` (classement joueuses / ligue) et
-- `standings` (classement final de tournoi + podium).
--
-- CONSTAT : le repo caster a bien les éditeurs (src/renderer/*Editor.js) et les
-- overlays (src/overlays/{bracket,player,leaderboard,standings}.html) pour ces
-- 4 types, mais AUCUNE migration SQL correspondante — son dossier sql/ s'arrête
-- aux types mvp / scrim / webcam. Le CHECK en base refuse donc ces valeurs :
-- créer une telle scène échoue aussi bien depuis l'app desktop que depuis le
-- cockpit web. Cette migration débloque les deux.
--
-- Additive et sans risque : on élargit un CHECK, aucune ligne existante n'est
-- invalidée. Les 8 types historiques sont conservés à l'identique.
--
-- Réversible : re-créer la contrainte avec la liste courte (à condition
-- qu'aucune ligne ne porte un des nouveaux types).
--
-- Appliquée le 2026-07-30.

alter table public.caster_scenes
  drop constraint if exists caster_scenes_type_check;

alter table public.caster_scenes
  add constraint caster_scenes_type_check
  check (
    type in (
      -- Historiques
      'starting',
      'match',
      'pause',
      'results',
      'end',
      'mvp',
      'scrim',
      'webcam',
      -- Ajoutés ici
      'bracket',
      'player',
      'leaderboard',
      'standings'
    )
  );
