-- Migration : les échanges acceptent les CINQ types de carte.
-- Date: 2026-09-20
--
-- WHY:
--   `tcg_trade_items` ne portait que trois colonnes de sujet — joueuse, équipe,
--   map. Les cartes de FAN ART, ajoutées avant, et les cartes de MASCOTTE,
--   ajoutées le même jour que cette migration, étaient donc INÉCHANGEABLES : on
--   pouvait les ouvrir, les posséder, les voir, mais jamais les proposer.
--
--   Le trou ne se voyait pas parce qu'il ne produisait aucune erreur : la carte
--   n'apparaissait simplement pas dans ce qu'on peut offrir. Une collection
--   qu'on ne peut pas échanger n'est pas une collection — c'est le geste
--   central du TCG.
--
-- CAVEATS:
--   - Les deux CHECK sont RECRÉÉS, pas complétés : Postgres ne sait pas étendre
--     un CHECK. Les trois branches d'origine sont reprises à l'identique — les
--     relire est le seul moyen de vérifier qu'aucune n'a bougé.
--   - Le slug de mascotte n'est PAS une clé étrangère, comme celui des maps :
--     son vivier est un registre en mémoire. `card_fanart_id`, lui, en a une
--     comme dans `tcg_pack_cards`.
--   - Idempotente.

BEGIN;

ALTER TABLE public.tcg_trade_items
  ADD COLUMN IF NOT EXISTS card_fanart_id uuid,
  ADD COLUMN IF NOT EXISTS card_mascot_slug text;

COMMENT ON COLUMN public.tcg_trade_items.card_mascot_slug IS
  'Slug de la mascotte (registre utils/tcg/gameMascots.ts). Pas de FK : le vivier vit dans le code, comme celui des maps.';

ALTER TABLE public.tcg_trade_items
  DROP CONSTRAINT IF EXISTS tcg_trade_items_subject_kind_check;
ALTER TABLE public.tcg_trade_items
  ADD CONSTRAINT tcg_trade_items_subject_kind_check
  CHECK (subject_kind = ANY (ARRAY['player', 'team', 'map', 'fanart', 'mascot']));

ALTER TABLE public.tcg_trade_items
  DROP CONSTRAINT IF EXISTS tcg_trade_items_subject_exclusif;
ALTER TABLE public.tcg_trade_items
  ADD CONSTRAINT tcg_trade_items_subject_exclusif CHECK (
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
