-- Migration : les cartes MASCOTTE du TCG.
-- Date: 2026-09-20
--
-- WHY:
--   Les figurines voxel des mascottes du jeu (Pachimari, Ganymede, Murphy…)
--   existent et sont servies par `/api/tcg/mascot/...`, mais AUCUN paquet ne
--   pouvait en contenir : `tcg_pack_cards` ne connaissait que quatre sujets —
--   joueuse, équipe, map, fan art. Une carte qu'aucun tirage ne produit n'est
--   pas une carte.
--
--   La mascotte rejoint l'emplacement DÉCOR, celui que se partagent déjà les
--   maps et les fan arts, et non un sixième emplacement : la composition d'un
--   paquet reste « trois joueuses, une équipe, un décor ». Le décor est la
--   place de ce qui n'est pas le sujet du tournoi ; une peluche y est chez elle
--   exactement comme une map.
--
-- CAVEATS:
--   - Le CHECK d'exclusivité est RECRÉÉ, pas complété : Postgres ne sait pas
--     étendre un CHECK existant. Les quatre branches d'origine sont reprises à
--     l'identique — les relire est le seul moyen de vérifier qu'aucune n'a
--     bougé au passage.
--   - Le slug n'est PAS une clé étrangère : le vivier des mascottes est un
--     registre en mémoire (`utils/tcg/gameMascots.ts`), comme celui des maps.
--     Une mascotte retirée du code laisse donc des cartes orphelines qui
--     s'afficheront sans figurine — même contrat que `card_map_slug`, assumé.
--   - Idempotente.

BEGIN;

ALTER TABLE public.tcg_pack_cards
  ADD COLUMN IF NOT EXISTS card_mascot_slug text;

COMMENT ON COLUMN public.tcg_pack_cards.card_mascot_slug IS
  'Slug de la mascotte (registre utils/tcg/gameMascots.ts). Pas de FK : le vivier vit dans le code, comme celui des maps.';

ALTER TABLE public.tcg_pack_cards
  DROP CONSTRAINT IF EXISTS tcg_pack_cards_subject_kind_check;
ALTER TABLE public.tcg_pack_cards
  ADD CONSTRAINT tcg_pack_cards_subject_kind_check
  CHECK (subject_kind = ANY (ARRAY['player', 'team', 'map', 'fanart', 'mascot']));

ALTER TABLE public.tcg_pack_cards
  DROP CONSTRAINT IF EXISTS tcg_pack_cards_subject_exclusif;
ALTER TABLE public.tcg_pack_cards
  ADD CONSTRAINT tcg_pack_cards_subject_exclusif CHECK (
    (subject_kind = 'player'
      AND card_user_id IS NOT NULL
      AND card_team_id IS NULL AND card_map_slug IS NULL
      AND card_fanart_id IS NULL AND card_mascot_slug IS NULL)
    OR (subject_kind = 'team'
      AND card_team_id IS NOT NULL
      AND card_user_id IS NULL AND card_map_slug IS NULL
      AND card_fanart_id IS NULL AND card_mascot_slug IS NULL)
    OR (subject_kind = 'map'
      AND card_map_slug IS NOT NULL
      AND card_user_id IS NULL AND card_team_id IS NULL
      AND card_fanart_id IS NULL AND card_mascot_slug IS NULL)
    OR (subject_kind = 'fanart'
      AND card_fanart_id IS NOT NULL
      AND card_user_id IS NULL AND card_team_id IS NULL
      AND card_map_slug IS NULL AND card_mascot_slug IS NULL)
    OR (subject_kind = 'mascot'
      AND card_mascot_slug IS NOT NULL
      AND card_user_id IS NULL AND card_team_id IS NULL
      AND card_map_slug IS NULL AND card_fanart_id IS NULL)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
