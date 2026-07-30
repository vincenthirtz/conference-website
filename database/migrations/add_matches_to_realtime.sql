-- database/migrations/add_matches_to_realtime.sql
--
-- ⚠️ NON APPLIQUEE — a soumettre a validation avant execution (impact prod).
--
-- Ajoute `public.matches` a la publication `supabase_realtime` afin que les
-- clients puissent recevoir les changements de score en temps reel via
-- postgres_changes.
--
-- CONSTAT (verifie en base le 2026-07-30) : seule `caster_scenes` est publiee.
-- Deux fonctionnalites supposent pourtant que `matches` le soit :
--   1. l'app desktop womenscup-caster — `tournaments:subscribe-match` (score
--      live du match lie a la scene) et le refetch rapide de la scene scrim
--      (abonnement filtre sur `scrim_id`). Sans publication, aucun event
--      n'arrive : le score live ne remonte jamais et le scrim retombe sur son
--      poll de secours (20 s). Bug latent, silencieux.
--   2. le cockpit caster web — meme besoin. Il est livre en POLLING
--      (/api/caster/v1/matches/[id], ~10 s) pour ne pas dependre de cette
--      migration ; le passage au Realtime serait un changement local.
--
-- SECURITE : aucune nouvelle exposition de donnees. La table porte deja une
-- policy `matches_select_public` (SELECT, role public) : ce que Realtime
-- delivrerait est deja lisible via l'API REST. Le Realtime respecte la RLS.
--
-- IMPACT A PESER AVANT D'APPLIQUER : chaque UPDATE de `matches` sera diffuse
-- aux clients abonnes (trafic Realtime + quota Supabase). Pendant un tournoi
-- actif, les mises a jour de score sont frequentes. A valider cote quota.
--
-- REVERSIBLE : `alter publication supabase_realtime drop table public.matches;`
--
-- Idempotent (le do-block ne re-ajoute pas si la table est deja publiee).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end
$$;

-- Optionnel mais recommande si des DELETE doivent etre distingues cote client :
--   alter table public.matches replica identity full;
-- (sans cela, un DELETE ne porte que la cle primaire — suffisant pour un
-- refetch, insuffisant pour filtrer sur une autre colonne.)
