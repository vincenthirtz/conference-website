-- database/migrations/allow_anon_read_caster_scenes.sql
--
-- Lecture publique (role anon) de `caster_scenes` pour les overlays heberges
-- /overlay/caster/* (Browser Sources OBS, lot 1 du cockpit caster web).
--
-- Etat avant : caster_scenes_select est TO authenticated USING (true) — la cle
-- anon recevait une liste vide (RLS silencieuse) et Realtime postgres_changes
-- ne delivrait rien aux clients anon. Les donnees sont la config d'overlay
-- affichee a l'antenne : publiques par nature, aucune donnee sensible.
-- Policy ADDITIVE : l'ecriture reste reservee au staff actif
-- (caster_scenes_{insert,update,delete} inchangees).
--
-- Idempotent. A appliquer dans le SQL Editor Supabase (projet
-- conference-website) — applique le 2026-07-29.

drop policy if exists caster_scenes_select_public on public.caster_scenes;

create policy caster_scenes_select_public
  on public.caster_scenes
  for select
  to anon
  using (true);
