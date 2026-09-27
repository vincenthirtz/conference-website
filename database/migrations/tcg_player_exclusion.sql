-- Migration : « ne pas figurer dans le TCG » — le consentement qui manquait.
-- Date: 2026-09-27
-- Lot T9 de docs/PLAN-tcg.md.
--
-- WHY. Les trois garde-fous de docs/TCG.md §2 couvrent la PHOTO : rien n'entre
--   sans un geste de la joueuse, tout se retire. Mais une carte existe SANS
--   photo — avec un nom, une équipe, une rareté tirée de son palmarès — et rien
--   ne permettait de ne pas figurer du tout. On pouvait retirer son visage, pas
--   son nom.
--
-- CE QUE LE RETRAIT FAIT, ET CE QU'IL NE PEUT PAS FAIRE. Trois effets, et le
--   troisième est un arbitrage :
--     1. elle sort du VIVIER (`poolQueries`) : plus aucun paquet ne la tire, et
--        les séries suivent d'elles-mêmes puisqu'elles lisent le même vivier ;
--     2. sa PHOTO est retirée par le chemin existant (file `tcg_photo_purges`,
--        balayage horaire) — le retrait rétroactif de §2.3 ;
--     3. les cartes DÉJÀ TIRÉES restent dans les collections d'autrui, mais
--        ANONYMISÉES : `readPlayerFaces` rend une face sans nom, sans photo,
--        sans figurine.
--
--   Le troisième point mérite sa justification, parce que deux autres réponses
--   étaient possibles et qu'aucune ne tient :
--     - LES LAISSER TELLES QUELLES (ce que fait le fan art retiré) reviendrait à
--       dire « tu n'es plus tirée, mais tu circules encore sous ton nom ». Ce
--       n'est pas un retrait, c'est un arrêt des ventes.
--     - LES SUPPRIMER détruirait la collection de tiers qui n'ont rien fait, et
--       parfois une carte OBTENUE PAR ÉCHANGE, c'est-à-dire payée. On ne répare
--       pas un défaut de consentement en en créant un autre.
--   L'anonymisation garde le compte de cartes de chacune (aucune collection ne
--   rétrécit, aucun échange n'est défait) et retire la seule chose qui la
--   désignait. C'est le seul arbitrage qui ne prend rien à personne.
--
-- RÉVERSIBLE, et c'est important : un retrait qu'on ne peut pas défaire est une
--   décision qu'on hésite à prendre. `excluded_at` repasse à NULL, et la joueuse
--   revient dans le vivier. Les cartes anonymisées redeviennent nominatives —
--   elles n'ont jamais cessé d'être ses cartes.
--
-- LA COLONNE VIT DANS `tcg_player_cards`, qui porte déjà `opted_in_at` et
--   `revoked_at` : cette table est SA RELATION au TCG, pas seulement sa photo.
--   Une ligne est créée au retrait pour quelqu'un qui n'a jamais rien déposé —
--   c'est justement le cas le plus probable.
--
-- Additive et idempotente. Rollback : DROP COLUMN excluded_at.

BEGIN;

ALTER TABLE public.tcg_player_cards
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz;

COMMENT ON COLUMN public.tcg_player_cards.excluded_at IS
  'Retrait TOTAL du TCG, à sa demande : elle sort du vivier de tirage, sa photo est purgée, et les cartes déjà tirées sont ANONYMISÉES par readPlayerFaces (ni nom, ni photo, ni figurine) sans disparaître des collections d''autrui. NULL = figure normalement. Réversible.';

-- Sens de lecture du vivier : « qui s'est retirée ? », par espace.
CREATE INDEX IF NOT EXISTS idx_tcg_player_cards_excluded
  ON public.tcg_player_cards (tenant_id)
  WHERE excluded_at IS NOT NULL;

COMMIT;
