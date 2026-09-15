-- Migration : un match qui a distribué des paquets TCG ne peut plus être
--             supprimé physiquement (défense en base).
-- Date: 2026-09-15
--
-- WHY:
--   `tcg_packs.source_match_id` était en `ON DELETE CASCADE` (create_tcg_tables.sql).
--   Supprimer physiquement un match de tournoi (`DELETE /api/admin/matches/[id]?hard=1`,
--   la suppression groupée d'une phase, ou la suppression d'un tournoi, qui
--   cascade sur ses matchs) effaçait EN SILENCE les paquets de victoire — et les
--   cartes déjà ouvertes, qui cascadent depuis leur paquet — alors que les pièces
--   restaient au registre. Recréer le match (nouvel id) repayait les mêmes
--   gagnantes.
--
--   Le code refuse désormais ces suppressions avec un message (`utils/tcg/paidMatches.ts`,
--   409 `MATCH_HAS_TCG_REWARDS`) ; cette contrainte est la ceinture sous les
--   bretelles : AUCUN chemin — présent ou futur, route, script, console SQL —
--   ne peut plus effacer des paquets gagnés en supprimant leur match. Il faut
--   annuler le match (suppression douce).
--
-- CAVEATS:
--   - `RESTRICT` et non `SET NULL` : `tcg_packs_source_coherent` exige un match
--     pour un paquet `victory`, et un paquet orphelin serait ingérable.
--   - Un match SANS paquet reste supprimable (brackets générés puis annulés,
--     miroirs de scrim non payés, nettoyage de `quick-bracket`).
--   - Effet de bord voulu : supprimer physiquement un TOURNOI dont un match a payé
--     échoue désormais (23503) au lieu d'effacer les collections.
--   - Idempotente (DROP IF EXISTS puis ADD). Aucune ligne n'est modifiée.

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_match_id_fkey;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_match_id_fkey
  FOREIGN KEY (source_match_id) REFERENCES public.matches(id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';
