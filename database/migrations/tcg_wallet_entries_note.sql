-- Migration : le motif d'une correction de solde devient lisible par la joueuse.
-- Date: 2026-09-15
--
-- WHY:
--   `POST /api/admin/tcg/grant` exige un motif, mais il n'avait pas de colonne :
--   il n'était écrit que dans `staff_logs`. L'historique de pièces de la
--   joueuse affichait donc « Ajustement par l'équipe », sans dire lequel —
--   exactement la ligne qu'on cherche à comprendre quand un solde bouge sans
--   qu'on ait joué. Le motif est désormais recopié dans le registre et rendu à
--   la joueuse (la carte staff l'annonce avant saisie).
--
-- CE QUE LA COLONNE N'EST PAS : un champ libre pour toutes les sources. Seul
--   `admin_grant` l'écrit, et `GET /api/player/tcg/wallet` ne la rend que pour
--   cette source — une note portée par un gain automatique n'aurait pas
--   d'auteur à qui la rattacher.
--
-- CAVEATS:
--   - Purement ADDITIVE : colonne NULLABLE, aucune ligne existante n'est touchée.
--   - Bornée à 500 caractères, la même borne que la validation de la route.
--   - ⚠️ ORDRE DE DÉPLOIEMENT : APPLIQUER AVANT le code qui écrit `note`. Sans
--     la colonne, l'insertion de la correction échoue (PGRST204) et la route
--     répond 500 — aucune pièce n'est créditée à tort, mais aucune ne l'est.

ALTER TABLE public.tcg_wallet_entries
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_note_length;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_note_length
  CHECK (note IS NULL OR char_length(note) <= 500);

COMMENT ON COLUMN public.tcg_wallet_entries.note IS
  'Motif d''une correction manuelle (source_kind = admin_grant), visible par la joueuse dans son historique. NULL pour les gains automatiques.';

NOTIFY pgrst, 'reload schema';
