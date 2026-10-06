-- Migration : effacer les « motifs » techniques des refus capitaine.
-- Date: 2026-10-06
--
-- WHY. Un refus de demande d'adhésion / de transfert par la capitaine écrivait
--   `staff_note = 'Traite par le capitaine (<uuid>)'`. Or `staff_note` est
--   affiché à la candidate, dans l'historique de ses demandes, sous la forme
--   « Motif : … » : elle lisait un identifiant interne en guise de raison.
--   Le code n'écrit plus que le motif FACULTATIF saisi par la capitaine
--   (features/player/team/service/demandes.ts) ; cette migration nettoie les
--   lignes déjà écrites.
--
-- WHAT. Remet `staff_note` à NULL sur les demandes `join` / `transfer`
--   refusées dont la note est exactement ce gabarit. Aucune autre note n'est
--   touchée (un motif saisi par le staff reste en place).
--
-- CAVEATS:
--   - Idempotente : un second passage ne trouve plus rien.
--   - Perte assumée : l'uuid de l'auteur du refus disparaît de `staff_note`.
--     Il n'y servait pas d'audit (champ libre, montré à la joueuse) ; les
--     nouveaux refus tracent leur auteur dans `payload.rejected_by_user_id`.
--   - Rollback : aucun (donnée sans valeur pour la joueuse).
--   - Le code fonctionne sans elle : seules les lignes antérieures continuent
--     d'afficher l'ancien texte tant qu'elle n'est pas appliquée.

UPDATE public.demandes
   SET staff_note = NULL
 WHERE type IN ('join', 'transfer')
   AND status = 'rejected'
   AND staff_note ~ '^Traite par le capitaine \([0-9a-fA-F-]{36}\)$';
