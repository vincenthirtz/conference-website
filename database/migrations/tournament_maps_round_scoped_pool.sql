-- Pool de cartes par JOURNÉE de tournoi.
--
-- Jusqu'ici `tournament_maps` portait un pool unique par tournoi. Or une
-- compétition annonce un pool par journée (cf. les visuels « Map Pool 18/09 ») :
-- le seul moyen de le refléter était de désactiver les cartes hors pool, ce qui
-- écrasait le pool des journées suivantes et rétrécissait du même coup le menu
-- des cartes du caster et la normalisation des noms à la saisie des scores.
--
-- CLÉ : `round_number`, PAS une date. Dans ce tournoi une même date porte deux
-- journées (le 23/09 accueille des matchs J1 ET J2) : une clé par date serait
-- ambiguë par construction. `matches.round_number` est déjà la notion de
-- journée du modèle (J1…J7, puis petite et grande finale).
--
-- COMPATIBILITÉ : `round_number IS NULL` = pool par défaut du tournoi, le
-- comportement actuel. Les lignes existantes restent donc inchangées et
-- continuent de servir de repli pour toute journée sans pool propre.
--
-- Idempotent : re-jouable sans effet de bord.

ALTER TABLE public.tournament_maps
  ADD COLUMN IF NOT EXISTS round_number integer;

COMMENT ON COLUMN public.tournament_maps.round_number IS
  'Journée à laquelle ce pool s''applique (matches.round_number). NULL = pool par défaut du tournoi, utilisé quand la journée n''a pas de pool propre.';

-- Lecture type : « le pool de la journée N de ce tournoi ». L''index couvre
-- aussi le repli (round_number IS NULL) puisqu''il fait partie de la clé.
CREATE INDEX IF NOT EXISTS tournament_maps_tournament_round_idx
  ON public.tournament_maps (tenant_id, tournament_id, round_number, order_index);

-- Une carte ne peut apparaître qu'une fois dans le pool d'une journée donnée.
-- NULLS NOT DISTINCT : sans ça, le pool par défaut (round_number NULL)
-- accepterait des doublons, que la contrainte est justement là pour interdire.
CREATE UNIQUE INDEX IF NOT EXISTS tournament_maps_unique_per_round_idx
  ON public.tournament_maps (tenant_id, tournament_id, round_number, map_name)
  NULLS NOT DISTINCT;
