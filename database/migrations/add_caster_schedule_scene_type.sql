-- database/migrations/add_caster_schedule_scene_type.sql
--
-- Ajoute le type de scene `schedule` au CHECK de `caster_scenes.type` :
-- « Matchs de la soiree », le programme du jour d'un tournoi (equipes, logos,
-- horaire, statut a venir/en direct/termine, score si joue).
--
-- La scene ne stocke QUE de la config : tournoi, jour vise (vide = le jour
-- d'affichage), nombre de matchs max, marque et reseaux. Le programme lui-meme
-- est fetche par l'overlay depuis
-- GET /api/public/v1/tournaments/:id/matches, puis filtre sur la date et
-- rafraichi toutes les minutes. Figer les matchs en base afficherait l'etat
-- d'il y a deux heures au milieu d'une soiree.
--
-- ⚠️ COTE WEB, IL RESTE A FAIRE. L'app desktop womenscup-caster a son entree
-- `schedule` dans SCENE_FORMS et son `src/overlays/schedule.html` ; le cockpit
-- caster du site n'a encore ni editeur ni overlay pour ce type. Une scene
-- `schedule` y apparaitra dans la liste mais tombera sur le formulaire
-- generique, et /overlay/caster/schedule n'existe pas. Contrat d'interop
-- documente dans le CLAUDE.md du repo caster.
--
-- Additive et sans risque : on elargit un CHECK, aucune ligne existante n'est
-- invalidee.

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
      'camera',
      -- Ajoute ici
      'schedule'
    )
  );
