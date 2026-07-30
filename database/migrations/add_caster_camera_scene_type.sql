-- database/migrations/add_caster_camera_scene_type.sql
--
-- Ajoute le type de scene `camera` au CHECK de `caster_scenes.type` : captation
-- d'un OPERATEUR DISTANT integree par un lien (VDO.Ninja, chaine Twitch/YouTube,
-- flux HLS ou fichier MP4).
--
-- A ne pas confondre avec le type `webcam` deja present : celui-la ouvre une
-- camera LOCALE de la machine OBS via getUserMedia. `camera` ne touche aucun
-- peripherique, il embarque une source distante.
--
-- ⚠️ Type WEB-ONLY : l'app desktop womenscup-caster n'a ni entree `camera` dans
-- son SCENE_FORMS ni `camera.html` dans src/overlays. Une scene de ce type y
-- apparaitra dans la liste mais tombera sur son formulaire generique, et son
-- serveur overlay local ne saura pas la rendre (les Browser Sources doivent
-- pointer sur /overlay/caster/camera du site). Documente dans le CLAUDE.md du
-- repo caster.
--
-- Additive et sans risque : on elargit un CHECK, aucune ligne existante n'est
-- invalidee.
--
-- Appliquee le 2026-07-30.

alter table public.caster_scenes
  drop constraint if exists caster_scenes_type_check;

alter table public.caster_scenes
  add constraint caster_scenes_type_check
  check (
    type in (
      'starting',
      'match',
      'pause',
      'results',
      'end',
      'mvp',
      'scrim',
      'webcam',
      'bracket',
      'player',
      'leaderboard',
      'standings',
      -- Ajoute ici
      'camera'
    )
  );
