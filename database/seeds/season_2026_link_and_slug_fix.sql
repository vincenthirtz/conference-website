-- database/seeds/season_2026_link_and_slug_fix.sql
--
-- Deux corrections de données sur les saisons, suite à la publication de
-- « Saison 2025 » (database/seeds/edition_2025_final_rankings_and_season.sql).
--
-- 1) SLUG DU TOURNOI 2025
--    Il valait `ow-women's-cup-2025` : une apostrophe dans le chemin d'URL.
--    C'est légal et ça répond en 200, mais ça casse au premier partage de lien
--    (encodage %27, coupure des auto-linkers) et ça sert de canonical sur la
--    page tournoi. La route `/tournament/[id]` résout indifféremment l'uuid ou
--    le slug, donc l'ancien identifiant reste joignable par uuid.
--
--    Ce n'est PAS un bug de code : `pages/api/admin/tournaments/index.ts`
--    génère déjà `slugify(name, { lower: true, strict: true })`, qui supprime
--    les apostrophes — d'où le slug propre du tournoi 2026. Seule cette ligne
--    de 2025, antérieure, portait la valeur brute.
--
-- 2) SAISON 2026-2027
--    Elle existait en `draft` (donc filtrée par `readPublicLeagues`) et aucun
--    tournoi ne lui était rattaché. La 2e édition (`e8fa740c…`, 18 sept. →
--    23 oct. 2026) tombe dans sa fenêtre : on la rattache et on publie la
--    saison, désormais en cours. Les standings restent vides tant que le
--    tournoi n'a pas de `final_rankings` — la page a un état vide prévu pour.
--
--    Le nom perdait un `_` (« Saison 2026_2027 ») ; corrigé en la publiant.
--    Le slug, lui, ne bouge pas : il était déjà `saison-2026-2027`.
--
-- Idempotent.

begin;

update tournaments
set slug = 'ow-womens-cup-2025', updated_at = now()
where id = '734b6fdb-dfe8-4565-a6b3-38c6423d0929'
  and slug = 'ow-women''s-cup-2025';

update leagues
set
  name = 'Saison 2026-2027',
  description = coalesce(
    description,
    'La deuxième OW Women''s Cup et les tournois de la saison.'
  ),
  status = 'active',
  updated_at = now()
where tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
  and slug = 'saison-2026-2027';

insert into league_tournaments (tenant_id, league_id, tournament_id, weight)
select
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  l.id,
  'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
  1
from leagues l
where l.tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
  and l.slug = 'saison-2026-2027'
on conflict (league_id, tournament_id) do update set weight = excluded.weight;

commit;
